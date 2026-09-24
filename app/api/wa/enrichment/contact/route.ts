// Promove um telefone candidato a contato de WhatsApp (sem custo).
// Também preenche o telefone da empresa se ela ainda não tiver um — é o que
// coloca a empresa na fila de campanha.

import { NextRequest, NextResponse } from "next/server";
import { requirePanelUser } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaContact } from "@wa/models/wa";
import { WaPartner, WaTarget } from "@wa/models/base";
import { parsePhoneBr } from "@wa/lib/phone";

export async function POST(req: NextRequest) {
  try {
    await requirePanelUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    partnerId?: string;
    targetId?: string | null;
    phone?: string;
    email?: string | null;
  };
  const parsed = parsePhoneBr(body.phone);
  if (!parsed.valid || !parsed.e164) {
    return NextResponse.json({ error: "Telefone inválido para WhatsApp" }, { status: 400 });
  }
  if (parsed.kind !== "movel") {
    return NextResponse.json(
      { error: "Só celular recebe WhatsApp — este número é fixo" },
      { status: 400 },
    );
  }
  if (!body.partnerId) return NextResponse.json({ error: "Sócio não informado" }, { status: 400 });

  await dbConnect();
  const partner = await WaPartner.findById(body.partnerId).lean();
  if (!partner) return NextResponse.json({ error: "Sócio não encontrado" }, { status: 404 });

  const target = body.targetId ? await WaTarget.findById(body.targetId) : null;
  const email = body.email?.trim().toLowerCase() || undefined;

  const existing = await WaContact.findOne({ phone: parsed.e164 });
  let contactId: string;
  let created = false;

  if (existing) {
    // Não sobrescreve o que já existe: o dado do bureau completa, não manda.
    existing.name = existing.name ?? partner.name;
    existing.email = existing.email ?? email;
    existing.document = existing.document ?? partner.taxId;
    existing.targetId = existing.targetId ?? target?._id;
    existing.company = existing.company ?? target?.legalName;
    await existing.save();
    contactId = String(existing._id);
  } else {
    const novo = await WaContact.create({
      phone: parsed.e164,
      name: partner.name,
      email,
      document: partner.taxId,
      company: target?.legalName,
      city: target?.city,
      state: target?.state,
      targetId: target?._id,
      source: "procob",
    });
    contactId = String(novo._id);
    created = true;
  }

  let targetUpdated = false;
  if (target) {
    if (!target.phone) {
      target.phone = parsed.e164;
      target.phoneSource = "procob";
      // Empresa com telefone entra na fila de disparo.
      if (target.status === "new") target.status = "ready";
      targetUpdated = true;
    }
    if (!target.partnerId) {
      target.partnerId = partner._id;
      targetUpdated = true;
    }
    if (!target.contactName) {
      target.contactName = partner.name;
      targetUpdated = true;
    }
    if (!target.email && email) {
      target.email = email;
      targetUpdated = true;
    }
    if (targetUpdated) await target.save();
  }

  return NextResponse.json({ contactId, created, targetUpdated, phone: parsed.e164 });
}
