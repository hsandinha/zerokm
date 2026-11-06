// "Enviar carro do estoque" na Central: busca no MESMO estoque que a IA da
// loja oferece (buscar_estoque em wa/lib/ai-loja.ts, com as regras de
// visibilidade de wa/lib/estoque.ts e os recursos que o CNV liberou) e manda
// o carro na conversa:
//   - do pátio: até 3 fotos (a capa primeiro) pelo link público assinado e o
//     cartão com a ficha (wa/lib/enviar-carro.ts);
//   - 0km e repasse: a foto do catálogo com o cartão na legenda, como antes.
//
// O envio refaz a busca e acha o carro pelo código: preço e dados saem do
// banco, nunca do que a tela mandou. Carro reservado, vendido ou pausado não
// aparece na busca, então também não sai.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { WaContact } from "@wa/models/wa";
import { getStore } from "@wa/lib/store";
import { buscarEstoque, type FiltrosEstoque } from "@wa/lib/estoque";
import { aplicarRecursos } from "@wa/lib/ai-loja";
import { channelForConversation } from "@wa/lib/channels";
import { MetaApiError } from "@wa/lib/meta";
import { podeMandarLivre, sendAndLogMedia, sendAndLogText } from "@wa/lib/send";
import { MidiaError, linkDaMidia, salvarMidiaSaida } from "@wa/lib/midia-saida";
import { siteUrl } from "@wa/lib/site-url";
import { autorDoEscopo, conversaDoEscopo, humanoRespondeu } from "@wa/lib/central";
import { cartaoDoCarro } from "@wa/lib/estoque-ficha";
import { enviarCarroDoPatio } from "@wa/lib/enviar-carro";
import { ligarCarroNaConversa } from "@wa/lib/conversoes-meta-servidor";

export const maxDuration = 60;

async function lojaComRecursos(user: Scope) {
  if (!user.tenantId || !user.store) return null;
  const store = await getStore(user.tenantId);
  if (!store) return null;
  // Igual à IA: sem "vender a rede" liberado, só o estoque da própria loja.
  return aplicarRecursos(store, user.store.recursos);
}

function filtrosDe(sp: URLSearchParams | Record<string, unknown>): FiltrosEstoque {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : (sp[k] as string | undefined)) ?? "";
  const tipo = get("tipo");
  return {
    termo: get("q").trim().slice(0, 80) || undefined,
    tipo: tipo === "0km" || tipo === "usado" ? tipo : "todos",
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const conv = await conversaDoEscopo(user, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const store = await lojaComRecursos(user);
  if (!store) return NextResponse.json({ error: "Estoque é das lojas.", ofertas: [] }, { status: 404 });

  const { ofertas, vendeRede } = await buscarEstoque(store, filtrosDe(req.nextUrl.searchParams), 20);
  return NextResponse.json({
    vendeRede,
    ofertas: ofertas.map((o) => ({ ...o, cartao: cartaoDoCarro(o) })),
  });
}

/** Foto do catálogo como link para a Meta: URL pública vai direto; imagem
 *  gravada em base64 (data:) vira mídia de saída com link assinado. */
async function linkDaFoto(foto: string, req: NextRequest, user: Scope): Promise<string | null> {
  if (/^https:\/\//i.test(foto)) return foto;
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/i.exec(foto);
  if (!m) return null;
  const { id } = await salvarMidiaSaida({
    tenantId: user.tenantId,
    bytes: Buffer.from(m[2], "base64"),
    mime: m[1].toLowerCase(),
    filename: "carro.jpg",
    createdBy: user.email,
    dias: 30,
  });
  return linkDaMidia(siteUrl(req), id);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { ref?: string; q?: string; tipo?: string };
  const ref = String(body.ref ?? "").trim().toUpperCase();
  if (!ref) return NextResponse.json({ error: "Escolha um carro" }, { status: 400 });

  const conv = await conversaDoEscopo(user, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const store = await lojaComRecursos(user);
  if (!store) return NextResponse.json({ error: "Estoque é das lojas." }, { status: 404 });
  const contact = await WaContact.findById(conv.contactId).select("phone").lean();
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  const channel = await channelForConversation(conv);
  if (!podeMandarLivre(channel.kind, conv.lastInboundAt)) {
    return NextResponse.json(
      { error: "Fora da janela de atendimento: só template aprovado chega até o cliente responder." },
      { status: 409 },
    );
  }

  const { ofertas } = await buscarEstoque(store, filtrosDe({ q: body.q, tipo: body.tipo }), 40);
  const oferta = ofertas.find((o) => o.ref === ref);
  if (!oferta) {
    return NextResponse.json({ error: "Esse carro saiu do estoque. Busque de novo." }, { status: 404 });
  }

  const cartao = cartaoDoCarro(oferta);
  // O nome de quem mandou vai em cada mensagem, como no envio de texto.
  const author = autorDoEscopo(user);
  try {
    if (oferta.origem === "local") {
      await enviarCarroDoPatio({
        conversationId: id,
        to: contact.phone,
        oferta,
        base: siteUrl(req),
        canal: channel.kind,
        sender: "human",
        author,
      });
    } else {
      const link = oferta.foto && channel.kind === "whatsapp" ? await linkDaFoto(oferta.foto, req, user) : null;
      if (link) {
        await sendAndLogMedia({ conversationId: id, to: contact.phone, link, type: "image", caption: cartao, sender: "human", author });
      } else {
        await sendAndLogText({ conversationId: id, to: contact.phone, text: cartao, sender: "human", author });
      }
      // Do pátio, enviarCarroDoPatio já liga; aqui o 0km e o repasse.
      await ligarCarroNaConversa({ conversationId: id, oferta, por: "human" });
    }
  } catch (err) {
    if (err instanceof MidiaError) return NextResponse.json({ error: err.message }, { status: err.status });
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao enviar" }, { status });
  }
  await humanoRespondeu(conv, user.email);
  return NextResponse.json({ ok: true });
}
