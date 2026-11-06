// Worker do lembrete da véspera: cron a cada 30 minutos (vercel.json).
//
// Visita ou test drive CONFIRMADO para amanhã recebe um lembrete, uma vez:
//   - janela aberta (o cliente escreveu nas últimas 24h): texto livre;
//   - janela fechada, no WhatsApp, com template escolhido na configuração da
//     agenda: o template, com {{1}} nome, {{2}} dia, {{3}} horário, {{4}}
//     loja e {{5}} carro;
//   - sem como mandar (sem template, Direct/Messenger fora da janela, sem
//     conversa ligada, template que pede o que a agenda não tem) e no SMS: só
//     avisa a equipe, com uma tarefa para o responsável ligar ou escrever. SMS
//     nunca recebe mensagem automática (cada uma é paga pela loja, regra de
//     wa/lib/envio-automatico.ts).
// "A confirmar" não recebe: a equipe ainda não combinou o horário com o
// cliente. Quem pediu para não receber mensagens (opt-out) é pulado.
//
// Só roda entre 9h e 20h de Brasília (lembrete de madrugada é pior que
// nenhum) e não lembra o que foi confirmado há menos de 6h: acabou de
// combinar. Cada agendamento é reservado antes do envio (lembrete.em), então
// duas rodadas ao mesmo tempo não mandam duas vezes.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaAgendamento, type IWaAgendamento } from "@wa/models/agenda";
import { WaContact, WaConversation } from "@wa/models/wa";
import type { IWaStore } from "@wa/models/store";
import type { Recursos } from "@/lib/recursos";
import { getStore, recursosDaLoja, storeIsActive } from "@wa/lib/store";
import { channelForConversation, wabaCredentialsOf } from "@wa/lib/channels";
import { formaDoTemplate, listTemplates, podeUsarTemplates, type FormaDoTemplate } from "@wa/lib/meta";
import { isWithin24hWindow, sendAndLogTemplate, sendAndLogText } from "@wa/lib/send";
import { extrasDoEnvio, textoDoTemplate } from "@wa/lib/template-envio";
import {
  CONFIG_PADRAO,
  hojeEmSaoPaulo,
  horaLocal,
  instanteLocal,
  somarDias,
  textoDoLembrete,
  variaveisDoLembrete,
  type ConfigAgenda,
  type DadosDoLembrete,
} from "@wa/lib/agenda";
import { configDaAgenda } from "@wa/lib/agenda-server";
import { criarTarefa } from "@wa/lib/tarefas";

export const maxDuration = 300;

const BATCH = 100;
const SPACING_MS = 300;
const HORA = 3600_000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Loja = { store: IWaStore | null; recursos: Recursos | null; config: ConfigAgenda | null; ativa: boolean };
type Resultado = { via: "texto" | "template" | "equipe" | "pulado"; erro?: string | null };

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agora = Date.now();
  const horaBr = Number(horaLocal(agora).slice(0, 2));
  if (horaBr < 9 || horaBr >= 20) return NextResponse.json({ skipped: "fora do horário de lembrete" });

  await dbConnect();
  const amanha = somarDias(hojeEmSaoPaulo(agora), 1);
  const limite = new Date(agora - 6 * HORA);
  const pendentes = await WaAgendamento.find({
    status: "confirmado",
    inicio: { $gte: new Date(instanteLocal(amanha, "00:00")), $lt: new Date(instanteLocal(somarDias(amanha, 1), "00:00")) },
    "lembrete.em": null,
    $or: [{ confirmadoEm: { $lte: limite } }, { confirmadoEm: null, createdAt: { $lte: limite } }],
  })
    .sort({ inicio: 1 })
    .limit(BATCH);

  const lojas = new Map<string, Loja>();
  async function lojaDe(tenantId: string | null): Promise<Loja> {
    const chave = tenantId ?? "cnv";
    const pronta = lojas.get(chave);
    if (pronta) return pronta;
    const store = await getStore(tenantId);
    const loja: Loja = store
      ? { store, recursos: await recursosDaLoja(store), config: await configDaAgenda(tenantId), ativa: storeIsActive(store) }
      : { store: null, recursos: null, config: null, ativa: false };
    lojas.set(chave, loja);
    return loja;
  }

  // Uma leitura de templates por loja por rodada.
  const formas = new Map<string, Map<string, FormaDoTemplate & { language: string }>>();
  async function formaDe(tenantId: string | null, nome: string) {
    const chave = tenantId ?? "cnv";
    let mapa = formas.get(chave);
    if (!mapa) {
      mapa = new Map();
      const creds = await wabaCredentialsOf(tenantId);
      if (podeUsarTemplates(creds)) {
        for (const t of await listTemplates(creds)) {
          if (t.status === "APPROVED") mapa.set(t.name, { ...formaDoTemplate(t), language: t.language });
        }
      }
      formas.set(chave, mapa);
    }
    return mapa.get(nome) ?? null;
  }

  async function avisarEquipe(a: IWaAgendamento, dados: DadosDoLembrete, motivo: string): Promise<Resultado> {
    const oQue = a.tipo === "test_drive" ? "do test drive" : "da visita";
    await criarTarefa({
      tenantId: a.tenantId,
      titulo: `Lembrar ${dados.nome || "o cliente"} ${oQue} de amanhã às ${horaLocal(a.inicio)}`,
      descricao: `${motivo} Ligue ou escreva para confirmar.`,
      prazo: new Date(Math.min(Date.now() + 2 * HORA, instanteLocal(hojeEmSaoPaulo(), "20:00"))),
      responsavel: a.responsavel ?? null,
      conversationId: a.conversationId ?? null,
      contactId: a.contactId ?? null,
      contatoNome: a.contatoNome ?? null,
      agendamentoId: String(a._id),
      origem: "agenda",
      criadoPor: "Agenda",
    });
    return { via: "equipe", erro: motivo };
  }

  async function lembrar(a: IWaAgendamento): Promise<Resultado> {
    const loja = await lojaDe(a.tenantId ?? null);
    if (!loja.store || !loja.recursos) return { via: "pulado", erro: "loja não encontrada" };
    if (!loja.recursos.atendimento || !loja.recursos.agenda) return { via: "pulado", erro: "agenda desligada" };
    if (!loja.ativa) return { via: "pulado", erro: "assinatura do atendimento inativa" };
    const cfg = loja.config?.lembrete ?? CONFIG_PADRAO.lembrete;
    if (!cfg.ativo) return { via: "pulado", erro: "lembrete desligado na agenda" };

    const dados: DadosDoLembrete = {
      nome: a.contatoNome ?? null,
      tipo: a.tipo,
      inicio: a.inicio,
      loja: loja.store.name,
      veiculo: a.veiculo ?? null,
    };
    if (!a.conversationId) return avisarEquipe(a, dados, "O agendamento não está ligado a uma conversa.");
    const conv = await WaConversation.findById(a.conversationId);
    const contact = conv ? await WaContact.findById(conv.contactId) : null;
    if (!conv || !contact) return avisarEquipe(a, dados, "A conversa do agendamento não existe mais.");
    if (contact.optOut) return { via: "pulado", erro: "o cliente pediu para não receber mensagens" };
    dados.nome = dados.nome || contact.name || null;

    const channel = await channelForConversation(conv);
    const conversationId = String(conv._id);
    if (channel.kind === "sms") {
      return avisarEquipe(a, dados, "A conversa é por SMS, que não recebe mensagem automática (cada SMS é pago pela loja).");
    }
    // Mensagem do sistema não usa a tag de atendimento humano: no Direct e no
    // Messenger também vale a janela de 24h.
    if (isWithin24hWindow(conv.lastInboundAt)) {
      try {
        await sendAndLogText({ conversationId, to: contact.phone, text: textoDoLembrete(dados), sender: "system" });
        return { via: "texto" };
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        return avisarEquipe(a, dados, `O lembrete não saiu: ${motivo.slice(0, 200)}`);
      }
    }
    if (channel.kind !== "whatsapp") {
      return avisarEquipe(a, dados, "O cliente não escreve há mais de 24h e neste canal só dá para responder dentro da janela.");
    }
    if (!cfg.templateName) {
      return avisarEquipe(a, dados, "O cliente não escreve há mais de 24h e a agenda não tem template de lembrete.");
    }
    try {
      const forma = await formaDe(a.tenantId ?? null, cfg.templateName);
      if (!forma) throw new Error(`O template "${cfg.templateName}" não está aprovado no WhatsApp da loja.`);
      const vars = variaveisDoLembrete(dados);
      if (forma.bodyVars > vars.length) {
        throw new Error(`O template "${cfg.templateName}" pede ${forma.bodyVars} variáveis; a agenda preenche até ${vars.length}.`);
      }
      const bodyParams = vars.slice(0, forma.bodyVars);
      const extras = extrasDoEnvio(forma, { headerTexto: vars[0] });
      await sendAndLogTemplate({
        conversationId,
        to: contact.phone,
        templateName: cfg.templateName,
        language: cfg.templateLanguage || forma.language || "pt_BR",
        bodyParams,
        headerParams: extras.headerParams,
        buttonUrlParams: extras.buttonUrlParams,
        renderedText: textoDoTemplate(forma, bodyParams, vars[0]),
      });
      return { via: "template" };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      return avisarEquipe(a, dados, `O lembrete pelo template não saiu: ${motivo.slice(0, 200)}`);
    }
  }

  const contagem: Record<string, number> = { texto: 0, template: 0, equipe: 0, pulado: 0, erro: 0 };
  for (const a of pendentes) {
    // Reserva: a rodada que marcar primeiro é a que trata.
    const reservado = await WaAgendamento.findOneAndUpdate(
      { _id: a._id, "lembrete.em": null },
      { $set: { "lembrete.em": new Date() } },
      { new: true },
    );
    if (!reservado) continue;
    let r: Resultado;
    try {
      r = await lembrar(reservado);
    } catch (err) {
      contagem.erro++;
      r = { via: "pulado", erro: (err instanceof Error ? err.message : String(err)).slice(0, 300) };
    }
    contagem[r.via]++;
    await WaAgendamento.updateOne(
      { _id: reservado._id },
      { $set: { "lembrete.via": r.via, "lembrete.erro": r.erro ?? null } },
    );
    await new Promise((ok) => setTimeout(ok, SPACING_MS));
  }

  return NextResponse.json({ amanha, pendentes: pendentes.length, ...contagem });
}
