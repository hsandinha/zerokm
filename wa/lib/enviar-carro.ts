// Manda um carro do pátio na conversa: até 3 fotos (a capa primeiro) pelo
// link público assinado e, depois, o cartão com a ficha. Usado pelo "Enviar
// carro" da Central e pela IA da loja quando o cliente pede foto.
//
// As fotos vão sem legenda e o cartão vem por último, como texto: é a
// mensagem que fica embaixo na conversa (com o preço) e a prévia na fila.
// Foto só sai pelo WhatsApp (sendAndLogMedia); no Direct e no Messenger vai
// só o cartão.

import { sendAndLogMedia, sendAndLogText, type AutorDaMensagem } from "@wa/lib/send";
import { linkDaFotoEstoque } from "@wa/lib/foto-estoque";
import { cartaoDoCarro } from "@wa/lib/estoque-ficha";
import type { Oferta } from "@wa/lib/estoque";
import { ligarCarroNaConversa } from "@wa/lib/conversoes-meta-servidor";

export const FOTOS_POR_ENVIO = 3;

export async function enviarCarroDoPatio(p: {
  conversationId: string;
  to: string;
  oferta: Oferta;
  /** Base pública do site (a Meta baixa a foto por ela). */
  base: string;
  canal: string;
  sender: "human" | "ai";
  /** Quem da equipe mandou (sender "human"): o balão e os relatórios por
   *  atendente leem daqui. */
  author?: AutorDaMensagem | null;
  /** Só as fotos, sem o cartão (a IA já falou do carro). */
  semCartao?: boolean;
}): Promise<{ fotos: number }> {
  const ids = p.canal === "whatsapp" ? (p.oferta.fotoIds ?? []).slice(0, FOTOS_POR_ENVIO) : [];
  for (const id of ids) {
    await sendAndLogMedia({
      conversationId: p.conversationId,
      to: p.to,
      link: linkDaFotoEstoque(p.base, id),
      type: "image",
      sender: p.sender,
      author: p.author ?? null,
    });
  }
  if (!p.semCartao || ids.length === 0) {
    await sendAndLogText({ conversationId: p.conversationId, to: p.to, text: cartaoDoCarro(p.oferta), sender: p.sender, author: p.author ?? null });
  }
  // O carro que foi para o cliente vira o carro da conversa: é o valor da
  // venda que volta para o anúncio (API de Conversões da Meta).
  await ligarCarroNaConversa({ conversationId: p.conversationId, oferta: p.oferta, por: p.sender });
  return { fotos: ids.length };
}
