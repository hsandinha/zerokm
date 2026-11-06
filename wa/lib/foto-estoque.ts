// Fotos do carro do pátio (wa/models/foto-estoque.ts): gravar, ler e o link
// público assinado. O link é o mesmo para a tela da equipe (relativo, com a
// sessão do navegador sobrando) e para a Meta (absoluto, sem sessão): quem
// autoriza é a assinatura no `?t=`, como na mídia de saída
// (wa/lib/midia-saida.ts), com outro prefixo para um link não valer no outro.

import { createHmac, timingSafeEqual } from "crypto";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaFotoEstoque } from "@wa/models/foto-estoque";

/** Teto de uma foto. O navegador manda bem menos (JPEG ~1600px), mas quem
 *  chamar a rota direto não passa de 4 MB, o limite do corpo na Vercel. */
export const FOTO_MAX_BYTES = 4 * 1024 * 1024;

function chave(): string {
  const key = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("APP_ENCRYPTION_KEY ausente");
  return key;
}

function assinatura(id: string): string {
  return createHmac("sha256", chave()).update(`foto-estoque:${id}`).digest("base64url").slice(0, 32);
}

export function assinaturaDaFotoConfere(id: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const esperado = Buffer.from(assinatura(id));
  const recebido = Buffer.from(token);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

/** Link da foto. `base` vazio = caminho relativo (para a tela). */
export function linkDaFotoEstoque(base: string, id: string): string {
  return `${base.replace(/\/+$/, "")}/api/wa/loja/estoque/foto/${id}?t=${assinatura(id)}`;
}

export class FotoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** JPEG ou PNG de verdade (pelos primeiros bytes, não pelo que o navegador
 *  disse): o WhatsApp só aceita esses dois como foto. */
export function mimeDaFoto(bytes: Buffer): "image/jpeg" | "image/png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  return null;
}

export async function salvarFotoEstoque(input: {
  tenantId: string;
  veiculoId: mongoose.Types.ObjectId | string;
  bytes: Buffer;
  width?: number | null;
  height?: number | null;
  createdBy?: string;
}): Promise<string> {
  if (input.bytes.length === 0) throw new FotoError(400, "Foto vazia.");
  if (input.bytes.length > FOTO_MAX_BYTES) throw new FotoError(413, "Foto acima de 4 MB.");
  const mime = mimeDaFoto(input.bytes);
  if (!mime) throw new FotoError(415, "Mande a foto em JPG ou PNG.");
  await dbConnect();
  const doc = await WaFotoEstoque.create({
    tenantId: input.tenantId,
    veiculoId: input.veiculoId,
    mime,
    size: input.bytes.length,
    width: input.width && input.width > 0 ? Math.round(input.width) : undefined,
    height: input.height && input.height > 0 ? Math.round(input.height) : undefined,
    data: input.bytes,
    createdBy: input.createdBy,
  });
  return String(doc._id);
}

/** Foto para o link público. null = não existe (o carro foi excluído). */
export async function lerFotoEstoque(id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  return WaFotoEstoque.findById(id).select("mime data").lean();
}

/** Bytes da foto lida com `.lean()`: o Mongo devolve o campo Buffer como
 *  Binary do BSON (os bytes em `.buffer`, o tamanho em `.position`). */
export function bytesDaFoto(data: unknown): Uint8Array {
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const b = data as { buffer?: unknown; position?: number } | null;
  if (b && b.buffer instanceof Uint8Array) {
    return b.buffer.subarray(0, typeof b.position === "number" ? b.position : b.buffer.length);
  }
  return new Uint8Array(0);
}

/** Apaga as fotos (do carro inteiro ou só as indicadas), sempre dentro da loja. */
export async function apagarFotosEstoque(filtro: {
  tenantId: string;
  veiculoId: mongoose.Types.ObjectId | string;
  ids?: string[];
}): Promise<void> {
  await dbConnect();
  await WaFotoEstoque.deleteMany({
    tenantId: filtro.tenantId,
    veiculoId: filtro.veiculoId,
    ...(filtro.ids ? { _id: { $in: filtro.ids.filter((x) => mongoose.isValidObjectId(x)) } } : {}),
  });
}
