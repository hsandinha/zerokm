// Alterar papel/nome e remover — sempre com as travas que impedem alguém de
// se trancar para fora do painel.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaAdmin } from "@wa/models/panel";

type Params = { params: Promise<{ email: string }> };

/** Quantos administradores restam além deste. */
async function otherAdminsCount(excludingEmail: string): Promise<number> {
  return WaAdmin.countDocuments({ role: "admin", email: { $ne: excludingEmail } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const email = decodeURIComponent((await params).email).toLowerCase();
  const body = (await req.json().catch(() => ({}))) as {
    role?: "admin" | "operador";
    name?: string;
  };

  await dbConnect();
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim() || undefined;

  if (body.role) {
    const role = body.role === "operador" ? "operador" : "admin";
    // Rebaixar o último admin deixaria o painel sem ninguém que configure.
    if (role === "operador" && (await otherAdminsCount(email)) === 0) {
      return NextResponse.json(
        { error: "Este é o único administrador — promova outra pessoa antes de rebaixar." },
        { status: 400 },
      );
    }
    if (role === "operador" && email === session.email) {
      return NextResponse.json(
        { error: "Você não pode rebaixar a si mesmo. Peça a outro administrador." },
        { status: 400 },
      );
    }
    patch.role = role;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para alterar" }, { status: 400 });
  }

  const updated = await WaAdmin.updateOne({ email }, patch);
  if (updated.matchedCount === 0) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const email = decodeURIComponent((await params).email).toLowerCase();
  if (email === session.email) {
    return NextResponse.json({ error: "Você não pode remover o próprio acesso." }, { status: 400 });
  }

  await dbConnect();
  const target = await WaAdmin.findOne({ email }).lean();
  if (!target) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (target.role === "admin" && (await otherAdminsCount(email)) === 0) {
    return NextResponse.json(
      { error: "Este é o único administrador — o painel ficaria sem ninguém para configurar." },
      { status: 400 },
    );
  }

  await WaAdmin.deleteOne({ email });
  // A conta na zerokm continua existindo: aqui só se tira a permissão de
  // operar o painel, e isso é reversível.
  return NextResponse.json({ ok: true });
}
