// Contatos, lado do servidor: apagar (com tudo que é dele) e importar a
// planilha já mapeada. Sempre dentro do dono (loja ou CNV): o id de um
// contato de outra loja não acha nada.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import {
  WaAiJob,
  WaCampaignRecipient,
  WaContact,
  WaConversation,
  WaFollowup,
  WaMessage,
} from "@wa/models/wa";
import { WaNote } from "@wa/models/atendimento";
import { WaAutomacaoEnvio } from "@wa/models/automacao";
import { WaAgendamento } from "@wa/models/agenda";
import { WaTarefa } from "@wa/models/tarefa";
import { camposQueFaltam, juntarPorTelefone, type LinhaImportada } from "@wa/lib/contatos";

export class ContatoError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ContatoError";
  }
}

/**
 * Apaga o contato e a conversa dele, com as mensagens, a fila da IA, a
 * cadência, as notas, as tarefas e o histórico das automações (como no
 * Chatrun, em que a conversa e as mensagens caem junto com o contato). O
 * registro de campanha fica, sem o vínculo: é a métrica do disparo, não da
 * pessoa. Na Agenda, o que ainda vai acontecer sai; o que já passou fica
 * para os números da loja, sem nome, telefone nem observação.
 *
 * Os filhos vão primeiro e o contato por último: se algo falhar no meio, o
 * contato continua na lista e apagar de novo termina o serviço, sem órfão.
 */
export async function apagarContato(tenantId: string | null, contactId: string): Promise<void> {
  if (!mongoose.isValidObjectId(contactId)) throw new ContatoError("Contato não encontrado", 404);
  await dbConnect();
  const contact = await WaContact.findOne({ _id: contactId, tenantId });
  if (!contact) throw new ContatoError("Contato não encontrado", 404);

  const conversas = await WaConversation.find({ contactId: contact._id }).select("_id").lean();
  const ids = conversas.map((c) => c._id);
  if (ids.length > 0) {
    const daConversa = { conversationId: { $in: ids } };
    await Promise.all([
      WaMessage.deleteMany(daConversa),
      WaAiJob.deleteMany(daConversa),
      WaFollowup.deleteMany(daConversa),
      WaNote.deleteMany(daConversa),
      WaCampaignRecipient.updateMany(daConversa, { $unset: { conversationId: 1 } }),
    ]);
  }
  const dele = { tenantId, $or: [{ contactId: contact._id }, ...(ids.length ? [{ conversationId: { $in: ids } }] : [])] };
  const agora = new Date();
  await Promise.all([
    WaAutomacaoEnvio.deleteMany(dele),
    WaTarefa.deleteMany(dele),
    WaAgendamento.deleteMany({ ...dele, inicio: { $gte: agora } }),
    WaAgendamento.updateMany(
      { ...dele, inicio: { $lt: agora } },
      {
        $set: {
          contatoNome: "Contato apagado",
          contatoTelefone: null,
          observacao: null,
          contactId: null,
          conversationId: null,
        },
      },
    ),
  ]);
  if (ids.length > 0) await WaConversation.deleteMany({ _id: { $in: ids } });
  await WaContact.deleteOne({ _id: contact._id, tenantId });
}

export type ResultadoDaImportacao = {
  total: number;
  criados: number;
  completados: number;
  ignorados: number;
  repetidos: number;
};

export const MAX_LINHAS_POR_ENVIO = 2000;

/**
 * Importa as linhas já mapeadas no navegador. Deduplica por telefone
 * (canônico) dentro do arquivo e contra a base: quem já é contato só tem os
 * campos vazios completados. Importar duas vezes não duplica ninguém.
 */
export async function importarContatos(
  tenantId: string | null,
  linhas: LinhaImportada[],
): Promise<ResultadoDaImportacao> {
  if (linhas.length === 0) throw new ContatoError("A planilha não tem linhas.");
  if (linhas.length > MAX_LINHAS_POR_ENVIO) {
    throw new ContatoError(`Mande no máximo ${MAX_LINHAS_POR_ENVIO} linhas por vez.`);
  }
  const { porTelefone, ignoradas, repetidas } = juntarPorTelefone(linhas);
  if (porTelefone.size === 0) throw new ContatoError("Nenhum telefone válido na planilha.");

  await dbConnect();
  const telefones = [...porTelefone.keys()];
  const existentes = await WaContact.find({ tenantId, phone: { $in: telefones } }).lean();
  const porFone = new Map(existentes.map((c) => [c.phone, c]));

  const ops: mongoose.AnyBulkWriteOperation[] = [];
  let criados = 0;
  let completados = 0;
  for (const [phone, campos] of porTelefone) {
    const atual = porFone.get(phone);
    if (atual) {
      const faltam = camposQueFaltam(atual as unknown as Record<string, unknown>, campos);
      if (Object.keys(faltam).length > 0) {
        ops.push({ updateOne: { filter: { _id: atual._id }, update: { $set: faltam } } });
        completados++;
      }
      continue;
    }
    // Upsert com $setOnInsert: se o cliente escreveu agora e o contato nasceu
    // no meio da importação, o índice único não deixa duplicar.
    const address: Record<string, unknown> = {};
    const raiz: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(campos)) {
      if (k.startsWith("address.")) address[k.slice(8)] = v;
      else raiz[k] = v;
    }
    ops.push({
      updateOne: {
        filter: { tenantId, phone },
        update: {
          $setOnInsert: {
            tenantId,
            phone,
            source: "csv",
            optOut: false,
            ...raiz,
            ...(Object.keys(address).length ? { address } : {}),
          },
        },
        upsert: true,
      },
    });
    criados++;
  }
  if (ops.length > 0) await WaContact.bulkWrite(ops, { ordered: false });
  return { total: porTelefone.size, criados, completados, ignorados: ignoradas, repetidos: repetidas };
}
