// Quadro societário (L0006) — consulta PAGA.
//   CNPJ → sócios; grava a empresa, os sócios e os vínculos.
//   CPF  → participações do sócio (as outras empresas dele).

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type PanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaTarget } from "@wa/models/base";
import { isValidCnpj, isValidCpf, onlyDigits } from "@wa/lib/documento";
import { ProcobError, ProcobRepeatError, lookup, normalizeQsa } from "@wa/lib/procob";
import {
  buildCnpjState,
  linkTargetPartners,
  lookupMeta,
  participationsWithBase,
  upsertPartner,
  upsertTarget,
} from "@wa/lib/enrichment";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let user: PanelUser;
  try {
    user = await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: "Consultas pagas são restritas a administradores" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    document?: string;
    refresh?: boolean;
    force?: boolean;
  };
  const document = onlyDigits(body.document);
  const isCnpj = isValidCnpj(document);
  const isCpf = isValidCpf(document);
  if (!isCnpj && !isCpf) {
    return NextResponse.json({ error: "CNPJ ou CPF inválido" }, { status: 400 });
  }

  await dbConnect();

  let lk;
  try {
    lk = await lookup("L0006", document, {
      refresh: body.refresh,
      force: body.force,
      requestedBy: user.email,
    });
  } catch (err) {
    if (err instanceof ProcobRepeatError) {
      // Já pesquisado há pouco: a tela pergunta se é para gastar de novo.
      return NextResponse.json(
        { error: err.message, code: "repetida", kind: "repeat", refreshedAt: err.refreshedAt },
        { status: 409 },
      );
    }
    if (err instanceof ProcobError) {
      return NextResponse.json(
        { error: err.message, code: err.code ?? null, kind: err.kind },
        { status: err.httpStatus },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha na consulta" },
      { status: 500 },
    );
  }

  // ── CPF: participações do sócio ────────────────────────────
  if (isCpf) {
    if (lk.kind !== "ok") {
      return NextResponse.json({ found: false, lookup: lookupMeta(lk), participations: [] });
    }
    const qsa = normalizeQsa(lk.content);
    return NextResponse.json({
      found: true,
      lookup: lookupMeta(lk),
      subject: qsa.subject,
      participations: await participationsWithBase(lk.content),
    });
  }

  // ── CNPJ: sócios ───────────────────────────────────────────
  if (lk.kind !== "ok") {
    return NextResponse.json({ state: await buildCnpjState(document, lk) });
  }

  const qsa = normalizeQsa(lk.content);
  const target = await upsertTarget({
    cnpj: document,
    legalName: qsa.subject?.name ?? null,
    status: qsa.subject?.status ?? null,
  });

  const linked: Array<{ partnerId: string; qsa: (typeof qsa.partners)[number] }> = [];
  for (const p of qsa.partners) {
    const row = await upsertPartner({
      document: p.document,
      name: p.name,
      kind: p.kind,
      deceased: p.deceased,
    });
    linked.push({ partnerId: row.id, qsa: p });
  }
  await linkTargetPartners(target.id, linked);

  // O sócio-gancho da empresa: o primeiro PF ativo, se ainda não houver um.
  // Falecido nunca vira gancho — é ele que a campanha chamaria pelo nome.
  if (!target.partnerId) {
    const vivos = linked.filter((l) => !l.qsa.deceased);
    const first =
      vivos.find((l) => l.qsa.kind === "PF" && l.qsa.active) ?? vivos.find((l) => l.qsa.kind === "PF");
    if (first) {
      await WaTarget.updateOne({ _id: target.id }, { partnerId: first.partnerId });
    }
  }

  return NextResponse.json({ state: await buildCnpjState(document, lk) });
}
