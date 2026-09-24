// Chaves de API para sistemas externos chamarem /api/v1.
//
// A chave inteira só existe no momento da criação: gravamos o sha256 e um
// prefixo para a lista. Autenticação: `Authorization: Bearer cnv_live_…`
// (ou `X-Api-Key`).

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaApiKey } from "@wa/models/panel";

const KEY_PREFIX = "cnv_live_";

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = KEY_PREFIX + randomBytes(24).toString("hex");
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 8) + "…", hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export class ApiKeyError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "ApiKeyError";
  }
}

export type ApiCaller = { id: string; name: string };

export async function requireApiKey(req: NextRequest): Promise<ApiCaller> {
  const header = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  const key = bearer || req.headers.get("x-api-key")?.trim() || "";
  if (!key.startsWith(KEY_PREFIX)) {
    throw new ApiKeyError("Informe a chave em Authorization: Bearer cnv_live_…");
  }

  await dbConnect();
  const hash = hashApiKey(key);
  const found = await WaApiKey.findOne({ keyHash: hash });
  if (!found) throw new ApiKeyError("Chave de API inválida");
  if (found.revokedAt) throw new ApiKeyError("Chave de API revogada");
  // Comparação em tempo constante — o lookup por igualdade já é exato, mas
  // não custa nada e evita o caso do hash "quase igual".
  if (!timingSafeEqual(Buffer.from(found.keyHash), Buffer.from(hash))) {
    throw new ApiKeyError("Chave de API inválida");
  }

  // Contador informativo; corrida entre duas chamadas perder 1 não importa.
  void WaApiKey.updateOne(
    { _id: found._id },
    { lastUsedAt: new Date(), $inc: { calls: 1 } },
  ).catch(() => {});

  return { id: String(found._id), name: found.name };
}
