// Chaves de API — listar e gerar. A chave inteira só volta na criação.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type PanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaApiKey } from "@wa/models/panel";
import { generateApiKey } from "@wa/lib/api-keys";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }
  await dbConnect();
  const keys = await WaApiKey.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: String(k._id),
      name: k.name,
      prefix: k.prefix,
      createdBy: k.createdBy ?? null,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt ?? null,
      calls: k.calls,
      revokedAt: k.revokedAt ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  let user: PanelUser;
  try {
    user = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Dê um nome à chave (ex.: ERP, site, n8n)" },
      { status: 400 },
    );
  }

  await dbConnect();
  const { key, prefix, hash } = generateApiKey();
  const created = await WaApiKey.create({ name, prefix, keyHash: hash, createdBy: user.email });

  return NextResponse.json({
    id: String(created._id),
    name,
    prefix,
    key,
    createdAt: created.createdAt,
  });
}
