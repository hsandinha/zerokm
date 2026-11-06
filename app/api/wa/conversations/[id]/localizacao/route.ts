// "Enviar localização": o link do mapa que a loja cadastrou na Configuração,
// como texto (o mesmo que a IA manda quando perguntam o endereço).

import { NextRequest, NextResponse } from "next/server";
import { requireScope, scopeError, type Scope } from "@wa/lib/scope";
import { WaContact } from "@wa/models/wa";
import { getStore } from "@wa/lib/store";
import { MetaApiError } from "@wa/lib/meta";
import { sendAndLogText } from "@wa/lib/send";
import { assumirAoResponder, autorDoEscopo, conversaDoEscopo } from "@wa/lib/central";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: Scope;
  try {
    user = await requireScope();
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
  const { id } = await params;
  const store = await getStore(user.tenantId);
  const mapsUrl = store?.mapsUrl?.trim();
  if (!store || !mapsUrl) {
    return NextResponse.json({ error: "Cadastre o link do Google Maps da loja na Configuração." }, { status: 400 });
  }
  const conv = await conversaDoEscopo(user, id);
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const contact = await WaContact.findById(conv.contactId).select("phone").lean();
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  try {
    await sendAndLogText({
      conversationId: id,
      to: contact.phone,
      text: `📍 ${store.name}\n${mapsUrl}`,
      sender: "human",
      author: autorDoEscopo(user),
    });
  } catch (err) {
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao enviar" }, { status });
  }
  await assumirAoResponder(conv, user.email);
  return NextResponse.json({ ok: true });
}
