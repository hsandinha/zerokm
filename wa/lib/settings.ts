// Configuração única da Vera (IA). As credenciais do WhatsApp agora são de
// canal (wa_channels, ver channels.ts) — os nomes abaixo continuam exportados
// daqui para quem já os usava.

import dbConnect from "@/lib/mongodb";
import { WaSettings, type IWaSettings } from "@wa/models/wa";
import { encrypt } from "@wa/lib/crypto";

export { getWabaCredentials, getVerifyToken } from "@wa/lib/channels";

export async function getSettings(): Promise<IWaSettings> {
  await dbConnect();
  const existing = await WaSettings.findOne();
  if (existing) return existing;
  return WaSettings.create({});
}

export function encryptSecret(plain: string): string {
  return encrypt(plain);
}
