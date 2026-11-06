// Origem do lead: o "referral" que a Meta manda junto da primeira mensagem de
// quem tocou num anúncio de clique para WhatsApp (ou Messenger/Direct),
// normalizado num formato só (WaOrigem em wa/models/origem.ts). Puro, sem
// banco: o webhook, o gateway, a Central e o relatório usam as mesmas regras.

import type { CanalDaOrigem, WaOrigem } from "@wa/models/origem";

/** Referral da Cloud API do WhatsApp (mensagem vinda de anúncio ou post). */
export type ReferralWhatsApp = {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  ctwa_clid?: string;
};

/** Referral do Messenger e do Direct (messaging_referral do anúncio). */
export type ReferralMeta = {
  ref?: string;
  ad_id?: string;
  source?: string;
  type?: string;
  ads_context_data?: {
    ad_title?: string;
    photo_url?: string;
    video_url?: string;
    post_id?: string;
    product_id?: string;
  };
};

/** O que chega do webhook, antes de ganhar a data e a cópia da imagem. */
export type OrigemRecebida = Omit<WaOrigem, "em" | "midiaId">;

const limpo = (s: unknown, max = 500): string | null => {
  if (typeof s !== "string") return null;
  return s.trim().slice(0, max) || null;
};

const httpsOuNada = (s: unknown): string | null => {
  const v = limpo(s, 2000);
  return v && /^https:\/\//i.test(v) ? v : null;
};

export function origemDoWhatsApp(r: ReferralWhatsApp | null | undefined): OrigemRecebida | null {
  if (!r || typeof r !== "object") return null;
  if (!r.source_id && !r.source_url && !r.ctwa_clid && !r.headline) return null;
  const video = r.media_type === "video";
  return {
    canal: "whatsapp",
    tipoOrigem: limpo(r.source_type, 20),
    idOrigem: limpo(r.source_id, 60),
    titulo: limpo(r.headline, 200),
    texto: limpo(r.body, 1000),
    link: httpsOuNada(r.source_url),
    midia: r.media_type === "image" ? "image" : video ? "video" : null,
    imagemUrl: httpsOuNada(video ? (r.thumbnail_url ?? r.image_url) : (r.image_url ?? r.thumbnail_url)),
    ctwaClid: limpo(r.ctwa_clid, 300),
  };
}

/** Messenger e Direct: só anúncio (source ADS ou ad_id). Link m.me e post
 *  comum também mandam referral, e não são anúncio. */
export function origemDoDirectOuMessenger(
  canal: Exclude<CanalDaOrigem, "whatsapp">,
  r: ReferralMeta | null | undefined,
): OrigemRecebida | null {
  if (!r || typeof r !== "object") return null;
  if (!r.ad_id && r.source !== "ADS") return null;
  const ctx = r.ads_context_data;
  return {
    canal,
    tipoOrigem: limpo(r.source, 20),
    idOrigem: limpo(r.ad_id ?? ctx?.post_id, 60),
    titulo: limpo(ctx?.ad_title, 200),
    texto: null,
    link: null,
    midia: ctx?.video_url ? "video" : ctx?.photo_url ? "image" : null,
    imagemUrl: httpsOuNada(ctx?.photo_url ?? ctx?.video_url),
    ctwaClid: null,
  };
}

/** Títulos que a Meta devolve e não dizem nada sobre o criativo: o texto do
 *  botão e o domínio do link. Repetem em dezenas de anúncios. */
export function tituloGenerico(t: string | null | undefined): boolean {
  if (!t) return true;
  const s = t.trim().toLowerCase();
  return (
    s === "converse conosco" ||
    s === "enviar mensagem" ||
    s === "saiba mais" ||
    s === "fale conosco" ||
    /^(https?:\/\/)?(www\.)?[a-z0-9.-]+\.[a-z]{2,}\/?$/.test(s)
  );
}

/** O nome que identifica o anúncio: o que a equipe deu, o texto (o que muda
 *  entre criativos), o título (quando não é genérico) ou o fim do id. */
export function nomeDaOrigem(a: {
  apelido?: string | null;
  titulo?: string | null;
  texto?: string | null;
  idOrigem?: string | null;
}): string {
  if (a.apelido?.trim()) return a.apelido.trim();
  if (a.texto?.trim()) return a.texto.trim().replace(/\s+/g, " ").slice(0, 60);
  if (a.titulo && !tituloGenerico(a.titulo)) return a.titulo.trim().slice(0, 60);
  return a.idOrigem ? `Anúncio ${a.idOrigem.slice(-6)}` : "Anúncio sem identificação";
}

export const NOME_DO_CANAL_DA_ORIGEM: Record<CanalDaOrigem, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};
