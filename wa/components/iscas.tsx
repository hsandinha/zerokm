"use client";

// Iscas de comentário (Instagram e Página do Facebook): quem comenta num post
// recebe, se a isca quiser, uma resposta no próprio comentário e UMA mensagem
// no privado (Direct ou Messenger). É o jeito legítimo de a loja puxar
// conversa nesses canais. Quem responde na Meta é o gateway; esta tela
// cadastra as iscas (em modal, como os outros cadastros do atendimento) e
// mostra os últimos comentários com o que cada isca fez.
//
// A mesma tela serve a loja (/dashboard/atendimento/iscas) e o CNV
// (/dashboard/admin/whatsapp/iscas): `useWaPanel` diz para onde os links vão.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertCircle,
  Check,
  ExternalLink,
  Facebook,
  Film,
  Images,
  Info,
  Instagram,
  Loader2,
  MessageCircleReply,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useFeedback } from "@/components/ui/Feedback";
import { useWaPanel } from "@wa/components/wa-panel";
import { dateTime } from "@wa/lib/stages";
import {
  LIMITE_DIRECT,
  LIMITE_PALAVRA,
  LIMITE_PUBLICO,
  NOME_DO_CANAL,
  PRIVADO_DO_CANAL,
  REGRA_DA_META,
  bloqueadoNoGateway,
  canalInicial,
  resumoDaLegenda,
  type CanalDaIsca,
  type CanalDeIsca,
  type ComentarioView,
  type IscaView,
  type PostDaIsca,
} from "@wa/lib/iscas";

type Painel = {
  canais: CanalDeIsca[];
  iscas: IscaView[];
  comentarios: ComentarioView[];
  podeEditar: boolean;
};

/** Posts de um canal: lista, null (o gateway não respondeu) ou carregando. */
type EstadoDosPosts = PostDaIsca[] | null | "carregando";

type PostEscolhido = { legenda: string | null; imagem: string | null; link: string | null };

type Rascunho = {
  id: string | null;
  channelId: string;
  /** Tipo do canal (vale mesmo com o canal fora da lista, desconectado). */
  canal: CanalDaIsca;
  /** "" = todos os posts. */
  mediaId: string;
  post: PostEscolhido | null;
  keyword: string;
  publicReply: string;
  directMessage: string;
  ativo: boolean;
};

const ICONE_DO_CANAL: Record<CanalDaIsca, typeof Instagram> = { instagram: Instagram, messenger: Facebook };

function rascunhoDe(isca: IscaView | null, canal: CanalDeIsca | null): Rascunho {
  if (isca) {
    return {
      id: isca.id,
      channelId: isca.channelId,
      canal: isca.canal,
      mediaId: isca.mediaId ?? "",
      post: isca.mediaId ? { legenda: isca.postLegenda, imagem: isca.postImagem, link: isca.postLink } : null,
      keyword: isca.keyword ?? "",
      publicReply: isca.publicReply ?? "",
      directMessage: isca.directMessage,
      ativo: isca.ativo,
    };
  }
  return {
    id: null,
    channelId: canal?.id ?? "",
    canal: canal?.kind ?? "instagram",
    mediaId: "",
    post: null,
    keyword: "",
    publicReply: "",
    directMessage: "",
    ativo: true,
  };
}

/** Posts por canal, pedidos uma vez cada (a lista é do gateway, não muda a cada clique). */
function usePostsDosCanais() {
  const [posts, setPosts] = useState<Record<string, EstadoDosPosts>>({});
  const pedidos = useRef(new Set<string>());

  const carregar = useCallback(async (channelId: string) => {
    if (!channelId || pedidos.current.has(channelId)) return;
    pedidos.current.add(channelId);
    setPosts((p) => ({ ...p, [channelId]: "carregando" }));
    try {
      const r = await fetch(`/api/wa/iscas/posts?channelId=${encodeURIComponent(channelId)}`);
      const d = (await r.json().catch(() => ({}))) as { posts?: PostDaIsca[] | null };
      setPosts((p) => ({ ...p, [channelId]: r.ok && Array.isArray(d.posts) ? d.posts : null }));
    } catch {
      setPosts((p) => ({ ...p, [channelId]: null }));
    }
  }, []);

  return { posts, carregar };
}

export function Iscas() {
  const { base, store } = useWaPanel();
  const { confirm: confirmar, notify, feedback } = useFeedback();
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"iscas" | "comentarios">("iscas");
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const { posts, carregar } = usePostsDosCanais();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/wa/iscas");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(d.error ?? "Não foi possível carregar as iscas.");
        return;
      }
      setPainel({
        canais: d.canais ?? [],
        iscas: d.iscas ?? [],
        comentarios: d.comentarios ?? [],
        podeEditar: Boolean(d.podeEditar),
      });
      setErro(null);
    } catch {
      setErro("Sem conexão. Tente de novo em instantes.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A foto guardada na isca é link da Meta e vence: com a lista de posts do
  // canal em mãos, a lista mostra a foto de agora.
  useEffect(() => {
    if (!painel) return;
    new Set(painel.iscas.filter((i) => i.mediaId).map((i) => i.channelId)).forEach((id) => carregar(id));
  }, [painel, carregar]);

  const fotoAtual = useMemo(() => {
    const m = new Map<string, PostDaIsca>();
    for (const [canal, lista] of Object.entries(posts)) {
      if (Array.isArray(lista)) lista.forEach((p) => m.set(`${canal}:${p.id}`, p));
    }
    return m;
  }, [posts]);

  const canalPorId = useMemo(() => new Map((painel?.canais ?? []).map((c) => [c.id, c])), [painel]);
  const iscaPorId = useMemo(() => new Map((painel?.iscas ?? []).map((i) => [i.id, i])), [painel]);
  const variosCanais = (painel?.canais.length ?? 0) > 1;
  const podeEditar = Boolean(painel?.podeEditar);

  function abrirNova() {
    const canal = canalInicial(painel?.canais ?? []);
    if (!canal) return;
    setEditando(rascunhoDe(null, canal));
    carregar(canal.id);
  }

  function abrirEdicao(isca: IscaView) {
    setEditando(rascunhoDe(isca, null));
    carregar(isca.channelId);
  }

  /** Grava a isca; devolve a mensagem de erro (ou null). */
  async function salvar(r: Rascunho): Promise<string | null> {
    const corpo = {
      ...(r.id ? {} : { channelId: r.channelId }),
      mediaId: r.mediaId || null,
      post: r.mediaId ? r.post : null,
      keyword: r.keyword,
      publicReply: r.publicReply,
      directMessage: r.directMessage,
      ativo: r.ativo,
    };
    try {
      const res = await fetch(r.id ? `/api/wa/iscas/${r.id}` : "/api/wa/iscas", {
        method: r.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return d.error ?? "Não foi possível salvar a isca.";
      const avisos: string[] = Array.isArray(d.avisos) ? d.avisos : [];
      notify(avisos.length ? `Isca salva. Atenção: ${avisos.join(" ")}` : "Isca salva.", avisos.length ? "negative" : "positive");
      await load();
      return null;
    } catch {
      return "Sem conexão. Tente de novo.";
    }
  }

  async function alternar(isca: IscaView) {
    setMexendo(isca.id);
    try {
      const res = await fetch(`/api/wa/iscas/${isca.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !isca.ativo }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) notify(d.error ?? "Não foi possível mudar a isca.");
      else await load();
    } finally {
      setMexendo(null);
    }
  }

  async function apagar(isca: IscaView) {
    const ok = await confirmar({
      title: "Apagar esta isca?",
      description: `${isca.keyword ? `Quem comentar "${isca.keyword}"` : "Quem comentar"} daqui em diante não recebe mais a mensagem no ${PRIVADO_DO_CANAL[isca.canal]}. Os comentários e as conversas que ela já trouxe continuam.`,
      confirmLabel: "Apagar isca",
      danger: true,
    });
    if (!ok) return;
    setMexendo(isca.id);
    try {
      const res = await fetch(`/api/wa/iscas/${isca.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) notify(d.error ?? "Não foi possível apagar a isca.");
      else {
        notify("Isca apagada.", "positive");
        await load();
      }
    } finally {
      setMexendo(null);
    }
  }

  const semCanal = painel && painel.canais.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="brand-kicker">{store ? "Atendimento" : "Instagram e Messenger"}</p>
          <h1 className="mt-1 text-2xl font-bold">Iscas de comentário</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Quem comenta num post recebe uma resposta no comentário, se você quiser, e uma mensagem no privado. É o
            jeito de puxar conversa no Instagram e na Página do Facebook.
          </p>
        </div>
        {podeEditar && !semCanal && painel && (
          <button className="btn-dark" onClick={abrirNova}>
            <Plus size={16} /> Nova isca
          </button>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-2xl border border-line bg-paper px-4 py-2.5 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>{REGRA_DA_META}</span>
      </p>

      {erro && (
        <p className="flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">
          <AlertCircle size={14} /> {erro}
        </p>
      )}

      {!painel ? (
        !erro && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={15} className="animate-spin" /> Carregando…
          </p>
        )
      ) : (
        <>
          {semCanal && <SemCanal base={base} store={store} podeEditar={podeEditar} />}

          {(!semCanal || painel.iscas.length > 0 || painel.comentarios.length > 0) && (
            <>
              <div className="flex w-fit gap-1 rounded-xl border border-line bg-paper p-1" role="tablist">
                {(
                  [
                    ["iscas", "Iscas", painel.iscas.length],
                    ["comentarios", "Últimos comentários", painel.comentarios.length],
                  ] as const
                ).map(([id, rotulo, n]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={aba === id}
                    onClick={() => setAba(id)}
                    className={clsx(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      aba === id ? "pill-active" : "text-muted hover:text-ink-900",
                    )}
                  >
                    {rotulo} <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                ))}
              </div>

              {aba === "iscas" ? (
                painel.iscas.length === 0 ? (
                  <div className="card flex flex-col items-center gap-3 py-10 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                      <MessageCircleReply size={20} />
                    </span>
                    <div>
                      <p className="text-sm font-bold">Nenhuma isca ainda</p>
                      <p className="mt-1 max-w-md text-xs text-muted">
                        {podeEditar
                          ? "Crie a primeira: escolha o post, a palavra que a pessoa comenta e a mensagem que ela recebe no privado."
                          : "Peça a um gestor para criar a primeira isca."}
                      </p>
                    </div>
                    {podeEditar && !semCanal && (
                      <button className="btn-dark" onClick={abrirNova}>
                        <Plus size={16} /> Nova isca
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="grid gap-3 lg:grid-cols-2">
                    {painel.iscas.map((isca) => (
                      <CartaoDaIsca
                        key={isca.id}
                        isca={isca}
                        foto={isca.mediaId ? fotoAtual.get(`${isca.channelId}:${isca.mediaId}`)?.imagem ?? isca.postImagem : null}
                        canal={variosCanais || !canalPorId.has(isca.channelId) ? canalPorId.get(isca.channelId) ?? null : undefined}
                        podeEditar={podeEditar}
                        ocupado={mexendo === isca.id}
                        onAlternar={() => alternar(isca)}
                        onEditar={() => abrirEdicao(isca)}
                        onApagar={() => apagar(isca)}
                      />
                    ))}
                  </ul>
                )
              ) : (
                <ListaDeComentarios
                  comentarios={painel.comentarios}
                  iscaPorId={iscaPorId}
                  canalPorId={canalPorId}
                  variosCanais={variosCanais}
                  base={base}
                />
              )}
            </>
          )}
        </>
      )}

      {editando && painel && (
        <IscaModal
          inicial={editando}
          canais={painel.canais}
          posts={posts}
          onCanal={carregar}
          onClose={() => setEditando(null)}
          onSave={async (r) => {
            const msg = await salvar(r);
            if (!msg) setEditando(null);
            return msg;
          }}
        />
      )}

      <div className="zk-ui">{feedback}</div>
    </div>
  );
}

function SemCanal({ base, store, podeEditar }: { base: string; store: boolean; podeEditar: boolean }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex items-center gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Instagram size={20} />
        </span>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Facebook size={20} />
        </span>
      </div>
      <div>
        <p className="text-sm font-bold">Conecte o Instagram ou a Página do Facebook</p>
        <p className="mt-1 max-w-md text-xs text-muted">
          A isca responde comentários dos posts {store ? "da loja" : "do CNV"}. Para criar uma, conecte antes a conta
          profissional do Instagram ou a Página do Facebook pelo Chatrun Conexão, em Configuração.
        </p>
      </div>
      {podeEditar && (
        <Link href={`${base}/configuracao`} className="btn-dark">
          Abrir Configuração
        </Link>
      )}
    </div>
  );
}

function Selo({ tom, children }: { tom: "ok" | "neutro" | "info" | "erro" | "aviso"; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tom === "ok" && "bg-emerald-100 text-emerald-700",
        tom === "neutro" && "bg-ink-100 text-ink-800",
        tom === "info" && "bg-sky-100 text-sky-700",
        tom === "erro" && "bg-red-100 text-red-600",
        tom === "aviso" && "bg-amber-100 text-amber-700",
      )}
    >
      {children}
    </span>
  );
}

function Miniatura({ foto, todos, tamanho = "h-16 w-16" }: { foto: string | null; todos: boolean; tamanho?: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (todos) {
    return (
      <span className={clsx("flex shrink-0 items-center justify-center rounded-xl bg-canvas text-muted", tamanho)}>
        <Images size={20} />
      </span>
    );
  }
  if (!foto || quebrou) {
    return (
      <span className={clsx("flex shrink-0 items-center justify-center rounded-xl bg-canvas px-1 text-center text-[10px] text-muted", tamanho)}>
        post
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" loading="lazy" onError={() => setQuebrou(true)} className={clsx("shrink-0 rounded-xl object-cover", tamanho)} />
  );
}

function CartaoDaIsca({
  isca,
  foto,
  canal,
  podeEditar,
  ocupado,
  onAlternar,
  onEditar,
  onApagar,
}: {
  isca: IscaView;
  foto: string | null;
  /** undefined = um canal só (não precisa dizer qual); null = canal desconectado. */
  canal: CanalDeIsca | null | undefined;
  podeEditar: boolean;
  ocupado: boolean;
  onAlternar: () => void;
  onEditar: () => void;
  onApagar: () => void;
}) {
  const Icone = ICONE_DO_CANAL[isca.canal];
  const legenda = resumoDaLegenda(isca.postLegenda, 50);
  return (
    <li className={clsx("card flex gap-4 p-4", !isca.ativo && "opacity-75")}>
      {isca.postLink && isca.mediaId ? (
        <a href={isca.postLink} target="_blank" rel="noreferrer" title="Abrir o post">
          <Miniatura foto={foto} todos={false} />
        </a>
      ) : (
        <Miniatura foto={foto} todos={!isca.mediaId} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {isca.keyword ? (
            <code className="rounded-lg bg-brand-50 px-2 py-0.5 text-[12px] font-semibold text-brand-700">{isca.keyword}</code>
          ) : (
            <span className="text-sm font-bold">Qualquer comentário</span>
          )}
          <Selo tom={isca.ativo ? "ok" : "neutro"}>{isca.ativo ? "Ativa" : "Pausada"}</Selo>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {isca.mediaId ? (legenda ? `No post "${legenda}"` : `No post ${isca.mediaId}`) : "Em todos os posts"}
          {canal !== undefined && (
            <span className="ml-1 inline-flex items-center gap-1">
              · <Icone size={12} /> {canal ? canal.label : `${NOME_DO_CANAL[isca.canal]} desconectado`}
            </span>
          )}
        </p>
        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-ink-800">
          <span className="font-semibold text-muted">No {PRIVADO_DO_CANAL[isca.canal]}: </span>
          {isca.directMessage}
        </p>
        {isca.publicReply && (
          <p className="mt-1 truncate text-xs text-muted">
            <span className="font-semibold">No comentário:</span> {isca.publicReply}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs">
          <Numero valor={isca.comentarios} rotulo={isca.comentarios === 1 ? "comentário" : "comentários"} />
          <Numero valor={isca.directs} rotulo={`no ${PRIVADO_DO_CANAL[isca.canal]}`} />
          {isca.falhas > 0 && <Numero valor={isca.falhas} rotulo={isca.falhas === 1 ? "falha" : "falhas"} erro />}
          {podeEditar && (
            <div className="ml-auto flex items-center gap-1">
              <label className="mr-1 flex cursor-pointer items-center gap-1.5 font-semibold">
                <input type="checkbox" checked={isca.ativo} disabled={ocupado} onChange={onAlternar} />
                {isca.ativo ? "Ligada" : "Desligada"}
              </label>
              <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={onEditar} disabled={ocupado} aria-label="Editar isca">
                <Pencil size={13} /> Editar
              </button>
              <button
                className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                onClick={onApagar}
                disabled={ocupado}
                aria-label="Apagar isca"
                title="Apagar isca"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Numero({ valor, rotulo, erro }: { valor: number; rotulo: string; erro?: boolean }) {
  return (
    <span className={clsx(erro ? "text-red-600" : "text-muted")}>
      <span className={clsx("text-sm font-bold tabular-nums", erro ? "text-red-600" : "text-ink-900")}>
        {valor.toLocaleString("pt-BR")}
      </span>{" "}
      {rotulo}
    </span>
  );
}

function ListaDeComentarios({
  comentarios,
  iscaPorId,
  canalPorId,
  variosCanais,
  base,
}: {
  comentarios: ComentarioView[];
  iscaPorId: Map<string, IscaView>;
  canalPorId: Map<string, CanalDeIsca>;
  variosCanais: boolean;
  base: string;
}) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm font-bold">Últimos comentários</p>
        <p className="mt-0.5 text-xs text-muted">
          Os mais recentes e o que a isca fez com cada um. Cada comentário é respondido uma vez só.
        </p>
      </div>
      {comentarios.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">
          Nenhum comentário recebido ainda. Eles aparecem aqui em até 1 minuto depois de feitos.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {comentarios.map((c) => {
            const Icone = ICONE_DO_CANAL[c.canal];
            const isca = c.iscaId ? iscaPorId.get(c.iscaId) : null;
            return (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-muted">
                  <Icone size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-sm font-semibold">
                      {c.autor}
                      {variosCanais && canalPorId.get(c.channelId) && (
                        <span className="ml-1.5 text-xs font-normal text-muted">em {canalPorId.get(c.channelId)!.label}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted">{dateTime(c.em)}</span>
                  </div>
                  {c.texto && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-800">{c.texto}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {!c.iscaId ? (
                      <Selo tom="neutro">Nenhuma isca serviu</Selo>
                    ) : c.respondeuDirect ? (
                      <Selo tom="ok">
                        <Check size={11} /> Mensagem no {PRIVADO_DO_CANAL[c.canal]}
                      </Selo>
                    ) : bloqueadoNoGateway(c.erro) ? (
                      <Selo tom="neutro">Pediu para sair: não recebeu</Selo>
                    ) : (
                      <Selo tom="erro">Sem mensagem privada</Selo>
                    )}
                    {c.respondeuPublico && <Selo tom="info">Respondeu no comentário</Selo>}
                    {c.iscaId && (
                      <span className="text-[11px] text-muted">
                        {isca ? `isca: ${isca.keyword ? `"${isca.keyword}"` : "qualquer comentário"}` : "isca apagada"}
                      </span>
                    )}
                    {c.conversationId && (
                      <Link
                        href={`${base}/central?c=${c.conversationId}`}
                        className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                      >
                        Abrir conversa <ExternalLink size={11} />
                      </Link>
                    )}
                  </div>
                  {c.erro && !bloqueadoNoGateway(c.erro) && <p className="mt-1 text-xs text-red-600">Falha: {c.erro}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Modal da isca ─────────────────────────────────────────────

function Contador({ n, limite }: { n: number; limite: number }) {
  return (
    <span className={clsx("text-[11px] tabular-nums", n > limite * 0.9 ? "text-amber-700" : "text-muted")}>
      {n}/{limite}
    </span>
  );
}

function IscaModal({
  inicial,
  canais,
  posts,
  onCanal,
  onClose,
  onSave,
}: {
  inicial: Rascunho;
  canais: CanalDeIsca[];
  posts: Record<string, EstadoDosPosts>;
  onCanal: (channelId: string) => void;
  onClose: () => void;
  onSave: (r: Rascunho) => Promise<string | null>;
}) {
  const [r, setR] = useState<Rascunho>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));
  const canal = canais.find((c) => c.id === r.channelId) ?? null;
  const kind: CanalDaIsca = canal?.kind ?? r.canal;
  const privado = PRIVADO_DO_CANAL[kind];

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    if (!r.directMessage.trim()) {
      setErro(`Escreva a mensagem que a pessoa recebe no ${privado}.`);
      return;
    }
    setSalvando(true);
    setErro(await onSave(r));
    setSalvando(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <form
        onSubmit={salvar}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <MessageCircleReply size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{r.id ? "Editar isca" : "Nova isca"}</p>
            <p className="text-xs text-muted">Uma mensagem privada por comentário, em até 7 dias depois dele.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-muted hover:bg-canvas" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {canais.length > 1 && (
            <div>
              <p className="label">Canal</p>
              {r.id ? (
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {canal && (() => {
                    const Icone = ICONE_DO_CANAL[canal.kind];
                    return <Icone size={15} />;
                  })()}
                  {canal?.label ?? "Canal desconectado"}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {canais.map((c) => {
                    const Icone = ICONE_DO_CANAL[c.kind];
                    const ativo = c.id === r.channelId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => {
                          if (ativo) return;
                          // Post é de um canal só: trocar de canal volta para "todos os posts".
                          setR((x) => ({ ...x, channelId: c.id, canal: c.kind, mediaId: "", post: null }));
                          onCanal(c.id);
                        }}
                        className={clsx(
                          "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                          ativo ? "pill-active border-transparent" : "border-line hover:border-ink-300",
                        )}
                      >
                        <Icone size={15} /> {c.label}
                        {c.status !== "connected" && <span className="text-[10px] font-normal opacity-80">(com erro)</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="label">Post</p>
            <EscolherPost
              key={r.channelId}
              estado={posts[r.channelId]}
              mediaId={r.mediaId}
              atual={r.post}
              kind={kind}
              onChange={(mediaId, post) => setR((x) => ({ ...x, mediaId, post }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="isca-palavra">
              Palavra-chave
            </label>
            <input
              id="isca-palavra"
              className="input"
              value={r.keyword}
              maxLength={LIMITE_PALAVRA}
              placeholder="Ex.: EU QUERO"
              onChange={(e) => set("keyword", e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted">
              Em branco, vale para qualquer comentário. Acento e maiúscula não importam.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="label" htmlFor="isca-direct">
                Mensagem no {privado}
              </label>
              <Contador n={r.directMessage.length} limite={LIMITE_DIRECT} />
            </div>
            <textarea
              id="isca-direct"
              className="input min-h-28"
              required
              rows={4}
              maxLength={LIMITE_DIRECT}
              value={r.directMessage}
              placeholder="Oi! Vi seu comentário. Quer que eu te mande as fotos e o valor do carro?"
              onChange={(e) => set("directMessage", e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted">
              Obrigatória. É a isca: se a pessoa responder, a conversa abre na Central e a IA assume.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="label" htmlFor="isca-publica">
                Resposta pública no comentário
              </label>
              <Contador n={r.publicReply.length} limite={LIMITE_PUBLICO} />
            </div>
            <textarea
              id="isca-publica"
              className="input"
              rows={2}
              maxLength={LIMITE_PUBLICO}
              value={r.publicReply}
              placeholder={`Te chamei no ${privado}!`}
              onChange={(e) => set("publicReply", e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted">Opcional. Todo mundo vê, assinada pela conta.</p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={r.ativo} onChange={(e) => set("ativo", e.target.checked)} />
            Isca ativa
          </label>

          {erro && (
            <p className="flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertCircle size={14} className="shrink-0" /> {erro}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={salvando || !r.directMessage.trim() || !r.channelId}>
            {salvando ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Salvando…
              </>
            ) : r.id ? (
              "Salvar"
            ) : (
              "Criar isca"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * O post pela foto. Sem a lista (o gateway não respondeu), volta o campo do
 * id do post, como antes. "Todos os posts" é sempre a primeira opção.
 */
function EscolherPost({
  estado,
  mediaId,
  atual,
  kind,
  onChange,
}: {
  estado: EstadoDosPosts | undefined;
  mediaId: string;
  atual: PostEscolhido | null;
  kind: CanalDaIsca;
  onChange: (mediaId: string, post: PostEscolhido | null) => void;
}) {
  const lista = Array.isArray(estado) ? estado : null;
  const [manual, setManual] = useState(false);
  const carregando = estado === "carregando" || estado === undefined;

  if (carregando) {
    return (
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="aspect-square animate-pulse rounded-xl bg-canvas" />
        ))}
        <p className="col-span-full flex items-center gap-1.5 text-[11px] text-muted">
          <Loader2 size={12} className="animate-spin" /> Buscando os posts recentes…
        </p>
      </div>
    );
  }

  if (manual || !lista || lista.length === 0) {
    return (
      <div>
        <input
          className="input"
          value={mediaId}
          inputMode="text"
          placeholder="Id do post (em branco: todos os posts)"
          onChange={(e) => onChange(e.target.value.trim(), null)}
        />
        <p className="mt-1 text-[11px] text-muted">
          {lista?.length
            ? "Cole o id do post, ou deixe em branco para valer em todos."
            : lista
              ? "Nenhum post recente nesta conta. Cole o id do post, ou deixe em branco para valer em todos."
              : "A lista de posts não respondeu agora. Cole o id do post, ou deixe em branco para valer em todos."}
        </p>
        {lista?.length ? (
          <button type="button" onClick={() => setManual(false)} className="mt-1 text-xs font-semibold text-brand-700 hover:underline">
            Escolher pela foto
          </button>
        ) : null}
      </div>
    );
  }

  const naLista = !mediaId || lista.some((p) => p.id === mediaId);
  const escolhido = lista.find((p) => p.id === mediaId) ?? null;

  return (
    <div>
      <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
        <Tile ativo={!mediaId} onClick={() => onChange("", null)} title="Todos os posts">
          <span className="flex h-full flex-col items-center justify-center gap-1 bg-canvas p-1 text-center text-[11px] font-semibold leading-tight">
            <Images size={16} className="text-muted" />
            Todos os posts
          </span>
        </Tile>
        {!naLista && (
          <Tile ativo onClick={() => undefined} title={atual?.legenda ?? `Post ${mediaId}`}>
            <FotoDoTile imagem={atual?.imagem ?? null} legenda={atual?.legenda ?? `Post ${mediaId}`} />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
              Post atual
            </span>
          </Tile>
        )}
        {lista.map((p) => (
          <Tile
            key={p.id}
            ativo={p.id === mediaId}
            onClick={() => onChange(p.id, { legenda: p.legenda, imagem: p.imagem, link: p.link })}
            title={p.legenda?.slice(0, 120) ?? undefined}
          >
            <FotoDoTile imagem={p.imagem} legenda={p.legenda} />
            {(p.tipo === "video" || p.tipo === "reel") && (
              <Film size={13} className="absolute right-1 top-1 text-white drop-shadow" aria-label="Vídeo" />
            )}
          </Tile>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="min-w-0 truncate">
          {mediaId
            ? `Só neste post${(escolhido?.legenda ?? atual?.legenda) ? `: "${resumoDaLegenda(escolhido?.legenda ?? atual?.legenda, 50)}"` : ""}`
            : `Vale para qualquer post ${kind === "instagram" ? "ou reel da conta" : "da Página"}.`}
        </span>
        <button type="button" onClick={() => setManual(true)} className="font-semibold hover:text-ink-900">
          Não achou? Colar o id do post
        </button>
      </div>
    </div>
  );
}

function Tile({
  ativo,
  onClick,
  title,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={title}
      className={clsx(
        "relative aspect-square overflow-hidden rounded-xl border-2 transition",
        ativo ? "border-ink-900" : "border-transparent hover:border-line",
      )}
    >
      {children}
      {ativo && (
        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-paper">
          <Check size={12} />
        </span>
      )}
    </button>
  );
}

function FotoDoTile({ imagem, legenda }: { imagem: string | null; legenda: string | null }) {
  const [quebrou, setQuebrou] = useState(false);
  if (imagem && !quebrou) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imagem} alt="" loading="lazy" onError={() => setQuebrou(true)} className="h-full w-full object-cover" />;
  }
  // Post de texto da Página (ou foto que venceu): a legenda no lugar da foto.
  return (
    <span className="flex h-full items-center justify-center bg-canvas p-1.5 text-center text-[10px] leading-tight text-muted">
      <span className="line-clamp-4">{legenda || "post sem foto"}</span>
    </span>
  );
}
