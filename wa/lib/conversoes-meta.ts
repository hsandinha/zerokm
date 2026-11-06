// API de Conversões da Meta para mensagens (Conversions API for Business
// Messaging): devolve ao anúncio de clique para WhatsApp, Messenger ou Direct
// o que aconteceu depois da conversa (a venda, o lead qualificado), para a
// campanha otimizar por venda e não só por conversa iniciada.
//
// Puro, sem banco: roda no navegador (o select do evento no modal da coluna)
// e no servidor (wa/lib/conversoes-meta-servidor.ts monta o envio com estas
// regras). Formato da Meta:
//   POST /{DATASET_ID}/events { data: [{ event_name, event_time,
//   action_source: "business_messaging", messaging_channel, user_data,
//   custom_data }] }
// A Meta NÃO deduplica estes eventos: a dedupe é nossa (um evento por
// conversa, índice único em wa_eventos_meta).

export const EVENTOS_META = [
  "Purchase",
  "LeadSubmitted",
  "QualifiedLead",
  "InitiateCheckout",
  "AddToCart",
  "ViewContent",
  "OrderCreated",
  "OrderShipped",
  "OrderDelivered",
  "OrderCanceled",
  "OrderReturned",
  "CartAbandoned",
  "RatingProvided",
  "ReviewProvided",
] as const;

export type EventoMeta = (typeof EVENTOS_META)[number];

/** O que cada evento quer dizer, no vocabulário de quem vende carro. */
export const EVENTO_META_ROTULO: Record<EventoMeta, string> = {
  Purchase: "Venda (Purchase)",
  LeadSubmitted: "Lead recebido (LeadSubmitted)",
  QualifiedLead: "Lead qualificado (QualifiedLead)",
  InitiateCheckout: "Proposta iniciada (InitiateCheckout)",
  AddToCart: "Interesse num carro (AddToCart)",
  ViewContent: "Viu um carro (ViewContent)",
  OrderCreated: "Pedido feito (OrderCreated)",
  OrderShipped: "Pedido despachado (OrderShipped)",
  OrderDelivered: "Carro entregue (OrderDelivered)",
  OrderCanceled: "Pedido cancelado (OrderCanceled)",
  OrderReturned: "Devolução (OrderReturned)",
  CartAbandoned: "Desistiu da proposta (CartAbandoned)",
  RatingProvided: "Deu nota (RatingProvided)",
  ReviewProvided: "Fez avaliação (ReviewProvided)",
};

export function eventoValido(v: unknown): v is EventoMeta {
  return typeof v === "string" && (EVENTOS_META as readonly string[]).includes(v);
}

/**
 * Evento que a coluna manda quando um cartão entra nela. Gravado na coluna
 * (um nome ou null = nenhum) vale o gravado; coluna sem o campo (as de antes
 * desta função) segue o tipo: venda fechada manda Purchase, as outras nada.
 */
export function eventoDaColuna(col: { eventoMeta?: string | null; type?: string | null } | null | undefined): EventoMeta | null {
  if (!col) return null;
  if (col.eventoMeta === null) return null;
  if (col.eventoMeta !== undefined) return eventoValido(col.eventoMeta) ? col.eventoMeta : null;
  return col.type === "won" ? "Purchase" : null;
}

// ── Quando manda ─────────────────────────────────────────────

export type CanalMeta = "whatsapp" | "messenger" | "instagram";

/** O suficiente da origem do lead (WaOrigem em wa/models/origem.ts). */
export type OrigemParaMeta = {
  canal: CanalMeta;
  ctwaClid?: string | null;
  idOrigem?: string | null;
  tipoOrigem?: string | null;
} | null | undefined;

/** O suficiente da configuração do dono (wa_conversoes_meta). */
export type ConfigParaMeta = {
  ativo?: boolean | null;
  datasetId?: string | null;
  token?: string | null;
} | null | undefined;

export const MOTIVO = {
  semConfiguracao: "sem configuração",
  semClique: "sem clique do anúncio",
  semAnuncio: "não veio de anúncio",
  prazo: "passou do prazo de 7 dias da Meta",
  tentativas: "tentativas esgotadas",
} as const;

export function configCompleta(c: ConfigParaMeta): boolean {
  return Boolean(c?.ativo && c.datasetId && c.token);
}

/**
 * Por que este evento NÃO vai para a Meta (null = vai). Só faz sentido para
 * conversa que veio de anúncio: no WhatsApp, com o ctwa_clid (o id do
 * clique, sem ele a Meta não sabe de qual anúncio foi); no Messenger e no
 * Direct, a origem só existe quando veio de anúncio (wa/lib/origem.ts).
 */
export function motivoSemEnvio(p: { config: ConfigParaMeta; origem: OrigemParaMeta }): string | null {
  if (!configCompleta(p.config)) return MOTIVO.semConfiguracao;
  const o = p.origem;
  if (!o) return MOTIVO.semAnuncio;
  if (o.canal === "whatsapp") return o.ctwaClid?.trim() ? null : MOTIVO.semClique;
  return null;
}

// ── user_data por canal ──────────────────────────────────────

export type IdsDoCanal = {
  /** WhatsApp: a conta (WABA) do número que recebeu a conversa. */
  wabaId?: string | null;
  /** Messenger: a Página. */
  pageId?: string | null;
  /** Instagram: a conta profissional (IG user id). */
  igAccountId?: string | null;
};

export type ContatoParaMeta = {
  /** Chave do contato: "+55..." no WhatsApp, "fb:<PSID>", "ig:<IGSID>". */
  phone?: string | null;
  fbPsid?: string | null;
  igUserId?: string | null;
};

export type UserDataMeta =
  | { whatsapp_business_account_id: string; ctwa_clid: string }
  | { page_id: string; page_scoped_user_id: string }
  | { instagram_business_account_id: string; ig_sid: string };

const depois = (phone: string | null | undefined, prefixo: string): string | null =>
  phone?.startsWith(prefixo) ? phone.slice(prefixo.length).trim() || null : null;

/** user_data do canal por onde o anúncio trouxe a pessoa. Sem o id da conta
 *  ou da pessoa no canal, não há como a Meta ligar ao anúncio: volta o motivo. */
export function montarUserData(p: {
  origem: NonNullable<OrigemParaMeta>;
  contato: ContatoParaMeta;
  ids: IdsDoCanal;
}): { ok: true; userData: UserDataMeta } | { ok: false; motivo: string } {
  const { origem, contato, ids } = p;
  if (origem.canal === "whatsapp") {
    const clid = origem.ctwaClid?.trim();
    if (!clid) return { ok: false, motivo: MOTIVO.semClique };
    if (!ids.wabaId) return { ok: false, motivo: "sem o id da conta do WhatsApp (WABA)" };
    return { ok: true, userData: { whatsapp_business_account_id: ids.wabaId, ctwa_clid: clid } };
  }
  if (origem.canal === "messenger") {
    const psid = depois(contato.phone, "fb:") ?? contato.fbPsid?.trim() ?? null;
    if (!ids.pageId) return { ok: false, motivo: "sem o id da Página do Facebook" };
    if (!psid) return { ok: false, motivo: "sem o id da pessoa no Messenger" };
    return { ok: true, userData: { page_id: ids.pageId, page_scoped_user_id: psid } };
  }
  const igsid = depois(contato.phone, "ig:") ?? contato.igUserId?.trim() ?? null;
  if (!ids.igAccountId) return { ok: false, motivo: "sem o id da conta do Instagram" };
  if (!igsid) return { ok: false, motivo: "sem o id da pessoa no Instagram" };
  return { ok: true, userData: { instagram_business_account_id: ids.igAccountId, ig_sid: igsid } };
}

// ── Corpo do envio ───────────────────────────────────────────

export type EventoMetaPayload = {
  data: Array<{
    event_name: EventoMeta;
    event_time: number;
    /** Id do nosso registro: se o mesmo evento sair duas vezes (a função
     *  caiu entre o 200 da Meta e a gravação), os dois têm o mesmo id. */
    event_id?: string;
    action_source: "business_messaging";
    messaging_channel: CanalMeta;
    user_data: UserDataMeta;
    custom_data?: { currency: "BRL"; value: number };
  }>;
  test_event_code?: string;
};

/** Valor em reais com duas casas; negativo ou inválido vira 0. */
export function valorEmReais(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Eventos que levam valor: a venda sempre (a Meta pede moeda e valor). */
export function eventoComValor(evento: EventoMeta): boolean {
  return evento === "Purchase";
}

export function montarPayloadMeta(p: {
  evento: EventoMeta;
  /** Quando o cartão entrou na coluna (é o horário do evento). */
  quando: Date;
  canal: CanalMeta;
  userData: UserDataMeta;
  valor?: number | null;
  /** Só no "Testar conexão": o evento aparece em Testar eventos e não conta. */
  testEventCode?: string | null;
  /** Id estável do evento (o _id do registro da fila). */
  eventId?: string | null;
}): EventoMetaPayload {
  const item: EventoMetaPayload["data"][number] = {
    event_name: p.evento,
    event_time: Math.floor(p.quando.getTime() / 1000),
    ...(p.eventId ? { event_id: p.eventId } : {}),
    action_source: "business_messaging",
    messaging_channel: p.canal,
    user_data: p.userData,
  };
  if (eventoComValor(p.evento)) item.custom_data = { currency: "BRL", value: valorEmReais(p.valor) };
  const body: EventoMetaPayload = { data: [item] };
  const code = p.testEventCode?.trim();
  if (code) body.test_event_code = code;
  return body;
}

// ── Prazo e tentativas ───────────────────────────────────────

/** A Meta recusa event_time com mais de 7 dias. Folga de 10 minutos para o
 *  envio que sai no limite não ser recusado no caminho. */
export const PRAZO_META_MS = 7 * 24 * 3600_000 - 10 * 60_000;

export function dentroDoPrazo(quando: Date, agora = Date.now()): boolean {
  return agora - quando.getTime() < PRAZO_META_MS;
}

export const MAX_TENTATIVAS = 8;

// Espera depois de cada falha: rápido no começo (instabilidade da Meta), mais
// espaçado depois (token vencido, que só volta quando o lojista troca).
const ESPERA_MIN = [5, 15, 60, 3 * 60, 6 * 60, 12 * 60, 24 * 60];

/** Quando tentar de novo depois da tentativa `tentativas` (1 = a primeira
 *  falhou). null = desiste (esgotou ou a próxima já passaria do prazo). */
export function proximaTentativa(tentativas: number, quando: Date, agora = Date.now()): Date | null {
  if (tentativas >= MAX_TENTATIVAS) return null;
  const min = ESPERA_MIN[Math.min(Math.max(tentativas, 1), ESPERA_MIN.length) - 1];
  const prox = agora + min * 60_000;
  return dentroDoPrazo(quando, prox) ? new Date(prox) : null;
}

/** Erro da Meta que não melhora tentando de novo: parâmetro inválido (o
 *  ctwa_clid ou o id da conta não batem com o dataset). Token vencido,
 *  permissão, limite de chamadas e instabilidade tentam de novo: o lojista
 *  pode trocar o token, e a Meta volta. */
export function erroDefinitivo(status: number, code: number | null | undefined): boolean {
  return status === 400 && code === 100;
}

/** Situação do registro como a tela mostra. */
export type SituacaoEventoMeta = "pendente" | "enviando" | "enviado" | "falhou" | "ignorado";

export const SITUACAO_ROTULO: Record<SituacaoEventoMeta, string> = {
  pendente: "Na fila",
  enviando: "Enviando",
  enviado: "Enviado",
  falhou: "Falhou",
  ignorado: "Não enviado",
};

// ── Configuração (o formulário) ──────────────────────────────

export type ConfigEntrada = {
  ativo?: unknown;
  datasetId?: unknown;
  token?: unknown;
  testEventCode?: unknown;
  valorPadrao?: unknown;
};

export type ConfigNormalizada = {
  ativo: boolean;
  datasetId: string;
  /** undefined = manter o salvo; string = trocar. */
  token?: string;
  testEventCode: string | null;
  valorPadrao: number | null;
};

/** "89.900,50", "89900,50", "89900.50" ou "R$ 89.900" em número. Com vírgula,
 *  o ponto é de milhar; sem vírgula, o ponto é decimal se tiver 1 ou 2 casas. */
export function numeroDeReais(txt: string): number {
  const t = txt.replace(/[R$\s]/g, "");
  if (!t) return NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}

/** Confere o formulário. `temToken`: já há token salvo (em branco mantém). */
export function normalizarConfig(
  input: ConfigEntrada,
  temToken: boolean,
): { config: ConfigNormalizada; erro: null } | { config: null; erro: string } {
  const datasetId = typeof input.datasetId === "string" ? input.datasetId.replace(/\s+/g, "") : "";
  if (datasetId && !/^\d{6,30}$/.test(datasetId)) {
    return { config: null, erro: "O ID do conjunto de dados tem só números (copie do Gerenciador de Eventos)." };
  }
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (token && (token.length < 20 || /\s/.test(token))) {
    return { config: null, erro: "Token de acesso inválido. Gere de novo no Gerenciador de Eventos e cole inteiro." };
  }
  const code = typeof input.testEventCode === "string" ? input.testEventCode.trim() : "";
  if (code && !/^[A-Za-z0-9_-]{2,40}$/.test(code)) {
    return { config: null, erro: "Código de teste inválido (é o que aparece em Testar eventos, ex.: TEST12345)." };
  }
  let valorPadrao: number | null = null;
  if (input.valorPadrao !== undefined && input.valorPadrao !== null && input.valorPadrao !== "") {
    const n = typeof input.valorPadrao === "number" ? input.valorPadrao : numeroDeReais(String(input.valorPadrao));
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      return { config: null, erro: "Valor padrão da venda inválido." };
    }
    valorPadrao = Math.round(n * 100) / 100;
  }
  const ativo = input.ativo === true;
  if (ativo && !datasetId) return { config: null, erro: "Para ligar, informe o ID do conjunto de dados." };
  if (ativo && !token && !temToken) return { config: null, erro: "Para ligar, cole o token de acesso." };
  return {
    config: { ativo, datasetId, ...(token ? { token } : {}), testEventCode: code || null, valorPadrao },
    erro: null,
  };
}
