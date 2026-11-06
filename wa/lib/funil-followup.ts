// Follow-up automático por coluna do funil (o da migration 066 do Chatrun).
// Chamado pelo worker /api/wa/workers/funil-followup a cada 15 minutos.
//
// Para cada coluna com follow-up ligado, as conversas que estão nela (a mesma
// regra do quadro, `filtroDaColuna`) e que pararam na NOSSA mensagem há mais
// que o prazo recebem um toque, até o máximo da coluna:
//   • janela de 24h aberta: o texto da coluna com {{nome}}, ou a IA do dono
//     escreve lendo a conversa (modo "ia", com o texto como orientação; uma
//     chamada por toque). Sem IA disponível, o toque não sai;
//   • janela fechada: o template aprovado da coluna. Sem template, pula.
// A resposta do cliente zera a contagem (wa/lib/inbound.ts); em outra coluna
// a contagem recomeça.
//
// Não empilha: conversa com cadência de campanha pendente (WaFollowup) fica
// com a da campanha, e nada sai com menos de 12h de outra automática.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation, WaFollowup } from "@wa/models/wa";
import { channelForConversation } from "@wa/lib/channels";
import { colunasComFollowupLigado, colunasDo, filtroDaColuna, type ColunaComFollowup } from "@wa/lib/funil";
import {
  HORA_MS,
  PISO_DO_FOLLOWUP_MS,
  horarioPermitido,
  motivoParaNaoTocar,
  preencherTexto,
  primeiroNome,
  toquesNaColuna,
} from "@wa/lib/automacoes";
import {
  Rodada,
  concluirEnvio,
  enviarAutomatico,
  escreverFollowupComIa,
  reservarEnvio,
} from "@wa/lib/envio-automatico";
import type { FunilColuna } from "@wa/lib/stages";

export type ResultadoDoFollowup = { sent: number; skipped: number; failed: number };

export async function runFunilFollowups(opts: { maxEnvios?: number; prazoMs?: number } = {}): Promise<ResultadoDoFollowup> {
  const maxEnvios = opts.maxEnvios ?? 25;
  const res: ResultadoDoFollowup = { sent: 0, skipped: 0, failed: 0 };
  // Follow-up às 3h da manhã é pior que follow-up nenhum.
  if (!horarioPermitido()) return res;

  await dbConnect();
  const ligadas = await colunasComFollowupLigado();
  if (ligadas.length === 0) return res;
  const rodada = new Rodada(opts.prazoMs);

  const porDono = new Map<string, ColunaComFollowup[]>();
  for (const c of ligadas) {
    const k = c.tenantId ?? "cnv";
    porDono.set(k, [...(porDono.get(k) ?? []), c]);
  }

  for (const colunasLigadas of porDono.values()) {
    if (res.sent >= maxEnvios || rodada.esgotada) break;
    const tenantId = colunasLigadas[0].tenantId;
    const dono = await rodada.dono(tenantId);
    // Loja sem automações, sem funil ou com a assinatura parada: nada sai.
    if (!dono.liberado || (dono.recursos && !dono.recursos.funil)) continue;
    const todas = await colunasDo(tenantId);

    for (const col of colunasLigadas) {
      if (res.sent >= maxEnvios || rodada.esgotada) break;
      const coluna = todas.find((c) => c.id === col.id);
      if (!coluna) continue;
      await tocarColuna(rodada, col, coluna, todas, res, maxEnvios);
    }
  }
  return res;
}

async function tocarColuna(
  rodada: Rodada,
  col: ColunaComFollowup,
  coluna: FunilColuna,
  todas: FunilColuna[],
  res: ResultadoDoFollowup,
  maxEnvios: number,
): Promise<void> {
  const cfg = col.followup;
  const tenantId = col.tenantId;
  const agora = Date.now();
  const prazo = new Date(agora - cfg.horas * HORA_MS);
  const piso = new Date(agora - cfg.horas * HORA_MS - PISO_DO_FOLLOWUP_MS);
  const colId = new mongoose.Types.ObjectId(col.id);

  const candidatas = await WaConversation.find({
    $and: [
      { tenantId },
      filtroDaColuna(coluna, todas),
      { status: { $nin: ["closed", "waiting_human"] } },
      { lastMessageAt: { $lt: prazo, $gte: piso } },
      { $or: [{ followupLastAt: null }, { followupLastAt: { $lt: prazo } }] },
      // Em outra coluna a contagem recomeça; nesta, até o máximo.
      { $or: [{ followupColunaId: { $ne: colId } }, { followupCount: { $lt: cfg.maximo } }] },
    ],
  })
    // Quem nunca recebeu primeiro; depois, o toque mais antigo.
    .sort({ followupLastAt: 1, lastMessageAt: -1 })
    .limit(200)
    .lean();

  for (const conv of candidatas) {
    if (res.sent >= maxEnvios || rodada.esgotada) return;
    if (motivoParaNaoTocar(conv, cfg, col.id, agora)) {
      res.skipped++;
      continue;
    }
    // A cadência da campanha cuida desta conversa: não sai um toque em cima do outro.
    if (await WaFollowup.exists({ conversationId: conv._id, status: "pending" })) {
      res.skipped++;
      continue;
    }
    const contato = await WaContact.findById(conv.contactId).select("phone name optOut").lean();
    if (!contato || contato.optOut) {
      res.skipped++;
      continue;
    }
    const canal = await channelForConversation(conv);
    // SMS: cada mensagem é paga e lá só a equipe fala.
    if (canal.kind === "sms") {
      res.skipped++;
      continue;
    }

    // Reserva o toque antes de qualquer coisa: duas rodadas do cron não podem
    // mandar o mesmo follow-up duas vezes. A reserva já conta o toque; quem
    // não envia devolve a contagem mas mantém a data, para a conversa só
    // voltar à fila depois de outro prazo (sem isso, a que nunca pode receber
    // ocuparia a fila para sempre).
    const toques = toquesNaColuna(conv, col.id);
    const reserva = await WaConversation.updateOne(
      { _id: conv._id, followupLastAt: conv.followupLastAt ?? null },
      { $set: { followupCount: toques + 1, followupLastAt: new Date(), followupColunaId: colId } },
    );
    if (reserva.matchedCount === 0) {
      res.skipped++;
      continue;
    }
    const devolver = () => WaConversation.updateOne({ _id: conv._id }, { $set: { followupCount: toques } });

    const horasParado = (agora - new Date(conv.lastMessageAt ?? agora).getTime()) / HORA_MS;
    const dados = { nome: primeiroNome(contato.name), nome_completo: contato.name ?? "", loja: (await rodada.dono(tenantId)).nome };
    const saida = await enviarAutomatico(rodada, {
      tenantId,
      contact: contato,
      conversation: conv,
      texto: async () => {
        if (cfg.modo === "ia") {
          const t = await escreverFollowupComIa(rodada, {
            tenantId,
            conversationId: String(conv._id),
            contactName: contato.name,
            horasParado,
            etapa: col.name,
            orientacao: cfg.texto,
          });
          return t ? { texto: t, como: "ia" } : null;
        }
        const t = preencherTexto(cfg.texto, dados);
        return t ? { texto: t, como: "texto" } : null;
      },
      template: cfg.template ? { nome: cfg.template, idioma: cfg.templateIdioma, vars: cfg.templateVars } : null,
      dados,
    });

    if (saida.situacao !== "enviada") await devolver();
    if (saida.situacao === "enviada") res.sent++;
    else if (saida.situacao === "falhou") res.failed++;
    else res.skipped++;

    // Histórico na tela de automações. O que não saiu se repetiria a cada
    // prazo pelo mesmo motivo; fica só o primeiro.
    const evento = saida.situacao === "enviada" ? `toque${toques + 1}` : `${saida.situacao}:${saida.motivo ?? ""}`;
    const envio = await reservarEnvio({
      tenantId,
      tipo: "funil",
      chave: `${String(conv._id)}:${col.id}:${conv.lastInboundAt ? new Date(conv.lastInboundAt).getTime() : 0}:${evento}`.slice(0, 400),
      contactId: contato._id,
      conversationId: conv._id,
    }).catch(() => null);
    if (envio) await concluirEnvio(envio, saida).catch(() => {});
  }
}
