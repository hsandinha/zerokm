// Busca leve de conversas da loja para ligar um agendamento ou uma tarefa
// ("Fulano", "(31) 9987", "@perfil"). A fila da Central faz bem mais conta
// (contadores, funil); aqui é só achar o contato.
//
// GET ?q=texto  →  { conversas: [{ id, nome, telefone }] }

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { requireScope, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(req: NextRequest) {
  let scope: Scope;
  try {
    scope = await requireScope("agenda");
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ conversas: [] });

  await dbConnect();
  const termo = new RegExp(escapar(q), "i");
  const ou: Record<string, unknown>[] = [{ name: termo }, { igUsername: termo }, { company: termo }];
  const digitos = q.replace(/\D/g, "");
  if (digitos.length >= 3) ou.push({ phone: new RegExp(escapar(digitos)) }, { whatsappPhone: new RegExp(escapar(digitos)) });
  const contatos = await WaContact.find({ ...tenantFilter(scope), $or: ou })
    .select("name phone whatsappPhone igUsername")
    .limit(20)
    .lean();
  if (!contatos.length) return NextResponse.json({ conversas: [] });
  const convs = await WaConversation.find({ ...tenantFilter(scope), contactId: { $in: contatos.map((c) => c._id) } })
    .select("contactId lastMessageAt")
    .sort({ lastMessageAt: -1 })
    .limit(20)
    .lean();
  const porContato = new Map(contatos.map((c) => [String(c._id), c]));
  return NextResponse.json({
    conversas: convs.map((c) => {
      const ct = porContato.get(String(c.contactId));
      return {
        id: String(c._id),
        nome: ct?.name || (ct?.igUsername ? `@${ct.igUsername}` : null),
        telefone: ct?.whatsappPhone || (ct?.phone && !/^(ig|fb):/.test(ct.phone) ? ct.phone : null),
      };
    }),
  });
}
