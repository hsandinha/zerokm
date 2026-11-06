// Público da campanha resolvido NO SERVIDOR pelo tenantId: os contatos da
// loja e os cartões de uma coluna do funil. A tela só diz qual fonte e quais
// filtros; a lista sai daqui, tanto para mostrar quanto para criar a
// campanha. Uma lista de contatos mandada pela tela nunca é aceita para essas
// fontes: seria o caminho para uma loja disparar para contato de outra.

import dbConnect from "@/lib/mongodb";
import { WaContact, WaConversation } from "@wa/models/wa";
import { colunaPorId, colunasDo, contarPorColuna, filtroDaColuna } from "@wa/lib/funil";
import type { FunilColuna } from "@wa/lib/stages";
import { parsePhoneBr } from "@wa/lib/phone";
import { MAX_PUBLICO, type OrigemDoPublico, type PessoaDoPublico } from "@wa/lib/audience/publico";

/** Origens de contato que fazem sentido como filtro (as de perfil, ig:/fb:, não têm telefone). */
export const ORIGENS_DE_CONTATO = ["whatsapp", "sms", "csv", "manual", "cnpja", "procob"] as const;

export type FiltroContatos = {
  /** Só quem escreveu nas últimas 24h (lastInboundAt da conversa). */
  janela24h?: boolean;
  /** Origem do cadastro do contato (WaContact.source). */
  origem?: string | null;
};

type ContatoLean = {
  _id: unknown;
  phone: string;
  name?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
};

/** Contato com telefone de celular: fixo não tem WhatsApp, perfil do Instagram
 *  e do Messenger ("ig:", "fb:") não tem telefone. */
function paraPessoa(c: ContatoLean, origem: OrigemDoPublico): PessoaDoPublico | null {
  if (!c.phone?.startsWith("+")) return null;
  const parsed = parsePhoneBr(c.phone);
  if (!parsed.valid || !parsed.e164 || parsed.kind === "fixo") return null;
  return {
    phone: parsed.e164,
    name: c.name ?? null,
    company: c.company ?? null,
    city: c.city ?? null,
    state: c.state ?? null,
    origem,
  };
}

const CAMPOS = "phone name company city state";

export async function contatosDaLoja(
  tenantId: string | null,
  filtro: FiltroContatos = {},
): Promise<{ pessoas: PessoaDoPublico[]; semCelular: number; truncado: boolean }> {
  await dbConnect();
  const query: Record<string, unknown> = {
    tenantId,
    optOut: { $ne: true },
    phone: { $regex: /^\+\d+$/ },
  };
  if (filtro.origem && (ORIGENS_DE_CONTATO as readonly string[]).includes(filtro.origem)) {
    query.source = filtro.origem;
  }
  if (filtro.janela24h) {
    // É a mensagem DO CLIENTE que conta (lastInboundAt), não a nossa.
    const desde = new Date(Date.now() - 24 * 3600_000);
    const convs = await WaConversation.find({ tenantId, lastInboundAt: { $gte: desde } })
      .select("contactId")
      .limit(MAX_PUBLICO)
      .lean();
    query._id = { $in: convs.map((c) => c.contactId) };
  }
  const contatos = await WaContact.find(query)
    .select(CAMPOS)
    .sort({ updatedAt: -1 })
    .limit(MAX_PUBLICO + 1)
    .lean<ContatoLean[]>();
  const truncado = contatos.length > MAX_PUBLICO;
  const pessoas: PessoaDoPublico[] = [];
  let semCelular = 0;
  for (const c of contatos.slice(0, MAX_PUBLICO)) {
    const p = paraPessoa(c, "contatos");
    if (p) pessoas.push(p);
    else semCelular++;
  }
  return { pessoas, semCelular, truncado };
}

/** Contatos cujo cartão está nesta coluna (a mesma regra do quadro). */
export async function contatosDaColuna(
  tenantId: string | null,
  colunaId: string,
): Promise<{ coluna: FunilColuna; pessoas: PessoaDoPublico[]; semCelular: number; truncado: boolean }> {
  await dbConnect();
  const coluna = await colunaPorId(tenantId, colunaId);
  const colunas = await colunasDo(tenantId);
  const convs = await WaConversation.find({ tenantId, ...filtroDaColuna(coluna, colunas) })
    .select("contactId")
    .sort({ stageChangedAt: -1 })
    .limit(MAX_PUBLICO + 1)
    .lean();
  const truncado = convs.length > MAX_PUBLICO;
  const contatos = await WaContact.find({
    _id: { $in: convs.slice(0, MAX_PUBLICO).map((c) => c.contactId) },
    tenantId,
    optOut: { $ne: true },
  })
    .select(CAMPOS)
    .lean<ContatoLean[]>();
  const pessoas: PessoaDoPublico[] = [];
  let semCelular = 0;
  for (const c of contatos) {
    const p = paraPessoa(c, "coluna");
    if (p) pessoas.push(p);
    else semCelular++;
  }
  return { coluna, pessoas, semCelular, truncado };
}

/** Colunas do funil com quantos cartões cada uma tem (para escolher na tela). */
export async function colunasComContagem(
  tenantId: string | null,
): Promise<Array<FunilColuna & { cartoes: number }>> {
  const colunas = await colunasDo(tenantId);
  const contagem = await contarPorColuna(tenantId, colunas);
  return colunas.map((c) => ({ ...c, cartoes: contagem[c.id] ?? 0 }));
}
