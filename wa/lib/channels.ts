// Resolução de canais (WhatsApp / Instagram / Messenger / SMS) — o mesmo
// padrão de conexão do Chatrun, para o CNV e para as lojas. Canal com
// provider "chatrun" não tem token: a credencial é a conexão do gateway. Quem envia ou recebe pergunta aqui
// "qual canal e com que credencial", e não lê mais configuração solta.
//
// O WhatsApp do CNV morava em wa_settings. Na primeira leitura ele é copiado
// para wa_channels e os campos antigos são apagados: uma fonte só. Quando não
// há nada no banco, as variáveis META_* do deploy continuam valendo para o CNV.

import { createHmac, timingSafeEqual } from "crypto";
import dbConnect from "@/lib/mongodb";
import { WaChannel, type IWaChannel, type WaChannelKind } from "@wa/models/channel";
import { WaSettings } from "@wa/models/wa";
import { decrypt } from "@wa/lib/crypto";
import type { MetaCredentials } from "@wa/lib/meta";
import type { IgCreds } from "@wa/lib/instagram";
import type { FbCreds } from "@wa/lib/messenger";
import type { SmsCreds } from "@wa/lib/sms-types";
import { canonicalPhone } from "@wa/lib/phone";

export type ResolvedChannel = {
  /** null = WhatsApp do CNV configurado só pelo env (sem documento). */
  id: string | null;
  kind: WaChannelKind;
  tenantId: string | null;
  label: string;
  whatsapp: MetaCredentials | null;
  ig: IgCreds | null;
  /** Messenger: id e token da Página. */
  fb: FbCreds | null;
  /** SMS/RCS: conta do provedor da loja. */
  sms: SmsCreds | null;
};

export function safeDecrypt(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return value; // valor legado sem criptografia
  }
}

const LEGACY_WABA_FIELDS = [
  "wabaPhoneNumberId",
  "wabaId",
  "wabaToken",
  "wabaAppSecret",
  "wabaVerifyToken",
  "wabaDisplayPhone",
] as const;

/** Canal de WhatsApp do CNV (o número da Vera), migrando de wa_settings. */
export async function cnvWhatsappChannel(): Promise<IWaChannel | null> {
  await dbConnect();
  const existing = await WaChannel.findOne({ tenantId: null, kind: "whatsapp" });
  if (existing) return existing;

  const s = await WaSettings.findOne().lean();
  if (!s?.wabaPhoneNumberId && !s?.wabaToken) return null;
  try {
    const created = await WaChannel.create({
      kind: "whatsapp",
      tenantId: null,
      status: "connected",
      phoneNumberId: s.wabaPhoneNumberId || undefined,
      wabaId: s.wabaId || undefined,
      token: s.wabaToken || undefined,
      appSecret: s.wabaAppSecret || undefined,
      verifyToken: s.wabaVerifyToken || undefined,
      displayPhone: s.wabaDisplayPhone || undefined,
    });
    await WaSettings.updateOne(
      { _id: s._id },
      { $unset: Object.fromEntries(LEGACY_WABA_FIELDS.map((f) => [f, 1])) },
    );
    return created;
  } catch (err) {
    // Duas leituras simultâneas migraram juntas: fica a que chegou primeiro.
    if ((err as { code?: number })?.code === 11000) {
      return WaChannel.findOne({ tenantId: null, kind: "whatsapp" });
    }
    throw err;
  }
}

/** Credenciais da Cloud API: documento do canal → env (só para o CNV). */
function whatsappCredsOf(doc: IWaChannel | null, cnv: boolean): MetaCredentials | null {
  // Conectado pelo Chatrun: a credencial é a conexão no gateway, sem token.
  if (doc?.provider === "chatrun" && doc.chatrunConnectionId) {
    return {
      token: "",
      phoneNumberId: doc.phoneNumberId || doc.chatrunConnectionId,
      wabaId: doc.wabaId || null,
      appSecret: null,
      chatrunConnectionId: doc.chatrunConnectionId,
    };
  }
  const env = cnv ? process.env : ({} as NodeJS.ProcessEnv);
  const token = safeDecrypt(doc?.token) || env.META_TOKEN;
  const phoneNumberId = doc?.phoneNumberId || env.META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    wabaId: doc?.wabaId || env.META_WABA_ID || null,
    appSecret: safeDecrypt(doc?.appSecret) || env.META_APP_SECRET || null,
  };
}

/** Campos que bastam para dar nome ao canal (documento ou `.lean()`). */
export type ChannelLabelSource = {
  kind: WaChannelKind;
  igUsername?: string | null;
  fbPageName?: string | null;
  smsProvider?: string | null;
  rcsAgentId?: string | null;
  displayPhone?: string | null;
  displayName?: string | null;
};

const SMS_PROVIDER_NAME: Record<string, string> = { zenvia: "Zenvia", comtele: "Comtele" };

/** Como o canal aparece na tela e no prompt da IA. */
export function channelLabelOf(c: ChannelLabelSource): string {
  if (c.kind === "instagram") return c.igUsername ? `@${c.igUsername}` : "Instagram";
  if (c.kind === "messenger") return c.fbPageName || c.displayName || "Messenger";
  if (c.kind === "sms") {
    const base = c.rcsAgentId && c.smsProvider === "zenvia" ? "SMS/RCS" : "SMS";
    const provider = c.smsProvider ? SMS_PROVIDER_NAME[c.smsProvider] : null;
    return provider ? `${base} (${provider})` : base;
  }
  return c.displayPhone || c.displayName || "WhatsApp";
}

function smsCredsOf(doc: IWaChannel): SmsCreds | null {
  const token = safeDecrypt(doc.smsToken);
  if (doc.kind !== "sms" || !doc.smsProvider || !token) return null;
  if (doc.smsProvider === "zenvia" && !doc.smsSender && !doc.rcsAgentId) return null;
  return {
    provider: doc.smsProvider,
    token,
    sender: doc.smsSender || null,
    route: doc.smsRoute ?? null,
    // RCS só pela Zenvia (a Comtele, por ora, só SMS).
    rcsAgentId: doc.smsProvider === "zenvia" ? doc.rcsAgentId?.trim() || null : null,
  };
}

export function resolveChannel(doc: IWaChannel): ResolvedChannel {
  const cnv = doc.tenantId == null;
  // Pelo Chatrun não há token: a conexão do gateway é a credencial.
  const viaChatrun = doc.provider === "chatrun" && doc.chatrunConnectionId ? doc.chatrunConnectionId : null;
  const igToken = safeDecrypt(doc.igToken);
  const fbToken = safeDecrypt(doc.fbPageToken);
  if (viaChatrun && doc.kind !== "whatsapp") {
    return {
      id: String(doc._id),
      kind: doc.kind,
      tenantId: doc.tenantId ?? null,
      label: channelLabelOf(doc),
      whatsapp: null,
      ig: doc.kind === "instagram" ? { userId: doc.igUserId ?? "", token: "", chatrunConnectionId: viaChatrun } : null,
      fb: doc.kind === "messenger" ? { pageId: doc.fbPageId ?? "", token: "", chatrunConnectionId: viaChatrun } : null,
      sms: null,
    };
  }
  return {
    id: String(doc._id),
    kind: doc.kind,
    tenantId: doc.tenantId ?? null,
    label: channelLabelOf(doc),
    whatsapp: doc.kind === "whatsapp" ? whatsappCredsOf(doc, cnv) : null,
    ig: doc.kind === "instagram" && doc.igUserId && igToken
      ? { userId: doc.igUserId, token: igToken }
      : null,
    fb: doc.kind === "messenger" && doc.fbPageId && fbToken
      ? { pageId: doc.fbPageId, token: fbToken }
      : null,
    sms: smsCredsOf(doc),
  };
}
const resolve = resolveChannel;

async function resolveCnvWhatsapp(): Promise<ResolvedChannel> {
  const doc = await cnvWhatsappChannel();
  if (doc) return resolve(doc);
  return {
    id: null,
    kind: "whatsapp",
    tenantId: null,
    label: "WhatsApp",
    whatsapp: whatsappCredsOf(null, true),
    ig: null,
    fb: null,
    sms: null,
  };
}

/** Credenciais do WhatsApp do CNV (campanhas, templates, lembretes). */
export async function getWabaCredentials(): Promise<MetaCredentials | null> {
  return (await resolveCnvWhatsapp()).whatsapp;
}

/** WhatsApp de uma loja (o primeiro número conectado). null = CNV. */
export async function whatsappChannelOf(tenantId: string | null): Promise<ResolvedChannel | null> {
  if (!tenantId) return resolveCnvWhatsapp();
  await dbConnect();
  const doc = await WaChannel.findOne({ tenantId, kind: "whatsapp", status: "connected" }).sort({
    createdAt: 1,
  });
  return doc ? resolve(doc) : null;
}

/** Credenciais da Cloud API da loja (templates, campanhas, nova conversa). */
export async function wabaCredentialsOf(tenantId: string | null): Promise<MetaCredentials | null> {
  return (await whatsappChannelOf(tenantId))?.whatsapp ?? null;
}

export async function getVerifyToken(): Promise<string | undefined> {
  const doc = await cnvWhatsappChannel();
  return doc?.verifyToken || process.env.META_VERIFY_TOKEN;
}

/** Canal de uma conversa. Conversa sem canal é do WhatsApp do CNV. */
export async function channelForConversation(conv: {
  channelId?: unknown;
}): Promise<ResolvedChannel> {
  if (conv.channelId) {
    await dbConnect();
    const doc = await WaChannel.findById(conv.channelId);
    if (doc) return resolve(doc);
  }
  return resolveCnvWhatsapp();
}

/** Canal que recebeu uma mensagem do WhatsApp (pelo phone_number_id). */
export async function channelForWhatsappNumber(
  phoneNumberId: string | null | undefined,
): Promise<ResolvedChannel> {
  if (phoneNumberId) {
    await dbConnect();
    const doc = await WaChannel.findOne({ kind: "whatsapp", phoneNumberId });
    if (doc && doc.status !== "disconnected") return resolve(doc);
  }
  // Número não cadastrado como canal = o número único do CNV de hoje (env).
  return resolveCnvWhatsapp();
}

/** Canal conectado pelo Chatrun (pela conexão do gateway), de qualquer tipo. */
export async function channelByChatrunConnection(
  connectionId: string | null | undefined,
): Promise<ResolvedChannel | null> {
  if (!connectionId) return null;
  await dbConnect();
  const doc = await WaChannel.findOne({ chatrunConnectionId: connectionId });
  if (!doc || doc.status === "disconnected") return null;
  return resolve(doc);
}

export async function channelByIgUserId(igUserId: string): Promise<ResolvedChannel | null> {
  await dbConnect();
  const doc = await WaChannel.findOne({ kind: "instagram", igUserId });
  if (!doc || doc.status === "disconnected") return null;
  return resolve(doc);
}

/** Canal do Messenger pelo id da Página — no webhook é o `entry.id`. */
export async function channelByFbPageId(pageId: string): Promise<ResolvedChannel | null> {
  await dbConnect();
  const doc = await WaChannel.findOne({ kind: "messenger", fbPageId: pageId });
  if (!doc || doc.status === "disconnected") return null;
  return resolve(doc);
}

// ── Contato sem telefone (Instagram e Messenger) ─────────────
// Contato de "perfil" não tem telefone: a chave `phone` guarda o id da
// pessoa no canal com um prefixo. O SMS é canal de telefone: a chave é o
// telefone canônico, o mesmo contato do WhatsApp.
export const IG_PREFIX = "ig:";
export const FB_PREFIX = "fb:";

export function isInstagramPhone(phone: string | null | undefined): boolean {
  return Boolean(phone?.startsWith(IG_PREFIX));
}

export function isMessengerPhone(phone: string | null | undefined): boolean {
  return Boolean(phone?.startsWith(FB_PREFIX));
}

/** Contato sem telefone de verdade (Instagram ou Messenger). Cadastro, CRM
 *  e qualquer coisa que precise de celular pulam esses: "fb:123..." tem
 *  dígitos suficientes para passar por telefone se ninguém olhar o prefixo. */
export function isProfilePhone(phone: string | null | undefined): boolean {
  return isInstagramPhone(phone) || isMessengerPhone(phone);
}

/** IGSID guardado na chave "ig:<id>" do contato. */
export function igRecipientOf(phone: string): string {
  return phone.slice(IG_PREFIX.length);
}

/** PSID guardado na chave "fb:<id>" do contato. */
export function fbRecipientOf(phone: string): string {
  return phone.slice(FB_PREFIX.length);
}

/** Prefixo da chave do contato em cada canal (null = telefone). */
export function contactPrefixOf(kind: WaChannelKind): string | null {
  if (kind === "instagram") return IG_PREFIX;
  if (kind === "messenger") return FB_PREFIX;
  return null;
}

/** Chave `phone` de quem escreveu por este canal: "ig:<id>", "fb:<id>" ou o
 *  telefone canônico (WhatsApp e SMS). */
export function contactKeyFor(kind: WaChannelKind, from: string): string {
  const prefix = contactPrefixOf(kind);
  return prefix ? `${prefix}${from}` : canonicalPhone(from);
}

/** Tela de Configuração de quem conectou (o login volta para ela). */
export function configPathOf(tenantId: string | null): string {
  return tenantId ? "/dashboard/atendimento/configuracao" : "/dashboard/admin/whatsapp/configuracao";
}

// ── `state` assinado do OAuth ────────────────────────────────
// O login do Instagram volta sem sessão garantida (outro domínio, outra aba):
// é o state assinado que amarra o retorno ao dono do canal.

const STATE_TTL_MS = 15 * 60_000;

function stateKey(): string {
  const key = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("APP_ENCRYPTION_KEY ausente");
  return key;
}

export type ConnectState = { tenantId: string | null; by: string };

export function signConnectState(payload: ConnectState): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS }),
  ).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readConnectState(state: string | null | undefined): ConnectState | null {
  const [body, sig] = (state ?? "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateKey()).update(body).digest("base64url");
  if (
    expected.length !== sig.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConnectState & {
      exp: number;
    };
    if (!data.exp || data.exp < Date.now()) return null;
    return { tenantId: data.tenantId ?? null, by: String(data.by ?? "") };
  } catch {
    return null;
  }
}
