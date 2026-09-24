// Transforma uma participação (outra empresa do sócio) em alvo de prospecção,
// já ligada ao sócio. É o quadro societário virando fila — sem custo.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@wa/lib/auth";
import dbConnect from "@/lib/mongodb";
import { WaContact } from "@wa/models/wa";
import { WaPartner, WaTarget } from "@wa/models/base";
import { isValidCnpj, onlyDigits } from "@wa/lib/documento";
import { upsertTarget } from "@wa/lib/enrichment";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    cnpj?: string;
    name?: string | null;
    partnerId?: string;
    condition?: string | null;
  };
  const cnpj = onlyDigits(body.cnpj);
  if (!isValidCnpj(cnpj)) return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
  if (!body.partnerId) return NextResponse.json({ error: "Sócio não informado" }, { status: 400 });

  await dbConnect();
  const row = await upsertTarget({ cnpj, legalName: body.name ?? null });
  const target = await WaTarget.findById(row.id);
  if (!target) return NextResponse.json({ error: "Falha ao gravar a empresa" }, { status: 500 });

  const partnerOid = new mongoose.Types.ObjectId(body.partnerId);
  if (!target.partners.some((p) => String(p.partnerId) === body.partnerId)) {
    target.partners.push({
      partnerId: partnerOid,
      role: body.condition ?? undefined,
      active: true,
    });
  }
  if (!target.partnerId) target.partnerId = partnerOid;

  // Se o sócio já tem um contato de WhatsApp escolhido, a empresa nasce com
  // telefone — e já entra na fila.
  if (!target.phone) {
    const partner = await WaPartner.findById(body.partnerId).select("taxId").lean();
    if (partner?.taxId) {
      const contact = await WaContact.findOne({ document: partner.taxId, optOut: false })
        .select("phone name")
        .lean();
      if (contact) {
        target.phone = contact.phone;
        target.phoneSource = "procob";
        target.contactName = target.contactName ?? contact.name;
        if (target.status === "new") target.status = "ready";
      }
    }
  }
  await target.save();

  return NextResponse.json({
    targetId: String(target._id),
    status: target.status,
    isClient: row.isClient,
    phone: target.phone ?? null,
  });
}
