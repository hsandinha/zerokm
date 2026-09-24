// Configuração única do app (IA + WABA), com fallback para o env.
// Token e app secret do WABA ficam criptografados no banco (AES-256-GCM).

import dbConnect from "@/lib/mongodb";
import { WaSettings, type IWaSettings } from "@wa/models/wa";
import { decrypt, encrypt } from "@wa/lib/crypto";
import type { MetaCredentials } from "@wa/lib/meta";

export async function getSettings(): Promise<IWaSettings> {
  await dbConnect();
  const existing = await WaSettings.findOne();
  if (existing) return existing;
  return WaSettings.create({});
}

function safeDecrypt(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return value; // valor legado sem criptografia
  }
}

export function encryptSecret(plain: string): string {
  return encrypt(plain);
}

/** Credenciais da Meta: banco (tela de configuração) → env. */
export async function getWabaCredentials(): Promise<MetaCredentials | null> {
  const s = await getSettings();
  const token = safeDecrypt(s.wabaToken) || process.env.META_TOKEN;
  const phoneNumberId = s.wabaPhoneNumberId || process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    wabaId: s.wabaId || process.env.META_WABA_ID || null,
    appSecret: safeDecrypt(s.wabaAppSecret) || process.env.META_APP_SECRET || null,
  };
}

export async function getVerifyToken(): Promise<string | undefined> {
  const s = await getSettings();
  return s.wabaVerifyToken || process.env.META_VERIFY_TOKEN;
}
