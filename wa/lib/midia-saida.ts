// Guarda um arquivo para mandar pelo WhatsApp e devolve o link público
// assinado que a Meta baixa. Ver wa/models/midia.ts.

import { createHmac, timingSafeEqual } from "crypto";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaMidiaSaida } from "@wa/models/midia";

/** Teto do arquivo: a Vercel recusa corpo de requisição acima de ~4,5 MB. */
export const MIDIA_MAX_BYTES = 4 * 1024 * 1024;

/** O que o WhatsApp aceita, por tipo de mensagem. */
export type TipoMidia = "image" | "video" | "audio" | "document";

const MIME_POR_TIPO: Record<Exclude<TipoMidia, "document">, RegExp> = {
  image: /^image\/(jpeg|png)$/,
  video: /^video\/(mp4|3gpp)$/,
  audio: /^audio\/(ogg|mpeg|mp4|aac|amr)$/,
};

/** Documentos aceitos: lista fechada. O link é público e fica no domínio do
 *  site, então HTML, SVG ou XHTML anexados virariam página com script lá. */
const DOCUMENTOS = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

/** Tipo de mensagem para o mime do arquivo; null = o WhatsApp não aceita. */
export function tipoDaMidia(mime: string): TipoMidia | null {
  const m = mime.toLowerCase().split(";")[0].trim();
  for (const tipo of ["image", "video", "audio"] as const) {
    if (MIME_POR_TIPO[tipo].test(m)) return tipo;
  }
  return DOCUMENTOS.has(m) ? "document" : null;
}

function chave(): string {
  const key = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("APP_ENCRYPTION_KEY ausente");
  return key;
}

function assinatura(id: string): string {
  return createHmac("sha256", chave()).update(`midia:${id}`).digest("base64url").slice(0, 32);
}

export function assinaturaConfere(id: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const esperado = Buffer.from(assinatura(id));
  const recebido = Buffer.from(token);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

/** Link público (sem sessão) que a Meta usa para baixar o arquivo. */
export function linkDaMidia(base: string, id: string): string {
  return `${base.replace(/\/+$/, "")}/api/wa/midia/${id}?t=${assinatura(id)}`;
}

export class MidiaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Grava o arquivo. `dias`: quanto tempo o link vale (uma resposta na Central
 * precisa de pouco; o cabeçalho de uma campanha, do tempo do disparo).
 */
export async function salvarMidiaSaida(input: {
  tenantId: string | null;
  bytes: Buffer;
  mime: string;
  filename?: string | null;
  createdBy?: string;
  dias?: number;
}): Promise<{ id: string; tipo: TipoMidia }> {
  if (input.bytes.length === 0) throw new MidiaError(400, "Arquivo vazio.");
  if (input.bytes.length > MIDIA_MAX_BYTES) {
    throw new MidiaError(413, "Arquivo acima de 4 MB. Mande um menor ou um link.");
  }
  const tipo = tipoDaMidia(input.mime);
  if (!tipo) throw new MidiaError(415, "O WhatsApp não aceita este tipo de arquivo.");
  await dbConnect();
  const doc = await WaMidiaSaida.create({
    tenantId: input.tenantId,
    mime: input.mime,
    filename: input.filename?.slice(0, 200) || undefined,
    size: input.bytes.length,
    data: input.bytes,
    expiresAt: new Date(Date.now() + (input.dias ?? 30) * 86_400_000),
    createdBy: input.createdBy,
  });
  return { id: String(doc._id), tipo };
}

/** Arquivo para o link público. null = não existe ou venceu. */
export async function lerMidiaSaida(id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  return WaMidiaSaida.findById(id).select("mime filename data tenantId").lean();
}

/** Arquivo de um dono (para reaproveitar num envio sem novo upload). */
export async function midiaDoDono(id: string, tenantId: string | null) {
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  return WaMidiaSaida.findOne({ _id: id, tenantId }).select("mime filename size").lean();
}
