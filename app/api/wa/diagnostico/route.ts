// Diagnóstico das dependências externas — o que quebra o cadastro, o envio ou
// a IA, e que só aparecia no log da Vercel.
//
// Foi escrito depois de três clientes ouvirem "tive um problema para concluir
// seu cadastro" sem ninguém conseguir dizer por quê: o erro real (credencial
// do Firebase) morria em um `console.error` que ninguém lê.
//
// Tudo aqui é leitura: nenhuma conta é criada, nenhuma mensagem é enviada e
// nenhuma consulta paga é gasta.

import { NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { adminAuth, privateKeyShape } from "@/lib/firebase-admin";
import { getWabaCredentials } from "@wa/lib/settings";
import { fetchPhoneInfo } from "@wa/lib/meta";
import { procobCredentials } from "@wa/lib/procob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Check = {
  id: string;
  label: string;
  /** O que deixa de funcionar quando este item está quebrado. */
  impacto: string;
  ok: boolean;
  detail: string;
};

async function checar(
  id: string,
  label: string,
  impacto: string,
  fn: () => Promise<string>,
): Promise<Check> {
  try {
    return { id, label, impacto, ok: true, detail: await fn() };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      id,
      label,
      impacto,
      ok: false,
      detail: code ? `${code}: ${message}` : message,
    };
  }
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const checks = await Promise.all([
    checar("mongo", "Banco (MongoDB da zerokm)", "cadastro, conversas e campanhas", async () => {
      await dbConnect();
      await mongoose.connection.db?.admin().ping();
      return `conectado em "${mongoose.connection.db?.databaseName ?? "?"}"`;
    }),

    // É o item que derrubou o cadastro em agosto: sem esta credencial, a conta
    // do lojista não nasce e a IA não tem o que enviar.
    checar(
      "firebase",
      "Firebase Admin (contas dos lojistas)",
      "criar cadastro e ativar o teste de 24h",
      async () => {
        try {
          const r = await adminAuth.listUsers(1);
          return `credencial válida — projeto ${process.env.FIREBASE_PROJECT_ID ?? "?"} (${r.users.length} usuário lido)`;
        } catch (err) {
          // O erro do OpenSSL ("DECODER routines::unsupported") não diz o que
          // está errado. O retrato da chave — só formato, nunca conteúdo — diz.
          const f = privateKeyShape();
          const problemas = [
            !f.definida && "a variável está vazia",
            f.definida && !f.cabecalhoOk && "falta o cabeçalho -----BEGIN PRIVATE KEY-----",
            f.definida && !f.rodapeOk && "falta o rodapé -----END PRIVATE KEY-----",
            f.definida && f.linhas <= 1 && "está tudo numa linha só (as quebras se perderam)",
            f.aspas && "veio com aspas grudadas",
          ].filter(Boolean);
          const retrato = `chave: ${f.tamanho} caracteres, ${f.linhas} linha(s), origem ${f.origem}`;
          throw new Error(
            `${err instanceof Error ? err.message : String(err)} · ${retrato}` +
              (problemas.length ? ` · provável causa: ${problemas.join("; ")}` : ""),
          );
        }
      },
    ),

    checar("gemini", "Gemini (cérebro da IA)", "responder as mensagens", async () => {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY ausente");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(10_000), cache: "no-store" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return `chave válida — modelo ${process.env.GEMINI_MODEL ?? "gemini-3.5-flash"}`;
    }),

    checar("waba", "WhatsApp (Meta Cloud API)", "receber e enviar mensagens", async () => {
      const creds = await getWabaCredentials();
      if (!creds) throw new Error("token ou phone_number_id não configurados");
      const info = await fetchPhoneInfo(creds);
      return `número ${info.display_phone_number ?? "?"}${
        info.verified_name ? ` (${info.verified_name})` : ""
      }${info.quality_rating ? ` · qualidade ${info.quality_rating}` : ""}`;
    }),

    checar("mercadopago", "Mercado Pago", "gerar PIX e link de assinatura", async () => {
      const token = process.env.MP_ACCESS_TOKEN;
      if (!token) throw new Error("MP_ACCESS_TOKEN ausente");
      const res = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`o Mercado Pago respondeu ${res.status}`);
      const body = (await res.json()) as { nickname?: string; site_id?: string };
      return `conta ${body.nickname ?? "?"} (${body.site_id ?? "?"})`;
    }),

    checar("cnpja", "CNPJá", "buscar empresas para campanha", async () => {
      if (!process.env.CNPJA_API_KEY) throw new Error("CNPJA_API_KEY ausente");
      return "chave configurada";
    }),

    checar("procob", "Procob", "enriquecer sócios e telefones", async () => {
      const creds = procobCredentials();
      if (creds.sandbox) {
        throw new Error("sem PROCOB_API_USER/PWD — usando o sandbox (dados fictícios)");
      }
      return `conta ${creds.user.replace(/^(.{2}).+(@.+)$/, "$1…$2")}`;
    }),
  ]);

  return NextResponse.json({
    checks,
    ok: checks.every((c) => c.ok),
    checkedAt: new Date().toISOString(),
  });
}
