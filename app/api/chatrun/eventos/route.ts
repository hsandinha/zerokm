// Eventos do Chatrun Conexão (callback da plataforma "zerokm" no gateway).
//
// Rota pública: quem garante a origem é a assinatura HMAC com o
// CHATRUN_CALLBACK_SECRET. Tudo é idempotente (mensagem por wamid, status e
// canal por id), porque o gateway reentrega o que não recebeu 2xx.
//
//   connection.connected / .updated → canal do dono (external_ref = WaStore._id
//                                     da loja, ou "cnv" para a Vera)
//   connection.error / .disconnected → situação do canal
//   message.received                → WhatsApp: mesma entrada do webhook da Meta;
//                                     Instagram/Messenger: o Direct normalizado
//   message.echo                    → a conta respondeu pelo celular/app (IA pausa)
//   message.status                  → enviada / entregue / lida / falhou
//   instagram.comment(_reply),
//   messenger.comment(_reply)       → iscas de comentário (wa/lib/iscas-eventos.ts)

import { NextResponse } from "next/server";
import { validSignature, type ChatrunConnection } from "@wa/lib/chatrun";
import { setChatrunChannelStatus, upsertChatrunChannel } from "@wa/lib/chatrun-channels";
import { channelByChatrunConnection } from "@wa/lib/channels";
import type { MetaWebhookMessage, MetaWebhookStatus, MetaWebhookValue } from "@wa/lib/meta";
import { processWhatsappValue, wakeAiWorker } from "@wa/lib/whatsapp-webhook";
import { processInbound } from "@wa/lib/inbound";
import { ecoDoPerfil, entradaDoPerfil, type ContatoDoPerfil, type MensagemDoPerfil } from "@wa/lib/chatrun-perfil";
import { origemDoDirectOuMessenger, type ReferralMeta } from "@wa/lib/origem";
import { EVENTOS_DE_ISCA, eventoDeIsca } from "@wa/lib/iscas-eventos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Evento = {
  id?: string;
  type?: string;
  connection?: (ChatrunConnection & Record<string, unknown>) | null;
  data?: Record<string, unknown>;
};

/** Mensagem como o gateway guarda: `payload` é a mensagem original da Meta. */
type MensagemGateway = {
  wamid?: string;
  type?: string;
  text?: string | null;
  contact_phone?: string;
  message_at?: string;
  payload?: Record<string, unknown> | null;
  /** wamid citado quando a mensagem é uma resposta (o gateway guarda à parte). */
  context_wamid?: string | null;
};

const STATUS_DA_META = new Set(["sent", "delivered", "read", "failed"]);

function segundos(iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  return String(Math.floor((Number.isNaN(t) ? Date.now() : t) / 1000));
}

/** A mensagem da Meta de volta (o gateway manda o payload original). */
function mensagemDaMeta(m: MensagemGateway, telefone: string | undefined): MetaWebhookMessage | null {
  // A citação vem no payload da Meta; quando não vem, o gateway ainda manda
  // o context_wamid, e a Central mostra a mensagem citada do mesmo jeito.
  const contexto = m.context_wamid ? { context: { id: m.context_wamid } } : {};
  if (m.payload && typeof m.payload === "object" && m.payload.id) {
    const original = m.payload as unknown as MetaWebhookMessage;
    return original.context?.id ? original : { ...original, ...contexto };
  }
  // Sem payload: o mínimo para virar texto na conversa.
  if (!m.wamid || !telefone) return null;
  return {
    from: telefone,
    id: m.wamid,
    timestamp: segundos(m.message_at),
    type: m.text ? "text" : m.type ?? "text",
    ...(m.text ? { text: { body: m.text } } : {}),
    ...contexto,
  };
}

/** O evento no formato de uma mudança do webhook da Meta (ou null se não for mensagem). */
function valorDoEvento(evento: Evento): MetaWebhookValue | null {
  const dados = evento.data ?? {};
  const metadata = {
    phone_number_id: evento.connection?.phone_number_id ?? "",
    display_phone_number: evento.connection?.display_phone ?? "",
  };

  if (evento.type === "message.received") {
    const contato = (dados.contact ?? {}) as { phone?: string; name?: string | null };
    let m = mensagemDaMeta((dados.message ?? {}) as MensagemGateway, contato.phone);
    if (!m) return null;
    // Anúncio de clique para WhatsApp: vem no payload da Meta; sem payload, o
    // gateway ainda manda o referral à parte (data.referral).
    if (dados.referral && typeof dados.referral === "object" && !("referral" in m)) {
      m = { ...m, referral: dados.referral } as MetaWebhookMessage;
    }
    return {
      metadata,
      contacts: contato.name ? [{ wa_id: m.from, profile: { name: contato.name } }] : [],
      messages: [m],
    };
  }

  if (evento.type === "message.echo") {
    const bruta = (dados.message ?? {}) as MensagemGateway;
    const p = (bruta.payload ?? {}) as Record<string, unknown>;
    const id = (p.id as string | undefined) ?? bruta.wamid;
    const to = (p.to as string | undefined) ?? bruta.contact_phone;
    if (!id || !to) return null;
    const texto = (p.text as { body?: string } | undefined)?.body ?? bruta.text ?? undefined;
    return {
      metadata,
      message_echoes: [
        {
          from: (p.from as string | undefined) ?? metadata.display_phone_number,
          to,
          id,
          type: (p.type as string | undefined) ?? bruta.type ?? "text",
          ...(texto ? { text: { body: texto } } : {}),
        },
      ],
    };
  }

  if (evento.type === "message.status") {
    const wamid = dados.wamid as string | undefined;
    const status = dados.status as string | undefined;
    if (!wamid || !status || !STATUS_DA_META.has(status)) return null;
    const s: MetaWebhookStatus = {
      id: wamid,
      status: status as MetaWebhookStatus["status"],
      recipient_id: (dados.contact_phone as string | undefined) ?? "",
      ...(Array.isArray(dados.errors) ? { errors: dados.errors as MetaWebhookStatus["errors"] } : {}),
    };
    return { metadata, statuses: [s] };
  }

  return null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let evento: Evento;
  try {
    evento = JSON.parse(raw) as Evento;
  } catch {
    return NextResponse.json({ ok: true });
  }
  const conexao = evento.connection ?? null;
  const dados = evento.data ?? {};

  try {
    switch (evento.type) {
      case "connection.connected":
      case "connection.updated": {
        const c = ((dados.connection as ChatrunConnection | undefined) ?? conexao) as ChatrunConnection | null;
        const loja = conexao?.external_ref ?? null;
        if (c?.id && loja) {
          const r = await upsertChatrunChannel(c, loja);
          if (!r.ok) console.warn("[chatrun] conexão não virou canal:", r.reason);
        }
        return NextResponse.json({ ok: true });
      }
      case "connection.error": {
        if (conexao?.id) {
          const msg = typeof dados.message === "string" ? dados.message : "Precisa reconectar o WhatsApp.";
          await setChatrunChannelStatus(conexao.id, "error", msg);
        }
        return NextResponse.json({ ok: true });
      }
      case "connection.disconnected": {
        if (conexao?.id) await setChatrunChannelStatus(conexao.id, "disconnected");
        return NextResponse.json({ ok: true });
      }
    }

    if (!conexao?.id) return NextResponse.json({ ok: true });

    // Iscas de comentário (Instagram e Página): o comentário e o que a isca
    // fez com ele. Fora do caminho de mensagem: não acorda a IA.
    if (evento.type && EVENTOS_DE_ISCA.has(evento.type)) {
      const canalDaIsca = await channelByChatrunConnection(conexao.id);
      if (canalDaIsca) await eventoDeIsca(canalDaIsca, evento.type, dados);
      return NextResponse.json({ ok: true });
    }

    const tipoDoCanal = (dados.channel as string | undefined) ?? conexao.channel ?? "whatsapp";
    const perfil = tipoDoCanal === "instagram" || tipoDoCanal === "messenger";
    const mensagem = evento.type === "message.received" || evento.type === "message.echo";
    const valor = perfil && mensagem ? null : valorDoEvento(evento);
    if (!valor && !(perfil && mensagem)) return NextResponse.json({ ok: true });

    let canal = await channelByChatrunConnection(conexao.id);
    if (!canal && conexao.external_ref) {
      // Mensagem chegou antes do retorno do convite: o canal nasce aqui.
      const r = await upsertChatrunChannel(conexao, conexao.external_ref);
      if (r.ok) canal = await channelByChatrunConnection(conexao.id);
    }
    if (!canal) return NextResponse.json({ ok: true, ignorado: "canal desconhecido" });

    // Direct do Instagram e Messenger: o gateway já manda normalizado.
    if (perfil && mensagem && (canal.kind === "instagram" || canal.kind === "messenger")) {
      const m = (dados.message ?? {}) as MensagemDoPerfil;
      const contato = (dados.contact ?? {}) as ContatoDoPerfil;
      if (evento.type === "message.echo") {
        await ecoDoPerfil(canal, m, contato);
        return NextResponse.json({ ok: true });
      }
      const entrada = entradaDoPerfil(canal.kind, m, contato);
      if (entrada) {
        // Messenger (e o Direct, quando o gateway repassar): o referral do
        // anúncio de clique para mensagem vem em data.referral.
        const anuncio = origemDoDirectOuMessenger(canal.kind, dados.referral as ReferralMeta | null | undefined);
        await processInbound(canal, anuncio ? { ...entrada, anuncio } : entrada);
        wakeAiWorker(req);
      }
      return NextResponse.json({ ok: true });
    }
    if (!valor) return NextResponse.json({ ok: true });

    const { hadInbound } = await processWhatsappValue(canal, valor);
    if (hadInbound) wakeAiWorker(req);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // 5xx: o gateway reentrega (tudo aqui é idempotente).
    console.error("[chatrun] evento falhou:", evento.type, err);
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }
}
