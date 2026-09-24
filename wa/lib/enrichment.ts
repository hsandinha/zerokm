// Enriquecimento: o que fica no banco depois de uma consulta à Procob.
//
// A consulta crua vive em `wa_lookups`; aqui ela vira sócio (`wa_partners`),
// vínculo empresa↔sócio (`wa_targets.partners`) e candidatos a contato
// (`wa_partner_contacts`). Nada disso vira contato de WhatsApp sozinho — quem
// escolhe o número é a pessoa na tela.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaContact } from "@wa/models/wa";
import { WaPartner, WaPartnerContact, WaTarget } from "@wa/models/base";
import User from "@/models/User";
import { onlyDigits } from "@wa/lib/documento";
import {
  PROCOB_CODES,
  classifyCode,
  getCachedLookup,
  normalizePerson,
  normalizeQsa,
  type Lookup,
  type PersonResult,
  type ProcobCodeKind,
  type QsaPartner,
} from "@wa/lib/procob";

export type PartnerRow = {
  id: string;
  document: string;
  name: string;
  kind: "PF" | "PJ";
  enrichedAt: string | null;
  deceased: boolean;
};

/** Garante o sócio em `wa_partners` (chave: CPF/CNPJ) e devolve o id. */
export async function upsertPartner(params: {
  document: string;
  name: string;
  kind: "PF" | "PJ";
  enrichedAt?: Date | null;
  /** Óbito acusado pela Procob. Só liga — nunca desmarca quem já está marcado. */
  deceased?: boolean;
}): Promise<PartnerRow> {
  await dbConnect();
  const document = onlyDigits(params.document);

  const existing = await WaPartner.findOne({ taxId: document });
  if (existing) {
    // Nome da Procob vence "(sem nome)" e nomes vazios; não sobrescreve um bom.
    if (
      params.name &&
      params.name !== "(sem nome)" &&
      (!existing.name || existing.name.length < 3)
    ) {
      existing.name = params.name;
    }
    if (params.enrichedAt) existing.enrichedAt = params.enrichedAt;
    if (existing.kind !== params.kind) existing.kind = params.kind;
    if (params.deceased && !existing.deceased) existing.deceased = true;
    await existing.save();
    return {
      id: String(existing._id),
      document,
      name: existing.name,
      kind: existing.kind,
      enrichedAt: existing.enrichedAt ? existing.enrichedAt.toISOString() : null,
      deceased: existing.deceased,
    };
  }

  const created = await WaPartner.create({
    taxId: document,
    name: params.name || document,
    kind: params.kind,
    enrichedAt: params.enrichedAt ?? undefined,
    deceased: Boolean(params.deceased),
  });
  return {
    id: String(created._id),
    document,
    name: created.name,
    kind: created.kind,
    enrichedAt: created.enrichedAt ? created.enrichedAt.toISOString() : null,
    deceased: created.deceased,
  };
}

/** Quem já tem conta na CNV não é prospect: o documento vira supressão. */
export async function isAlreadyCustomer(document: string): Promise<boolean> {
  const d = onlyDigits(document);
  if (d.length !== 11 && d.length !== 14) return false;
  await dbConnect();
  const user = await User.findOne({ cpf: d }).select("_id").lean();
  return Boolean(user);
}

export type TargetRow = {
  id: string;
  cnpj: string;
  legalName: string | null;
  isClient: boolean;
  status: string;
  phone: string | null;
  partnerId: string | null;
  city: string | null;
  state: string | null;
};

function targetRow(t: {
  _id: unknown;
  cnpj: string;
  legalName?: string | null;
  status: string;
  suppressedReason?: string | null;
  phone?: string | null;
  partnerId?: unknown;
  city?: string | null;
  state?: string | null;
}): TargetRow {
  return {
    id: String(t._id),
    cnpj: t.cnpj,
    legalName: t.legalName ?? null,
    isClient: t.status === "suppressed" && /cliente/i.test(t.suppressedReason ?? ""),
    status: t.status,
    phone: t.phone ?? null,
    partnerId: t.partnerId ? String(t.partnerId) : null,
    city: t.city ?? null,
    state: t.state ?? null,
  };
}

/** Garante a empresa (CNPJ) em `wa_targets`. Quem já é cliente entra suprimido. */
export async function upsertTarget(params: {
  cnpj: string;
  legalName: string | null;
  status?: string | null;
  source?: "cnpja" | "csv" | "manual" | "procob";
}): Promise<TargetRow> {
  await dbConnect();
  const cnpj = onlyDigits(params.cnpj);

  const existing = await WaTarget.findOne({ cnpj });
  if (existing) {
    if (!existing.legalName && params.legalName) {
      existing.legalName = params.legalName;
      await existing.save();
    }
    return targetRow(existing);
  }

  const isClient = await isAlreadyCustomer(cnpj);
  const created = await WaTarget.create({
    cnpj,
    legalName: params.legalName ?? undefined,
    status: isClient ? "suppressed" : "new",
    suppressedReason: isClient ? "já é cliente da CNV" : undefined,
    source: params.source ?? "procob",
    raw: { origem: params.source ?? "procob", situacao_receita: params.status ?? null },
  });
  return targetRow(created);
}

/** Liga os sócios do QSA à empresa (idempotente). */
export async function linkTargetPartners(
  targetId: string,
  partners: Array<{ partnerId: string; qsa: QsaPartner }>,
) {
  if (partners.length === 0) return;
  await dbConnect();
  const target = await WaTarget.findById(targetId);
  if (!target) return;

  for (const { partnerId, qsa } of partners) {
    const oid = new mongoose.Types.ObjectId(partnerId);
    const current = target.partners.find((p) => String(p.partnerId) === partnerId);
    if (current) {
      current.role = qsa.condition ?? undefined;
      current.active = qsa.active;
    } else {
      target.partners.push({ partnerId: oid, role: qsa.condition ?? undefined, active: qsa.active });
    }
  }
  await target.save();
}

/** Guarda telefones e e-mails candidatos do sócio (idempotente). */
export async function savePartnerContacts(
  partnerId: string,
  person: PersonResult,
  lookupId: string,
) {
  await dbConnect();
  const oid = new mongoose.Types.ObjectId(partnerId);
  const lookupOid = new mongoose.Types.ObjectId(lookupId);
  const rows = [
    ...person.phones.map((p) => ({
      kind: p.kind,
      value: p.value,
      e164: p.e164 ?? undefined,
      operator: p.operator ?? undefined,
      score: p.score ?? undefined,
      infoAge: p.infoAge ?? undefined,
      preferred: p.preferred,
    })),
    ...person.emails.map((e) => ({
      kind: "email" as const,
      value: e.email,
      e164: undefined,
      operator: undefined,
      score: e.score ?? undefined,
      infoAge: e.infoAge ?? undefined,
      preferred: e.preferred,
    })),
  ];
  if (rows.length === 0) return;

  await WaPartnerContact.bulkWrite(
    rows.map((r) => ({
      updateOne: {
        filter: { partnerId: oid, kind: r.kind, value: r.value },
        update: { $set: { ...r, partnerId: oid, source: "procob", lookupId: lookupOid } },
        upsert: true,
      },
    })),
  );
}

export type PartnerContactRow = {
  id: string;
  kind: "celular" | "fixo" | "comercial" | "outros" | "email";
  value: string;
  e164: string | null;
  operator: string | null;
  score: number | null;
  infoAge: string | null;
  preferred: boolean;
  /** Já existe como contato de WhatsApp? */
  contactId: string | null;
  contactTargetId: string | null;
};

/** Candidatos guardados de vários sócios, já marcando os que viraram contato. */
export async function listPartnerContacts(
  partnerIds: string[],
): Promise<Record<string, PartnerContactRow[]>> {
  const out: Record<string, PartnerContactRow[]> = {};
  if (partnerIds.length === 0) return out;
  await dbConnect();

  const rows = await WaPartnerContact.find({ partnerId: { $in: partnerIds } }).lean();
  const phones = [...new Set(rows.map((r) => r.e164).filter(Boolean))] as string[];
  const contacts = phones.length
    ? await WaContact.find({ phone: { $in: phones } }).select("phone targetId").lean()
    : [];
  const contactByPhone = new Map(contacts.map((c) => [c.phone, c]));

  const KIND_ORDER: Record<string, number> = {
    celular: 0,
    comercial: 1,
    fixo: 2,
    outros: 3,
    email: 4,
  };
  for (const r of rows) {
    const contact = r.e164 ? contactByPhone.get(r.e164) : undefined;
    (out[String(r.partnerId)] ??= []).push({
      id: String(r._id),
      kind: r.kind,
      value: r.value,
      e164: r.e164 ?? null,
      operator: r.operator ?? null,
      score: r.score ?? null,
      infoAge: r.infoAge ?? null,
      preferred: r.preferred,
      contactId: contact ? String(contact._id) : null,
      contactTargetId: contact?.targetId ? String(contact.targetId) : null,
    });
  }
  for (const list of Object.values(out)) {
    list.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        Number(b.preferred) - Number(a.preferred) ||
        (b.score ?? -99) - (a.score ?? -99),
    );
  }
  return out;
}

// ── Estado de um CNPJ para a tela (só leitura do cache — sem custo) ──

export type LookupMeta = {
  code: string;
  kind: ProcobCodeKind;
  message: string | null;
  /** Ressalva a mostrar mesmo em sucesso (023 incompleta, 025 cache, LGPD). */
  note: string | null;
  cached: boolean;
  sandbox: boolean;
  saldo: string | null;
  refreshedAt: string;
};

function noteFor(code: string, kind: ProcobCodeKind): string | null {
  if (kind === "blocked") return PROCOB_CODES[code]?.label ?? "Dados bloqueados (LGPD)";
  if (kind === "ok" && code !== "000") return PROCOB_CODES[code]?.label ?? null;
  return null;
}

export function lookupMeta(lk: Lookup): LookupMeta {
  return {
    code: lk.code,
    kind: lk.kind,
    message: lk.message,
    note: noteFor(lk.code, lk.kind),
    cached: lk.cached,
    sandbox: lk.sandbox,
    saldo: lk.saldo,
    refreshedAt: lk.refreshedAt,
  };
}

export type PartnerState = QsaPartner & {
  partnerId: string | null;
  /** Já há consulta L0001 guardada para este sócio? */
  personLookup: LookupMeta | null;
  person: {
    name: string | null;
    birthDate: string | null;
    age: string | null;
    deceased: boolean | null;
    uf: string | null;
    status: string | null;
    participations: number | null;
  } | null;
  contacts: PartnerContactRow[];
};

export type CnpjState = {
  cnpj: string;
  found: boolean;
  lookup: LookupMeta;
  subject: { document: string; name: string | null; status: string | null } | null;
  target: TargetRow | null;
  /** Sócios abordáveis — os falecidos saem daqui. */
  partners: PartnerState[];
  /** Titulares falecidos: fora da lista e da campanha, listados à parte. */
  deceasedPartners: PartnerState[];
  /** Empresas em que o próprio CNPJ é sócio. */
  participations: Array<{
    cnpj: string;
    name: string;
    condition: string | null;
    active: boolean;
    status: string | null;
  }>;
};

export async function buildCnpjState(cnpj: string, lk: Lookup): Promise<CnpjState> {
  await dbConnect();
  const base: CnpjState = {
    cnpj,
    found: lk.kind === "ok",
    lookup: lookupMeta(lk),
    subject: null,
    target: null,
    partners: [],
    deceasedPartners: [],
    participations: [],
  };
  if (!base.found) return base;

  const qsa = normalizeQsa(lk.content);
  base.subject = qsa.subject;
  base.participations = qsa.participations.map((p) => ({
    cnpj: p.cnpj,
    name: p.name,
    condition: p.condition,
    active: p.active,
    status: p.status,
  }));

  const target = await WaTarget.findOne({ cnpj }).lean();
  if (target) base.target = targetRow(target);

  const docs = qsa.partners.map((p) => p.document);
  const [partnerRows, personLookups] = await Promise.all([
    docs.length ? WaPartner.find({ taxId: { $in: docs } }).lean() : Promise.resolve([]),
    docs.length
      ? (await import("@wa/models/base")).WaLookup.find({
          product: "L0001",
          document: { $in: docs },
        }).lean()
      : Promise.resolve([]),
  ]);

  const partnerByDoc = new Map(partnerRows.map((r) => [r.taxId as string, r]));
  const lookupByDoc = new Map(personLookups.map((r) => [r.document, r]));
  const contactsByPartner = await listPartnerContacts(partnerRows.map((r) => String(r._id)));

  const all: PartnerState[] = qsa.partners.map((p) => {
    const row = partnerByDoc.get(p.document);
    const plk = lookupByDoc.get(p.document);
    const pkind = plk ? classifyCode(plk.code, plk.message ?? null).kind : null;
    const personLookup: LookupMeta | null =
      plk && pkind
        ? {
            code: plk.code,
            kind: pkind,
            message: plk.message ?? null,
            note: noteFor(plk.code, pkind),
            cached: true,
            sandbox: Boolean(plk.sandbox),
            saldo: plk.saldo ?? null,
            refreshedAt: new Date(plk.refreshedAt).toISOString(),
          }
        : null;
    const person = plk && pkind === "ok" ? normalizePerson(plk.content) : null;
    return {
      ...p,
      name: p.name === "(sem nome)" && row?.name ? row.name : p.name,
      // O QSA acusa o óbito de graça; a L0001 (quando já existe) confirma.
      deceased: p.deceased || person?.deceased === true || Boolean(row?.deceased),
      partnerId: row ? String(row._id) : null,
      personLookup,
      person: person
        ? {
            name: person.name,
            birthDate: person.birthDate,
            age: person.age,
            deceased: person.deceased,
            uf: person.uf,
            status: person.status,
            participations: person.participations,
          }
        : null,
      contacts: row ? (contactsByPartner[String(row._id)] ?? []) : [],
    };
  });

  base.partners = all.filter((p) => !p.deceased);
  base.deceasedPartners = all.filter((p) => p.deceased);

  return base;
}

/** Estado sem custo: só o que já está guardado. */
export async function cachedCnpjState(cnpj: string): Promise<CnpjState | null> {
  const lk = await getCachedLookup("L0006", cnpj);
  if (!lk) return null;
  return buildCnpjState(cnpj, lk);
}

// ── Enriquecimento direto por CPF (pulando o CNPJ) ───────────

export type CpfPerson = {
  name: string | null;
  birthDate: string | null;
  age: string | null;
  deceased: boolean | null;
  uf: string | null;
  status: string | null;
  participations: number | null;
};

export type CpfState = {
  cpf: string;
  found: boolean;
  lookup: LookupMeta;
  partnerId: string | null;
  /** Nome guardado em `wa_partners` — vale quando a Procob não devolve o nome. */
  partnerName: string | null;
  person: CpfPerson | null;
  contacts: PartnerContactRow[];
  /** Empresas do sócio (L0006 pelo CPF), quando já consultadas. */
  participations: Array<{
    cnpj: string;
    name: string;
    condition: string | null;
    since: string | null;
    active: boolean;
    status: string | null;
    isClient: boolean;
    targetId: string | null;
    targetStatus: string | null;
  }> | null;
  participationsLookup: LookupMeta | null;
};

/** Participações do CPF com o cruzamento da nossa base (cliente? já é alvo?). */
export async function participationsWithBase(content: unknown) {
  await dbConnect();
  const qsa = normalizeQsa(content);
  const cnpjs = qsa.participations.map((p) => p.cnpj);
  const [targets, customers] = await Promise.all([
    cnpjs.length ? WaTarget.find({ cnpj: { $in: cnpjs } }).select("cnpj status").lean() : [],
    cnpjs.length ? User.find({ cpf: { $in: cnpjs } }).select("cpf").lean() : [],
  ]);
  const targetByCnpj = new Map(targets.map((t) => [t.cnpj, t]));
  const customerSet = new Set(customers.map((c) => c.cpf as string));
  return qsa.participations.map((p) => {
    const t = targetByCnpj.get(p.cnpj);
    return {
      ...p,
      isClient: customerSet.has(p.cnpj),
      targetId: t ? String(t._id) : null,
      targetStatus: t?.status ?? null,
    };
  });
}

export async function buildCpfState(cpf: string, lk: Lookup): Promise<CpfState> {
  await dbConnect();
  const partner = await WaPartner.findOne({ taxId: cpf }).select("name").lean();
  const partnerId = partner ? String(partner._id) : null;

  const [contactsByPartner, qsaLookup] = await Promise.all([
    partnerId
      ? listPartnerContacts([partnerId])
      : Promise.resolve({} as Record<string, PartnerContactRow[]>),
    getCachedLookup("L0006", cpf),
  ]);

  const person = lk.kind === "ok" ? normalizePerson(lk.content) : null;
  return {
    cpf,
    found: lk.kind === "ok",
    lookup: lookupMeta(lk),
    partnerId,
    partnerName: partner?.name ?? null,
    person: person
      ? {
          name: person.name,
          birthDate: person.birthDate,
          age: person.age,
          deceased: person.deceased,
          uf: person.uf,
          status: person.status,
          participations: person.participations,
        }
      : null,
    contacts: partnerId ? (contactsByPartner[partnerId] ?? []) : [],
    participations:
      qsaLookup && qsaLookup.kind === "ok" ? await participationsWithBase(qsaLookup.content) : null,
    participationsLookup: qsaLookup ? lookupMeta(qsaLookup) : null,
  };
}

/** Estado do CPF sem custo: só o que já está guardado. */
export async function cachedCpfState(cpf: string): Promise<CpfState | null> {
  const lk = await getCachedLookup("L0001", cpf);
  if (!lk) return null;
  return buildCpfState(cpf, lk);
}
