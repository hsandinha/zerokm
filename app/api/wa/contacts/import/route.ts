// Importação da base de contatos da loja (ou do CNV) por CSV.
//
// A planilha é lida e mapeada no navegador (wa/components/contatos-importar.tsx);
// aqui chegam as linhas já nos campos da ficha. O servidor canoniza o
// telefone, deduplica e só PREENCHE o que está vazio: quem já é contato não
// perde o nome nem a ficha porque a planilha veio com a célula em branco.
// Qualquer pessoa da equipe importa (como no Chatrun); a base é sempre a da
// loja de quem importa.

import { NextRequest, NextResponse } from "next/server";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { ContatoError, importarContatos } from "@wa/lib/contatos-servidor";
import { CAMPOS_DO_CSV, type LinhaImportada } from "@wa/lib/contatos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CAMPOS = new Set<string>(CAMPOS_DO_CSV.map((c) => c.campo));

export async function POST(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }

  const body = (await req.json().catch(() => null)) as { rows?: unknown } | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Planilha inválida." }, { status: 400 });
  }
  // Só os campos da ficha, como texto: nada além disso entra no contato.
  const linhas: LinhaImportada[] = body.rows.map((r) => {
    const out: LinhaImportada = {};
    if (r && typeof r === "object") {
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        if (CAMPOS.has(k) && (typeof v === "string" || typeof v === "number")) {
          out[k as keyof LinhaImportada] = String(v).slice(0, 2000);
        }
      }
    }
    return out;
  });

  try {
    return NextResponse.json({ ok: true, ...(await importarContatos(scope.tenantId, linhas)) });
  } catch (err) {
    if (err instanceof ContatoError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
