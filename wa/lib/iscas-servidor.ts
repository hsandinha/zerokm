// Iscas de comentário: cadastro (gateway primeiro, depois o espelho local),
// leitura para a tela e os posts do canal. Quem chama (app/api/wa/iscas)
// já resolveu o escopo: tudo aqui filtra pela loja dele.
//
// Ordem das gravações: o gateway é quem dispara a isca, então ele vem
// primeiro. Se ele recusar, nada muda aqui; se o espelho local falhar depois,
// a regra criada no gateway é desfeita (senão ela dispararia sem aparecer na
// tela). Ao apagar, o gateway dizer 404 (a regra já não existia) não impede
// de limpar o local.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { WaChannel, type WaChannelKind } from "@wa/models/channel";
import { WaIsca, WaIscaComentario, type IWaIsca, type IWaIscaComentario } from "@wa/models/isca";
import { channelLabelOf } from "@wa/lib/channels";
import {
  ChatrunError,
  chatrunConfigured,
  createCommentRule,
  deleteCommentRule,
  getCommentRule,
  postsDaConexao,
  updateCommentRule,
  type ChatrunCommentRuleStats,
} from "@wa/lib/chatrun";
import { NextResponse } from "next/server";
import { podeUsar, requireScope, requireScopeAdmin, sameTenant, scopeError, tenantFilter, type Scope } from "@wa/lib/scope";
import { MSG_RECURSO_DESLIGADO } from "@/lib/recursos";
import {
  corpoDaRegra,
  iscaRepetida,
  lerIsca,
  type CamposDaIsca,
  type CanalDaIsca,
  type CanalDeIsca,
  type ComentarioView,
  type IscaView,
  type PostDaIsca,
} from "@wa/lib/iscas";
import { autorDoComentario } from "@wa/lib/iscas-eventos";

export class IscaError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type EscopoDaIsca = Pick<Scope, "tenantId" | "store">;

const KINDS: CanalDaIsca[] = ["instagram", "messenger"];

/** Instagram e Messenger que o CNV liberou para a loja (o CNV vê os dois). */
function kindsLiberados(scope: EscopoDaIsca): CanalDaIsca[] {
  return KINDS.filter((k) => podeUsar(scope, k));
}

/** Pode abrir a tela de iscas? Loja sem Instagram e sem Messenger, não. */
export function podeUsarIscas(scope: EscopoDaIsca): boolean {
  return kindsLiberados(scope).length > 0;
}

type CanalLido = {
  _id: mongoose.Types.ObjectId;
  kind: WaChannelKind;
  tenantId?: string | null;
  status: "connected" | "error" | "disconnected";
  provider?: string;
  chatrunConnectionId?: string;
  igUsername?: string;
  fbPageName?: string;
  displayName?: string;
};

/** Canais do dono que podem ter isca: Instagram ou Página conectados pelo
 *  gateway (é ele quem responde o comentário) e com o recurso liberado. */
export async function canaisDeIsca(scope: EscopoDaIsca): Promise<CanalDeIsca[]> {
  await dbConnect();
  const kinds = kindsLiberados(scope);
  if (!kinds.length) return [];
  const docs = (await WaChannel.find({
    ...tenantFilter(scope),
    kind: { $in: kinds },
    provider: "chatrun",
    chatrunConnectionId: { $type: "string" },
    status: { $ne: "disconnected" },
  })
    .sort({ createdAt: 1 })
    .lean()) as unknown as CanalLido[];
  return docs.map((c) => ({
    id: String(c._id),
    kind: c.kind as CanalDaIsca,
    label: channelLabelOf({ kind: c.kind as CanalDaIsca, igUsername: c.igUsername, fbPageName: c.fbPageName, displayName: c.displayName }),
    status: c.status,
  }));
}

/** O canal, se for do dono e servir para isca; senão o motivo. */
type CanalDeIscaLido = Omit<CanalLido, "kind"> & { kind: CanalDaIsca; chatrunConnectionId: string };

async function canalDoDono(scope: EscopoDaIsca, channelId: string): Promise<CanalDeIscaLido> {
  if (!mongoose.isValidObjectId(channelId)) throw new IscaError("Canal não encontrado.", 404);
  await dbConnect();
  const c = (await WaChannel.findOne({ _id: channelId, ...tenantFilter(scope) }).lean()) as unknown as CanalLido | null;
  if (!c || !sameTenant(scope, c)) throw new IscaError("Canal não encontrado.", 404);
  if (c.kind !== "instagram" && c.kind !== "messenger") {
    throw new IscaError("Isca de comentário é só para o Instagram ou a Página do Facebook.", 422);
  }
  if (!podeUsar(scope, c.kind)) throw new IscaError(MSG_RECURSO_DESLIGADO, 403);
  if (c.provider !== "chatrun" || !c.chatrunConnectionId) {
    throw new IscaError("Este canal não foi conectado pelo Chatrun Conexão: conecte de novo em Configuração.", 422);
  }
  if (c.status === "disconnected") throw new IscaError("Este canal está desconectado: conecte de novo em Configuração.", 422);
  return { ...c, kind: c.kind, chatrunConnectionId: c.chatrunConnectionId };
}

/** O erro do gateway em português para a tela, com o status certo. */
function erroDoGateway(err: unknown): IscaError {
  if (err instanceof IscaError) return err;
  if (err instanceof ChatrunError) {
    if (err.code === "not_configured") return new IscaError("O Chatrun Conexão não está configurado neste servidor.", 503);
    if (err.status === 403) {
      return new IscaError("O canal não está vinculado à zerokm no Chatrun Conexão: conecte de novo em Configuração.", 422);
    }
    if (err.status === 400 || err.status === 422) return new IscaError(`O Chatrun Conexão recusou: ${err.message}`, 422);
    if (err.status === 404) return new IscaError("O canal não existe mais no Chatrun Conexão: conecte de novo.", 422);
  }
  console.error("[iscas] gateway falhou:", err);
  return new IscaError("O Chatrun Conexão não respondeu. Tente de novo em instantes.", 502);
}

type IscaLida = Pick<
  IWaIsca,
  | "tenantId"
  | "canal"
  | "chatrunRuleId"
  | "mediaId"
  | "postLegenda"
  | "postImagem"
  | "postLink"
  | "keyword"
  | "publicReply"
  | "directMessage"
  | "ativo"
  | "priority"
  | "comentarios"
  | "directs"
  | "falhas"
  | "createdAt"
> & { _id: mongoose.Types.ObjectId; channelId: mongoose.Types.ObjectId };

export function iscaView(d: IscaLida): IscaView {
  return {
    id: String(d._id),
    channelId: String(d.channelId),
    canal: d.canal,
    mediaId: d.mediaId ?? null,
    postLegenda: d.postLegenda ?? null,
    postImagem: d.postImagem ?? null,
    postLink: d.postLink ?? null,
    keyword: d.keyword ?? null,
    publicReply: d.publicReply ?? null,
    directMessage: d.directMessage,
    ativo: Boolean(d.ativo),
    priority: d.priority ?? 0,
    comentarios: d.comentarios ?? 0,
    directs: d.directs ?? 0,
    falhas: d.falhas ?? 0,
    createdAt: new Date(d.createdAt ?? Date.now()).toISOString(),
  };
}

type ComentarioLido = Pick<
  IWaIscaComentario,
  "canal" | "mediaId" | "texto" | "autorUsername" | "autorNome" | "respondeuPublico" | "respondeuDirect" | "erro" | "em"
> & {
  _id: mongoose.Types.ObjectId;
  channelId: mongoose.Types.ObjectId;
  iscaId?: mongoose.Types.ObjectId | null;
  conversationId?: mongoose.Types.ObjectId | null;
};

export function comentarioView(c: ComentarioLido): ComentarioView {
  return {
    id: String(c._id),
    channelId: String(c.channelId),
    canal: c.canal,
    mediaId: c.mediaId ?? null,
    texto: c.texto ?? "",
    autor: autorDoComentario(c),
    iscaId: c.iscaId ? String(c.iscaId) : null,
    respondeuPublico: Boolean(c.respondeuPublico),
    respondeuDirect: Boolean(c.respondeuDirect),
    erro: c.erro ?? null,
    conversationId: c.conversationId ? String(c.conversationId) : null,
    em: new Date(c.em ?? Date.now()).toISOString(),
  };
}

/** Tudo que a tela precisa de uma vez: canais, iscas e os últimos comentários. */
export async function painelDeIscas(
  scope: EscopoDaIsca,
  limite = 30,
): Promise<{ canais: CanalDeIsca[]; iscas: IscaView[]; comentarios: ComentarioView[] }> {
  await dbConnect();
  const kinds = kindsLiberados(scope);
  if (!kinds.length) return { canais: [], iscas: [], comentarios: [] };
  const filtro = { ...tenantFilter(scope), canal: { $in: kinds } };
  const [canais, iscas, comentarios] = await Promise.all([
    canaisDeIsca(scope),
    WaIsca.find(filtro).sort({ createdAt: -1 }).limit(200).lean(),
    WaIscaComentario.find(filtro).sort({ em: -1 }).limit(Math.min(Math.max(limite, 1), 100)).lean(),
  ]);
  return {
    canais,
    iscas: (iscas as unknown as IscaLida[]).map(iscaView),
    comentarios: (comentarios as unknown as ComentarioLido[]).map(comentarioView),
  };
}

async function iscaDoDono(scope: EscopoDaIsca, id: string): Promise<IscaLida> {
  if (!mongoose.isValidObjectId(id)) throw new IscaError("Isca não encontrada.", 404);
  await dbConnect();
  const d = (await WaIsca.findOne({ _id: id, ...tenantFilter(scope) }).lean()) as unknown as IscaLida | null;
  if (!d || !sameTenant(scope, d)) throw new IscaError("Isca não encontrada.", 404);
  if (!podeUsar(scope, d.canal)) throw new IscaError(MSG_RECURSO_DESLIGADO, 403);
  return d;
}

/** Recusa a isca que nunca dispararia (outra igual já ativa no canal). */
async function semRepetida(
  scope: EscopoDaIsca,
  nova: { id?: string; channelId: string; mediaId: string | null; keyword: string | null; ativo: boolean },
): Promise<void> {
  if (!nova.ativo) return;
  const doCanal = (await WaIsca.find({ ...tenantFilter(scope), channelId: nova.channelId, ativo: true })
    .select("_id channelId mediaId keyword ativo")
    .lean()) as unknown as Array<{ _id: unknown; channelId: unknown; mediaId: string | null; keyword: string | null; ativo: boolean }>;
  const repetida = iscaRepetida(
    doCanal.map((e) => ({ id: String(e._id), channelId: String(e.channelId), mediaId: e.mediaId ?? null, keyword: e.keyword ?? null, ativo: e.ativo })),
    nova,
  );
  if (repetida) {
    throw new IscaError(
      nova.keyword
        ? "Já existe uma isca ativa com esta palavra-chave neste post. Edite a outra ou pause uma delas."
        : "Já existe uma isca ativa para qualquer comentário neste post. Edite a outra ou pause uma delas.",
      409,
    );
  }
}

export async function criarIsca(
  scope: EscopoDaIsca,
  body: unknown,
  autor: string | null,
): Promise<{ isca: IscaView; avisos: string[] }> {
  const lido = lerIsca(body, true);
  if (!lido.ok) throw new IscaError(lido.erro, 400);
  const canal = await canalDoDono(scope, lido.channelId!);
  const campos = lido.campos as CamposDaIsca;
  await semRepetida(scope, {
    channelId: String(canal._id),
    mediaId: campos.mediaId,
    keyword: campos.keyword,
    ativo: campos.ativo,
  });
  if (!chatrunConfigured()) throw new IscaError("O Chatrun Conexão não está configurado neste servidor.", 503);

  // O _id nasce antes: ele é o external_ref da regra no gateway.
  const _id = new mongoose.Types.ObjectId();
  let criada: Awaited<ReturnType<typeof createCommentRule>>;
  try {
    criada = await createCommentRule({
      connection_id: canal.chatrunConnectionId,
      external_ref: String(_id),
      ...corpoDaRegra(campos),
      direct_message: campos.directMessage,
    });
  } catch (err) {
    throw erroDoGateway(err);
  }

  try {
    const doc = await WaIsca.create({
      _id,
      tenantId: scope.tenantId,
      channelId: canal._id,
      canal: canal.kind,
      chatrunRuleId: criada.rule.id,
      ...campos,
      ...(autor ? { createdBy: autor } : {}),
    });
    return { isca: iscaView(doc.toObject() as unknown as IscaLida), avisos: criada.warnings };
  } catch (err) {
    // Sem o espelho a isca dispararia sem aparecer na tela: desfaz no gateway.
    await deleteCommentRule(criada.rule.id).catch((e) => console.error("[iscas] regra órfã no gateway", criada.rule.id, e));
    throw err;
  }
}

export async function alterarIsca(scope: EscopoDaIsca, id: string, body: unknown): Promise<IscaView> {
  const atual = await iscaDoDono(scope, id);
  const lido = lerIsca(body, false);
  if (!lido.ok) throw new IscaError(lido.erro, 400);
  const campos = lido.campos;
  if (Object.keys(campos).length === 0) return iscaView(atual);

  const final = { ...atual, ...campos };
  await semRepetida(scope, {
    id: String(atual._id),
    channelId: String(atual.channelId),
    mediaId: final.mediaId ?? null,
    keyword: final.keyword ?? null,
    ativo: final.ativo,
  });

  let chatrunRuleId = atual.chatrunRuleId;
  try {
    await updateCommentRule(atual.chatrunRuleId, corpoDaRegra(campos));
  } catch (err) {
    if (!(err instanceof ChatrunError && err.status === 404)) throw erroDoGateway(err);
    // A regra sumiu do gateway (apagada por lá): volta a existir com o mesmo
    // external_ref, para a isca da tela continuar valendo.
    const canal = await canalDoDono(scope, String(atual.channelId));
    try {
      const recriada = await createCommentRule({
        connection_id: canal.chatrunConnectionId,
        external_ref: String(atual._id),
        ...corpoDaRegra({
          mediaId: final.mediaId ?? null,
          keyword: final.keyword ?? null,
          publicReply: final.publicReply ?? null,
          ativo: final.ativo,
          priority: final.priority ?? 0,
        }),
        direct_message: final.directMessage,
      });
      chatrunRuleId = recriada.rule.id;
    } catch (e) {
      throw erroDoGateway(e);
    }
  }

  const salvo = (await WaIsca.findOneAndUpdate(
    { _id: atual._id, ...tenantFilter(scope) },
    { $set: { ...campos, chatrunRuleId } },
    { new: true },
  )) as unknown as IscaLida | null;
  if (!salvo) throw new IscaError("Isca não encontrada.", 404);
  return iscaView(salvo);
}

export async function apagarIsca(scope: EscopoDaIsca, id: string): Promise<void> {
  const atual = await iscaDoDono(scope, id);
  try {
    await deleteCommentRule(atual.chatrunRuleId);
  } catch (err) {
    // 404: a regra já não existia no gateway; o espelho sai do mesmo jeito.
    if (!(err instanceof ChatrunError && err.status === 404)) throw erroDoGateway(err);
  }
  // Os comentários ficam (com o id da isca), como no gateway.
  await WaIsca.deleteOne({ _id: atual._id, ...tenantFilter(scope) });
}

/** A isca com os números do gateway (que conta tudo, inclusive o que chegou
 *  antes de a zerokm receber os eventos). Sem o gateway, só os daqui. */
export async function iscaComNumeros(
  scope: EscopoDaIsca,
  id: string,
): Promise<{ isca: IscaView; gateway: ChatrunCommentRuleStats | null }> {
  const atual = await iscaDoDono(scope, id);
  let gateway: ChatrunCommentRuleStats | null = null;
  try {
    gateway = (await getCommentRule(atual.chatrunRuleId)).stats ?? null;
  } catch {
    gateway = null;
  }
  return { isca: iscaView(atual), gateway };
}

/** Posts recentes do canal para escolher pela foto. null = lista indisponível
 *  (a tela mostra o campo do id do post). */
export async function postsDoCanal(scope: EscopoDaIsca, channelId: string): Promise<PostDaIsca[] | null> {
  const canal = await canalDoDono(scope, channelId);
  if (!chatrunConfigured()) return null;
  const posts = await postsDaConexao(canal.chatrunConnectionId, 30);
  if (!posts) return null;
  return posts.map((p) => ({
    id: p.id,
    legenda: p.caption,
    tipo: p.type,
    imagem: p.image_url,
    link: p.permalink,
    em: p.created_at,
  }));
}

// ── Para as rotas (app/api/wa/iscas) ─────────────────────────

/** Escopo de quem pode ver iscas: a loja precisa do Instagram ou do Messenger
 *  liberado. `gestor`: só quem configura (criar, alterar, apagar). */
export async function escopoDasIscas(gestor: boolean): Promise<Scope | NextResponse> {
  try {
    const scope = gestor ? await requireScopeAdmin() : await requireScope();
    if (!podeUsarIscas(scope)) return NextResponse.json({ error: MSG_RECURSO_DESLIGADO }, { status: 403 });
    return scope;
  } catch (err) {
    const { error, status } = scopeError(err);
    return NextResponse.json({ error }, { status });
  }
}

export function respostaDeErro(err: unknown): NextResponse {
  if (err instanceof IscaError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[iscas]", err);
  return NextResponse.json({ error: "Não foi possível concluir. Tente de novo." }, { status: 500 });
}
