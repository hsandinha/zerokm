// Origens: de onde vieram as conversas da loja no período (anúncio de clique
// para WhatsApp/Messenger, campanha ou sem anúncio) e quantas viraram venda.
// GET para a tela (quem atende vê); PATCH para a gestão dar nome a um anúncio.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, requireScopeAdmin, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import dbConnect from "@/lib/mongodb";
import { WaCampaign, WaConversation } from "@wa/models/wa";
import { WaChannel } from "@wa/models/channel";
import { WaAnuncio, type WaOrigem } from "@wa/models/origem";
import { imagemDaOrigem } from "@wa/lib/origem-loja";
import { periodoDosUltimos, relatorioDeOrigens, type ConversaDoRelatorio } from "@wa/lib/relatorio-origens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Teto de conversas lidas por consulta: o relatório é de uma loja. */
const TETO = 20_000;

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { desde, ate } = periodoDosUltimos(Number(req.nextUrl.searchParams.get("dias") ?? 30));
  await dbConnect();
  const loja = tenantFilter(scope);
  const campos = "_id stage createdAt campaignId channelId origem";

  // As que chegaram por anúncio no período e as que nasceram no período.
  const [porAnuncio, novas, canais] = await Promise.all([
    WaConversation.find({ ...loja, "origem.em": { $gte: desde, $lte: ate } }).select(campos).limit(TETO).lean(),
    WaConversation.find({ ...loja, createdAt: { $gte: desde, $lte: ate } }).select(campos).limit(TETO).lean(),
    WaChannel.find(loja).select("_id kind").lean(),
  ]);
  const kindDoCanal = new Map(canais.map((c) => [String(c._id), c.kind as string]));
  const conversas: ConversaDoRelatorio[] = [...porAnuncio, ...novas].map((c) => {
    const o = (c.origem as WaOrigem | null | undefined) ?? null;
    return {
      id: String(c._id),
      stage: c.stage,
      createdAt: c.createdAt,
      campaignId: c.campaignId ? String(c.campaignId) : null,
      canal: (c.channelId && kindDoCanal.get(String(c.channelId))) || "whatsapp",
      origem: o ? { idOrigem: o.idOrigem ?? null, canal: o.canal, titulo: o.titulo, texto: o.texto, em: o.em } : null,
    };
  });

  const idsDeAnuncio = [...new Set(conversas.map((c) => c.origem?.idOrigem).filter((x): x is string => Boolean(x)))];
  const idsDeCampanha = [...new Set(conversas.map((c) => c.campaignId).filter((x): x is string => Boolean(x)))];
  const [anuncios, campanhas] = await Promise.all([
    idsDeAnuncio.length
      ? WaAnuncio.find({ ...loja, idOrigem: { $in: idsDeAnuncio } })
          .select("idOrigem apelido titulo texto link midiaId conversas primeiraEm ultimaEm")
          .lean()
      : Promise.resolve([]),
    idsDeCampanha.length
      ? WaCampaign.find({ ...loja, _id: { $in: idsDeCampanha } }).select("_id name").lean()
      : Promise.resolve([]),
  ]);

  const rel = relatorioDeOrigens({
    conversas,
    anuncios: anuncios.map((a) => ({ idOrigem: a.idOrigem, apelido: a.apelido, titulo: a.titulo, texto: a.texto })),
    campanhas: campanhas.map((c) => ({ id: String(c._id), name: c.name })),
    desde,
    ate,
  });
  const doCatalogo = new Map(anuncios.map((a) => [a.idOrigem, a]));

  return NextResponse.json({
    desde,
    ate,
    total: rel.total,
    porAnuncio: rel.porAnuncio,
    linhas: rel.linhas.map((l) => {
      const a = l.idOrigem ? doCatalogo.get(l.idOrigem) : undefined;
      return {
        ...l,
        apelido: a?.apelido ?? null,
        link: a?.link ?? null,
        imagem: a ? imagemDaOrigem({ midiaId: a.midiaId ?? null, imagemUrl: null }) : null,
        primeiraEm: a?.primeiraEm ?? null,
        ultimaEm: a?.ultimaEm ?? null,
      };
    }),
    podeNomear: scope.role === "admin",
  });
}

export async function PATCH(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScopeAdmin();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const body = (await req.json().catch(() => ({}))) as { idOrigem?: string; apelido?: string | null };
  const idOrigem = String(body.idOrigem ?? "").trim().slice(0, 60);
  if (!idOrigem) return NextResponse.json({ error: "Anúncio inválido" }, { status: 400 });
  const apelido = String(body.apelido ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
  await dbConnect();
  const r = await WaAnuncio.updateOne({ ...tenantFilter(scope), idOrigem }, { apelido });
  if (r.matchedCount === 0) return NextResponse.json({ error: "Anúncio não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, apelido });
}
