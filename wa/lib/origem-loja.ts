// Grava a origem do lead (o anúncio que abriu a conversa): na conversa, no
// contato (primeira e última) e no catálogo de anúncios da loja. Chamado pelo
// inbound (wa/lib/inbound.ts) quando a mensagem chega com referral.
//
// Tudo aqui é best-effort: o anúncio é um extra. Falha ao gravar ou ao baixar
// a imagem nunca derruba a mensagem que chegou junto.

import { after } from "next/server";
import type mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { WaAnuncio, type WaOrigem } from "@wa/models/origem";
import { linkDaMidia, salvarMidiaSaida } from "@wa/lib/midia-saida";
import type { OrigemRecebida } from "@wa/lib/origem";
import { registrarEventoDaColuna } from "@wa/lib/conversoes-meta-servidor";

type Id = mongoose.Types.ObjectId | string;

export async function registrarOrigem(p: {
  tenantId: string | null;
  contactId: Id;
  conversationId: Id;
  origem: OrigemRecebida;
}): Promise<WaOrigem> {
  await dbConnect();
  const em = new Date();
  const { tenantId, origem } = p;

  // O catálogo já pode ter a cópia da imagem deste anúncio: reaproveita.
  const anuncio = origem.idOrigem
    ? await WaAnuncio.findOneAndUpdate(
        { tenantId, idOrigem: origem.idOrigem },
        {
          // O retrato acompanha o último referral; o apelido nunca é tocado.
          $set: {
            canal: origem.canal,
            titulo: origem.titulo ?? null,
            texto: origem.texto ?? null,
            link: origem.link ?? null,
            midia: origem.midia ?? null,
            ultimaEm: em,
          },
          $inc: { conversas: 1 },
          $setOnInsert: { primeiraEm: em },
        },
        { upsert: true, new: true },
      ).catch((err) => {
        console.warn("[origem] catálogo não atualizado:", err instanceof Error ? err.message : err);
        return null;
      })
    : null;

  const valor: WaOrigem = { ...origem, midiaId: anuncio?.midiaId ?? null, em };
  await Promise.all([
    WaConversation.updateOne({ _id: p.conversationId }, { origem: valor }),
    WaContact.updateOne({ _id: p.contactId }, { origemUltima: valor }),
    // A primeira fica: é por ela que se sabe de onde o cliente veio de verdade.
    WaContact.updateOne({ _id: p.contactId, origemPrimeira: null }, { origemPrimeira: valor }),
  ]);

  // Conversa nova que chegou pelo anúncio: o cartão acabou de entrar na
  // primeira coluna, que pode mandar evento para a Meta (LeadSubmitted, por
  // exemplo). Só a conversa nova: a antiga não reenvia a coluna em que já
  // estava. Nunca lança.
  await registrarEventoDaColuna({ conversationId: p.conversationId, por: "anuncio", soConversaNova: true });

  if (!valor.midiaId && valor.imagemUrl) {
    const copiar = () =>
      copiarImagemDaOrigem({
        tenantId,
        conversationId: p.conversationId,
        contactId: p.contactId,
        idOrigem: valor.idOrigem ?? null,
        em,
        imagemUrl: valor.imagemUrl!,
      });
    // Baixar a imagem não pode atrasar a mensagem: roda depois da resposta.
    // Fora de uma requisição (worker, teste) o after não existe: roda solto.
    try {
      after(copiar);
    } catch {
      void copiar();
    }
  }
  return valor;
}

/**
 * Copia a imagem do anúncio (o link da Meta vence em dias) para
 * wa_midias_saida e põe o id na conversa, no contato e no catálogo. Só mexe
 * se o anúncio gravado ainda for o mesmo (a data confere).
 */
export async function copiarImagemDaOrigem(p: {
  tenantId: string | null;
  conversationId: Id;
  contactId: Id;
  idOrigem: string | null;
  em: Date;
  imagemUrl: string;
}): Promise<void> {
  if (!/^https:\/\//i.test(p.imagemUrl)) return;
  try {
    const res = await fetch(p.imagemUrl, { signal: AbortSignal.timeout(8000) });
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !/^image\/(jpeg|png)$/.test(mime)) return;
    const bytes = Buffer.from(await res.arrayBuffer());
    const { id } = await salvarMidiaSaida({
      tenantId: p.tenantId,
      bytes,
      mime,
      filename: mime === "image/png" ? "anuncio.png" : "anuncio.jpg",
      createdBy: "anuncio",
      dias: 400,
    });
    await dbConnect();
    await Promise.all([
      WaConversation.updateOne({ _id: p.conversationId, "origem.em": p.em }, { $set: { "origem.midiaId": id } }),
      WaContact.updateOne({ _id: p.contactId, "origemUltima.em": p.em }, { $set: { "origemUltima.midiaId": id } }),
      WaContact.updateOne({ _id: p.contactId, "origemPrimeira.em": p.em }, { $set: { "origemPrimeira.midiaId": id } }),
      p.idOrigem
        ? WaAnuncio.updateOne({ tenantId: p.tenantId, idOrigem: p.idOrigem, midiaId: null }, { midiaId: id })
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.warn("[origem] imagem não copiada:", err instanceof Error ? err.message : err);
  }
}

/** De onde a Central carrega a imagem: a cópia (link assinado) ou o link da
 *  Meta enquanto a cópia não existe. */
export function imagemDaOrigem(o: Pick<WaOrigem, "midiaId" | "imagemUrl"> | null | undefined): string | null {
  if (!o) return null;
  if (o.midiaId) return linkDaMidia("", o.midiaId);
  return o.imagemUrl ?? null;
}
