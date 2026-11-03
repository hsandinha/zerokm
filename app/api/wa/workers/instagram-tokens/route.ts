// Renovação diária dos tokens do Instagram (60 dias). Token vencido é canal
// morto sem aviso: a pessoa escreve no Direct e ninguém responde.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaChannel } from "@wa/models/channel";
import { encrypt } from "@wa/lib/crypto";
import { safeDecrypt } from "@wa/lib/channels";
import { igRefreshToken } from "@wa/lib/instagram";

export const maxDuration = 60;

const RENEW_WITHIN_MS = 10 * 86400_000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await dbConnect();
  const due = await WaChannel.find({
    kind: "instagram",
    status: { $ne: "disconnected" },
    igTokenExpiresAt: { $lte: new Date(Date.now() + RENEW_WITHIN_MS) },
  });

  let renewed = 0;
  const failed: string[] = [];
  for (const ch of due) {
    const token = safeDecrypt(ch.igToken);
    if (!token) continue;
    try {
      const fresh = await igRefreshToken(token);
      ch.igToken = encrypt(fresh.accessToken);
      ch.igTokenExpiresAt = new Date(Date.now() + fresh.expiresIn * 1000);
      ch.status = "connected";
      ch.lastError = undefined;
      await ch.save();
      renewed++;
    } catch (err) {
      // Token já inválido (trocaram a senha / revogaram): o painel pede
      // reconexão, sem derrubar o resto.
      failed.push(String(ch._id));
      ch.status = "error";
      ch.lastError = err instanceof Error ? err.message : String(err);
      await ch.save();
      console.error("[instagram-tokens] falha ao renovar", String(ch._id), err);
    }
  }
  return NextResponse.json({ ok: true, renewed, failed });
}
