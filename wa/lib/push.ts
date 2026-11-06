// Avisos no navegador (Web Push) para a equipe: conversa nova na fila,
// conversa transferida para a pessoa e mensagem nova numa conversa dela.
//
// Sem app instalável de propósito (decisão do dono): não há manifest nem
// PWA, só o service worker de public/sw-push.js, que mostra o aviso e abre a
// conversa no clique. Consequência: no iPhone (iOS 16.4+) o Safari só entrega
// push para site instalado na Tela de Início, então quem usa iPhone recebe os
// avisos só se adicionar o painel lá; no Android e no computador funciona com
// o navegador comum.
//
// Chaves VAPID por ambiente. Gerar uma vez: npx web-push generate-vapid-keys
//   VAPID_PUBLIC_KEY=<chave pública>
//   VAPID_PRIVATE_KEY=<chave privada>
//   VAPID_SUBJECT=mailto:contato@dominio.com.br
// Sem as chaves, a função some sem erro: a moldura não mostra o sino e nada
// é enviado.

import webpush from "web-push";
import dbConnect from "@/lib/mongodb";
import { WaAtendente, WaPushInscricao } from "@wa/models/operacao";
import { FOCO_MAX_MS } from "@wa/lib/equipe";
import { emailsDaEquipe } from "@wa/lib/equipe-loja";
import { siteUrl } from "@wa/lib/site-url";

let configurado: boolean | null = null;

export function chavePublicaPush(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function pushConfigurado(): boolean {
  if (configurado !== null) return configurado;
  const publica = chavePublicaPush();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publica || !privada) {
    configurado = false;
    return false;
  }
  try {
    // O "subject" tem que ser mailto: ou https:. Sem a variável, o endereço do
    // próprio site serve (os serviços de push só o usam para contato).
    const subject = process.env.VAPID_SUBJECT?.trim() || siteUrl().replace(/^http:/, "https:");
    webpush.setVapidDetails(subject, publica, privada);
    configurado = true;
  } catch (err) {
    console.error("[push] chaves VAPID inválidas:", err instanceof Error ? err.message : err);
    configurado = false;
  }
  return configurado;
}

export type AvisoPush = {
  titulo: string;
  corpo?: string;
  /** Caminho aberto no clique (a conversa na Central). */
  url: string;
  /** Mesma tag troca o aviso anterior (uma linha por conversa). */
  tag?: string;
};

/** Caminho da conversa na Central do painel certo (loja ou CNV). */
export function urlDaConversa(tenantId: string | null, conversationId: string): string {
  const base = tenantId ? "/dashboard/atendimento" : "/dashboard/admin/whatsapp";
  return `${base}/central?c=${encodeURIComponent(conversationId)}`;
}

/**
 * Manda o aviso para os aparelhos das pessoas. Quem está com o painel aberto
 * e na frente não recebe (a tela já mostra). Nunca lança e nunca segura quem
 * chama por mais de alguns segundos (webhook da Meta, worker da IA).
 */
export async function enviarPush(params: {
  tenantId: string | null;
  emails: string[];
  aviso: AvisoPush;
}): Promise<number> {
  if (!pushConfigurado()) return 0;
  const emails = [...new Set(params.emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
  if (!emails.length) return 0;
  const tarefa = entregar(params.tenantId, emails, params.aviso).catch((err) => {
    console.warn("[push] falhou:", err instanceof Error ? err.message : err);
    return 0;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<number>((r) => {
    timer = setTimeout(() => r(0), 5000);
  });
  try {
    return await Promise.race([tarefa, teto]);
  } finally {
    clearTimeout(timer);
  }
}

async function entregar(tenantId: string | null, emails: string[], aviso: AvisoPush): Promise<number> {
  await dbConnect();
  // Tirar alguém da equipe não passa pelos aparelhos dele: a inscrição fica.
  // Sem esta conferência, o ex-funcionário seguiria recebendo o nome e a
  // mensagem dos clientes da loja (o responsável antigo de uma conversa, o
  // registro de Online que ainda não venceu). Quem saiu perde a inscrição.
  const equipe = await emailsDaEquipe(tenantId);
  const sairam = emails.filter((e) => !equipe.has(e));
  if (sairam.length) await WaPushInscricao.deleteMany({ tenantId, email: { $in: sairam } });
  const daEquipe = emails.filter((e) => equipe.has(e));
  if (!daEquipe.length) return 0;

  const focados = await WaAtendente.find({
    tenantId,
    email: { $in: daEquipe },
    foco: true,
    vistoEm: { $gt: new Date(Date.now() - FOCO_MAX_MS) },
  })
    .select("email")
    .lean();
  const naTela = new Set(focados.map((f) => f.email));
  const destino = daEquipe.filter((e) => !naTela.has(e));
  if (!destino.length) return 0;

  const inscricoes = await WaPushInscricao.find({ tenantId, email: { $in: destino } }).lean();
  if (!inscricoes.length) return 0;
  const corpo = JSON.stringify({
    title: aviso.titulo.slice(0, 120),
    body: (aviso.corpo ?? "").slice(0, 240),
    url: aviso.url,
    tag: aviso.tag,
  });

  const vencidas: string[] = [];
  const usadas: string[] = [];
  await Promise.all(
    inscricoes.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          corpo,
          // 20 min: celular sem sinal por mais que isso perde o aviso (a
          // conversa continua na Central).
          { TTL: 1200, urgency: "high", timeout: 8000 },
        );
        usadas.push(String(s._id));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // Aparelho que cancelou a inscrição ou limpou o navegador: sai da lista.
        if (status === 404 || status === 410) vencidas.push(String(s._id));
        else console.warn("[push] aviso não entregue:", status ?? (err instanceof Error ? err.message : err));
      }
    }),
  );
  if (vencidas.length) await WaPushInscricao.deleteMany({ _id: { $in: vencidas } });
  if (usadas.length) await WaPushInscricao.updateMany({ _id: { $in: usadas } }, { ultimoUsoEm: new Date() });
  return usadas.length;
}
