// Quem entra no painel.
//
// Duas coisas distintas moram aqui: a CONTA (Firebase da zerokm, com a senha)
// e a PERMISSÃO (coleção `wa_admins`, com o papel). O painel não cria conta —
// quem cria é o cadastro da zerokm; aqui se dá (e se tira) acesso.
//
// Enquanto a lista estiver vazia, qualquer administrador da zerokm entra. Ao
// cadastrar o primeiro nome, a lista passa a mandar — por isso a tela avisa
// que quem não estiver nela perde o acesso.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaAdmin } from "@wa/models/panel";
import User from "@/models/User";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  await dbConnect();
  const admins = await WaAdmin.find().sort({ createdAt: 1 }).lean();

  // Cruza com a base da zerokm para mostrar quem realmente tem conta — sem
  // conta, a pessoa está na lista mas não consegue entrar.
  const contas = await User.find({ email: { $in: admins.map((a) => a.email) } })
    .select("email displayName allowedProfiles")
    .lean();
  const contaPorEmail = new Map(contas.map((u) => [String(u.email).toLowerCase(), u]));

  return NextResponse.json({
    users: admins.map((a) => {
      const conta = contaPorEmail.get(a.email);
      return {
        email: a.email,
        name: a.name ?? conta?.displayName ?? null,
        role: a.role ?? "admin",
        createdAt: a.createdAt,
        createdBy: a.createdBy ?? null,
        lastSignInAt: a.lastSignInAt ?? null,
        hasAccount: Boolean(conta),
        zerokmProfiles: conta?.allowedProfiles ?? [],
      };
    }),
    /** Lista vazia = ainda no modo bootstrap (todo administrador da zerokm entra). */
    bootstrap: admins.length === 0,
  });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    role?: "admin" | "operador";
  };

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }
  const role = body.role === "operador" ? "operador" : "admin";

  await dbConnect();
  if (await WaAdmin.exists({ email })) {
    return NextResponse.json({ error: "Este e-mail já tem acesso ao painel" }, { status: 400 });
  }

  const conta = await User.findOne({ email }).select("displayName").lean();
  await WaAdmin.create({
    email,
    name: body.name?.trim() || conta?.displayName || undefined,
    role,
    createdBy: session.email,
  });

  return NextResponse.json({
    ok: true,
    hasAccount: Boolean(conta),
    message: conta
      ? `${email} já pode entrar com a senha da conta CNV.`
      : `Acesso liberado, mas ${email} ainda não tem conta na CNV — a pessoa precisa se cadastrar em cnv0km.com.br antes de conseguir entrar.`,
  });
}
