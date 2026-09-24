// Localização completa (L0001) — telefones e e-mails de um CPF (ou CNPJ).
//
//   GET  ?document=…  → o que já está guardado (sem custo)
//   POST { document } → consulta PAGA na Procob (ou cache, se já houver)

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requirePanelUser, type PanelUser } from "@wa/lib/auth";
import { isValidCnpj, isValidCpf, onlyDigits } from "@wa/lib/documento";
import { ProcobError, ProcobRepeatError, lookup, normalizePerson } from "@wa/lib/procob";
import {
  buildCpfState,
  cachedCpfState,
  listPartnerContacts,
  lookupMeta,
  savePartnerContacts,
  upsertPartner,
} from "@wa/lib/enrichment";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const document = onlyDigits(req.nextUrl.searchParams.get("document"));
  if (!isValidCpf(document) && !isValidCnpj(document)) {
    return NextResponse.json({ error: "CPF ou CNPJ inválido" }, { status: 400 });
  }
  return NextResponse.json({ state: await cachedCpfState(document) });
}

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
  if (!isValidCpf(document) && !isValidCnpj(document)) {
    return NextResponse.json({ error: "CPF ou CNPJ inválido" }, { status: 400 });
  }

  let lk;
  try {
    lk = await lookup("L0001", document, {
      refresh: body.refresh,
      force: body.force,
      requestedBy: user.email,
    });
  } catch (err) {
    if (err instanceof ProcobRepeatError) {
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

  if (lk.kind !== "ok") {
    // Sem dados (ou bloqueado por LGPD): ainda assim devolve o estado, para a
    // tela mostrar o motivo em vez de um erro seco.
    return NextResponse.json({
      found: false,
      lookup: lookupMeta(lk),
      person: null,
      contacts: [],
      partnerId: null,
      state: await buildCpfState(document, lk),
    });
  }

  const person = normalizePerson(lk.content);
  const partner = await upsertPartner({
    document,
    name: person.name ?? "",
    kind: document.length === 11 ? "PF" : "PJ",
    enrichedAt: new Date(),
    deceased: person.deceased === true,
  });
  await savePartnerContacts(partner.id, person, lk.id);
  const contacts = (await listPartnerContacts([partner.id]))[partner.id] ?? [];

  return NextResponse.json({
    found: true,
    lookup: lookupMeta(lk),
    partnerId: partner.id,
    person: {
      name: person.name,
      birthDate: person.birthDate,
      age: person.age,
      deceased: person.deceased,
      uf: person.uf,
      status: person.status,
      participations: person.participations,
    },
    contacts,
    state: await buildCpfState(document, lk),
  });
}
