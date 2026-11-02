// Resolução de canais (WhatsApp / Instagram) — o mesmo padrão de conexão do
// Chatrun, para o CNV e para as lojas. Quem envia ou recebe pergunta aqui
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

export type ResolvedChannel = {
  /** null = WhatsApp do CNV configurado só pelo env (sem documento). */
  id: string | null;
  kind: WaChannelKind;
  tenantId: string | null;
  label: string;
  whatsapp: MetaCredentials | null;
  ig: IgCreds | null;
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

function resolve(doc: IWaChannel): ResolvedChannel {
  const cnv = doc.tenantId == null;
  const igToken = safeDecrypt(doc.igToken);
  return {
    id: String(doc._id),
    kind: doc.kind,
    tenantId: doc.tenantId ?? null,
    label:
      doc.kind === "instagram"
        ? doc.igUsername
          ? `@${doc.igUsername}`
          : "Instagram"
        : doc.displayPhone || doc.displayName || "WhatsApp",
    whatsapp: doc.kind === "whatsapp" ? whatsappCredsOf(doc, cnv) : null,
    ig: doc.kind === "instagram" && doc.igUserId && igToken
      ? { userId: doc.igUserId, token: igToken }
      : null,
  };
}

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
  };
}

/** Credenciais do WhatsApp do CNV (campanhas, templates, lembretes). */
export async function getWabaCredentials(): Promise<MetaCredentials | null> {
  return (await resolveCnvWhatsapp()).whatsapp;
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

export async function channelByIgUserId(igUserId: string): Promise<ResolvedChannel | null> {
  await dbConnect();
  const doc = await WaChannel.findOne({ kind: "instagram", igUserId });
  if (!doc || doc.status === "disconnected") return null;
  return resolve(doc);
}

// ── Contato do Instagram ─────────────────────────────────────
export const IG_PREFIX = "ig:";

export function isInstagramPhone(phone: string | null | undefined): boolean {
  return Boolean(phone?.startsWith(IG_PREFIX));
}

/** IGSID guardado na chave "ig:<id>" do contato. */
export function igRecipientOf(phone: string): string {
  return phone.slice(IG_PREFIX.length);
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
