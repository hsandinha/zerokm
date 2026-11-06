"use client";

// Funil de vendas: cada cartão é uma conversa, na coluna em que está. As
// colunas são do dono (a loja ou o CNV, wa/lib/funil.ts): o gestor cria,
// renomeia, muda a cor, reordena e apaga. A IA e o disparo levam os cartões
// para as colunas automáticas; arrastar corrige e é o único jeito de marcar a
// venda fechada à mão.

import { useCallback, useEffect, useState, type DragEvent } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  Eye,
  EyeOff,
  Hourglass,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Target,
  Trash2,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import {
  COLUNA_CORES,
  STALLED_DAYS,
  STATUS_LABEL,
  TIPO_LABEL,
  corDaColuna,
  daysSince,
  formatNumber,
  initials,
  stageByIdFor,
  timeAgo,
  type ColunaTipo,
  type ConversationStatus,
  type FunilColuna,
  type Stage,
} from "@wa/lib/stages";
import { usePodeUsar, useWaPanel } from "@wa/components/wa-panel";
import {
  CAMPOS_DO_FOLLOWUP,
  FOLLOWUP_PADRAO,
  preencherTexto,
  type FollowupConfig,
} from "@wa/lib/automacoes";
import { CamposDoTexto, EscolhaDeTemplate, useModelosAutomaticos } from "@wa/components/template-automatico";
import { EVENTOS_META, EVENTO_META_ROTULO, eventoDaColuna, type EventoMeta } from "@wa/lib/conversoes-meta";

const POLL_MS = 10_000;

type Item = {
  id: string;
  /** Coluna em que o quadro mostra o cartão; "sem" = nenhuma serve. */
  colunaId: string;
  stage: Stage;
  status: ConversationStatus;
  outcome: string | null;
  transferReason: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  stageChangedAt: string;
  assignedTo: string | null;
  campaignId: string | null;
  unread: number;
  preview: string | null;
  name: string | null;
  phone: string;
  company: string | null;
  city: string | null;
  state: string | null;
  document: string | null;
  /** Já tem conta no CNV (o cadastro criado pela IA). Só o painel do CNV mostra. */
  registered: boolean;
  stalled: boolean;
};

type Data = {
  colunas: FunilColuna[];
  podeEditar: boolean;
  faltamPadrao: boolean;
  items: Item[];
  contagem: Record<string, number>;
  kpis: { open: number; stalled: number; wonMonth: number };
  perColumn: Record<string, number>;
};

type Edicao = { mode: "nova" } | { mode: "editar"; coluna: FunilColuna };

export function Pipeline() {
  const { base, store } = useWaPanel();
  const podeUsar = usePodeUsar();
  const etapas = stageByIdFor(store);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [showAbordado, setShowAbordado] = useState(true);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [apagando, setApagando] = useState<FunilColuna | null>(null);
  // Follow-up automático por coluna (wa/lib/funil-followup.ts): o sino no
  // cabeçalho mostra onde está ligado.
  const [followups, setFollowups] = useState<Record<string, FollowupConfig>>({});
  const [followupDe, setFollowupDe] = useState<FunilColuna | null>(null);
  const comFollowup = podeUsar("automacoes");
  const loadFollowups = useCallback(async () => {
    const res = await fetch("/api/wa/funil/followup").catch(() => null);
    if (res?.ok) setFollowups((await res.json()).followups ?? {});
  }, []);
  useEffect(() => {
    if (comFollowup) loadFollowups();
  }, [comFollowup, loadFollowups]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/pipeline");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível carregar o funil.");
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      /* rede oscilou, o próximo poll resolve */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      // Não troca a lista debaixo do cartão arrastado nem do modal aberto.
      if (!dragId && !edicao && !apagando) load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load, dragId, edicao, apagando]);

  // Fecha o menu da coluna ao clicar fora.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  async function move(id: string, colunaId: string) {
    if (!data) return;
    const current = data.items.find((i) => i.id === id);
    if (!current || current.colunaId === colunaId) return;

    // Otimista: o cartão muda de coluna na hora; se a API falhar, recarrega.
    setData({
      ...data,
      items: data.items.map((i) =>
        i.id === id ? { ...i, colunaId, stageChangedAt: new Date().toISOString(), stalled: false } : i,
      ),
      contagem: {
        ...data.contagem,
        [current.colunaId]: Math.max(0, (data.contagem[current.colunaId] ?? 1) - 1),
        [colunaId]: (data.contagem[colunaId] ?? 0) + 1,
      },
    });

    const res = await fetch("/api/wa/pipeline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, colunaId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Falha ao mover o negócio");
    }
    await load();
  }

  function onDrop(e: DragEvent<HTMLDivElement>, colunaId: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setOverCol(null);
    setDragId(null);
    if (id) move(id, colunaId);
  }

  /** Chamada que mexe na estrutura e devolve as colunas novas. */
  async function estrutura(url: string, init: RequestInit): Promise<boolean> {
    setError(null);
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Não foi possível alterar as colunas.");
      return false;
    }
    await load();
    return true;
  }

  const term = q.trim().toLowerCase();
  const matches = (i: Item) =>
    !term || [i.name, i.phone, i.company, i.document].some((v) => v?.toLowerCase().includes(term));

  const colunas = data?.colunas ?? [];
  const semEtapa = (data?.contagem.sem ?? 0) > 0;
  const lanes = [
    ...colunas
      .filter((c) => showAbordado || c.systemKey !== "abordado")
      .map((c, i, arr) => ({ coluna: c as FunilColuna | null, id: c.id, primeira: i === 0, ultima: i === arr.length - 1 })),
    ...(semEtapa ? [{ coluna: null, id: "sem", primeira: false, ultima: false }] : []),
  ].map((lane) => ({
    ...lane,
    items: (data?.items ?? []).filter((i) => i.colunaId === lane.id && matches(i)),
    total: data?.contagem[lane.id] ?? 0,
    cap: data?.perColumn[lane.id] ?? 80,
  }));

  const dicaDaColuna = (c: FunilColuna) =>
    c.systemKey ? etapas[c.systemKey].hint : `${TIPO_LABEL[c.type]}, coluna ${store ? "da loja" : "própria"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">Atendimento</p>
          <h1 className="mt-1 text-2xl font-bold">{store ? "Funil de vendas" : "Pipeline de vendas"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {store ? (
              <>
                Cada cartão é uma conversa. A IA leva o cartão sozinha conforme o cliente responde, pede
                visita ou simula a parcela. Arraste para corrigir e para marcar <b>vendido</b> quando a
                venda fechar.
              </>
            ) : (
              <>
                Cada cartão é uma conversa. A etapa avança sozinha conforme o lojista responde, cria o
                cadastro e recebe a cobrança. Arraste para corrigir e para marcar como <b>assinante</b>{" "}
                quando a venda fechar fora do sistema.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input w-56 py-1.5 pl-8 text-xs"
              placeholder={store ? "Filtrar por nome ou telefone" : "Filtrar por nome ou empresa"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setShowAbordado((v) => !v)}
            title={showAbordado ? "Esconder quem ainda não respondeu" : "Mostrar quem ainda não respondeu"}
          >
            {showAbordado ? <EyeOff size={14} /> : <Eye size={14} />}
            {showAbordado ? "Ocultar abordados" : "Mostrar abordados"}
          </button>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={load}>
            <RefreshCw size={14} /> Atualizar
          </button>
          {data?.podeEditar && (
            <button className="btn-dark px-3 py-1.5 text-xs" onClick={() => setEdicao({ mode: "nova" })}>
              <Plus size={14} /> Nova coluna
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">{error}</p>
      )}

      {data?.podeEditar && data.faltamPadrao && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span>
            Falta alguma coluna automática. Os cartões dessa etapa ficam em &quot;Sem etapa&quot; até você
            restaurar.
          </span>
          <button
            className="btn-ghost px-3 py-1 text-xs"
            onClick={() => estrutura("/api/wa/funil", { method: "POST", body: JSON.stringify({ acao: "restaurar" }) })}
          >
            <RotateCcw size={13} /> Restaurar colunas padrão
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          icon={Target}
          label="Em andamento"
          value={data?.kpis.open ?? 0}
          hint={store ? "em atendimento, visita ou proposta" : "em conversa, cadastrados ou com cobrança enviada"}
        />
        <Kpi
          icon={Trophy}
          label={store ? "Vendas no mês" : "Assinantes no mês"}
          value={data?.kpis.wonMonth ?? 0}
          hint={store ? "negócios marcados como vendidos" : "assinatura ativa"}
        />
        <Kpi
          icon={Hourglass}
          label="Negócios parados"
          value={data?.kpis.stalled ?? 0}
          hint={`${STALLED_DAYS} dias ou mais sem mensagem`}
          tone={(data?.kpis.stalled ?? 0) > 0 ? "warn" : "flat"}
        />
      </div>

      {!data ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {lanes.map(({ coluna, id, primeira, ultima, items, total, cap }) => (
            <div
              key={id}
              className={clsx(
                "relative flex w-72 shrink-0 flex-col rounded-3xl border border-line bg-paper",
                !coluna && "border-dashed",
                overCol === id && dragId && coluna && "drop-target",
              )}
              onDragOver={(e) => {
                if (!coluna) return; // "Sem etapa" não recebe cartão
                e.preventDefault();
                if (overCol !== id) setOverCol(id);
              }}
              onDragLeave={() => overCol === id && setOverCol(null)}
              onDrop={(e) => coluna && onDrop(e, id)}
            >
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", coluna ? corDaColuna(coluna.color).dot : "bg-ink-200")} />
                <span className="truncate text-sm font-bold">{coluna?.name ?? "Sem etapa"}</span>
                <span className="text-xs text-muted">{formatNumber(total)}</span>
                {coluna && comFollowup && followups[id]?.ativo && (
                  <span
                    className="text-brand-700"
                    title={`Follow-up ligado: ${followups[id].horas}h sem resposta, até ${followups[id].maximo} toque${followups[id].maximo === 1 ? "" : "s"}`}
                  >
                    <Bell size={13} aria-label="Follow-up ligado" />
                  </span>
                )}
                {coluna && eventoDaColuna(coluna) && (
                  <span
                    className="text-muted"
                    title={`Conversa que veio de anúncio e entra aqui manda ${eventoDaColuna(coluna)} para a Meta`}
                  >
                    <Send size={12} aria-label={`Evento ${eventoDaColuna(coluna)} para a Meta`} />
                  </span>
                )}
                {coluna && data.podeEditar && (
                  <button
                    className="ml-auto rounded-full p-1 text-muted hover:bg-canvas hover:text-ink-900"
                    title="Opções da coluna"
                    aria-label={`Opções da coluna ${coluna.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu === id ? null : id);
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}
              </div>
              <p className="-mt-1 px-4 pb-2 text-[10px] text-muted">
                {coluna ? dicaDaColuna(coluna) : "Cartões cuja coluna foi apagada. Arraste para uma coluna."}
              </p>

              {coluna && menu === id && (
                <div
                  className="absolute right-3 top-11 z-20 w-56 overflow-hidden rounded-2xl border border-line bg-paper py-1 text-sm shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem icon={Pencil} onClick={() => { setMenu(null); setEdicao({ mode: "editar", coluna }); }}>
                    Editar coluna
                  </MenuItem>
                  {comFollowup && (
                    <MenuItem icon={Bell} onClick={() => { setMenu(null); setFollowupDe(coluna); }}>
                      Follow-up
                    </MenuItem>
                  )}
                  {!primeira && (
                    <MenuItem
                      icon={ArrowLeft}
                      onClick={() => {
                        setMenu(null);
                        estrutura(`/api/wa/funil/${id}`, { method: "PATCH", body: JSON.stringify({ mover: "esquerda" }) });
                      }}
                    >
                      Mover para a esquerda
                    </MenuItem>
                  )}
                  {!ultima && (
                    <MenuItem
                      icon={ArrowRight}
                      onClick={() => {
                        setMenu(null);
                        estrutura(`/api/wa/funil/${id}`, { method: "PATCH", body: JSON.stringify({ mover: "direita" }) });
                      }}
                    >
                      Mover para a direita
                    </MenuItem>
                  )}
                  {store && podeUsar("campanhas") && (
                    <Link
                      href={`${base}/campanhas/nova?coluna=${id}`}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink-800 hover:bg-canvas"
                    >
                      <Megaphone size={14} className="text-muted" /> Campanha para esta coluna
                    </Link>
                  )}
                  <MenuItem icon={Trash2} danger onClick={() => { setMenu(null); setApagando(coluna); }}>
                    Apagar coluna
                  </MenuItem>
                </div>
              )}

              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2" style={{ minHeight: "50vh", maxHeight: "calc(100dvh - 22rem)" }}>
                {items.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
                    {term ? "Nada com esse filtro." : "Arraste um negócio para cá"}
                  </p>
                )}
                {items.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    colunas={colunas}
                    dragging={dragId === item.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", item.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(item.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    onMove={(colunaId) => move(item.id, colunaId)}
                  />
                ))}
                {total > cap && items.length >= cap && (
                  <p className="px-2 py-1 text-center text-[11px] text-muted">
                    mostrando {cap} de {formatNumber(total)}. Use a busca para achar os outros.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {edicao && (
        <ColunaModal
          edicao={edicao}
          onClose={() => setEdicao(null)}
          onSave={async (valores) => {
            const ok =
              edicao.mode === "nova"
                ? await estrutura("/api/wa/funil", { method: "POST", body: JSON.stringify({ acao: "criar", ...valores }) })
                : await estrutura(`/api/wa/funil/${edicao.coluna.id}`, { method: "PATCH", body: JSON.stringify(valores) });
            if (ok) setEdicao(null);
            return ok;
          }}
        />
      )}

      {followupDe && (
        <FollowupModal
          coluna={followupDe}
          atual={followups[followupDe.id] ?? FOLLOWUP_PADRAO}
          onClose={() => setFollowupDe(null)}
          onSave={async (valores) => {
            setError(null);
            const res = await fetch(`/api/wa/funil/${followupDe.id}/followup`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(valores),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) return body.error ?? "Não foi possível salvar o follow-up.";
            await loadFollowups();
            setFollowupDe(null);
            return null;
          }}
        />
      )}

      {apagando && (
        <ApagarModal
          coluna={apagando}
          cartoes={data?.contagem[apagando.id] ?? 0}
          onClose={() => setApagando(null)}
          onConfirm={async () => {
            const ok = await estrutura(`/api/wa/funil/${apagando.id}`, { method: "DELETE" });
            if (ok) setApagando(null);
          }}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  danger,
  onClick,
  children,
}: {
  icon: typeof Pencil;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={clsx(
        "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-canvas",
        danger ? "text-red-600" : "text-ink-800",
      )}
      onClick={onClick}
    >
      <Icon size={14} className={danger ? "text-red-500" : "text-muted"} /> {children}
    </button>
  );
}

/** Moldura dos modais do funil, no mesmo padrão dos outros do atendimento. */
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{title}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ColunaModal({
  edicao,
  onClose,
  onSave,
}: {
  edicao: Edicao;
  onClose: () => void;
  onSave: (valores: {
    name: string;
    color: string;
    type?: ColunaTipo;
    eventoMeta: EventoMeta | null;
  }) => Promise<boolean>;
}) {
  const { base } = useWaPanel();
  const atual = edicao.mode === "editar" ? edicao.coluna : null;
  const [name, setName] = useState(atual?.name ?? "");
  const [color, setColor] = useState(atual?.color ?? "azul");
  const [type, setType] = useState<ColunaTipo>(atual?.type ?? "open");
  // O evento segue o tipo enquanto ninguém escolheu (venda fechada = Purchase).
  const [evento, setEvento] = useState<EventoMeta | null>(eventoDaColuna(atual ?? { type: "open" }));
  const [eventoEscolhido, setEventoEscolhido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const sistema = Boolean(atual?.systemKey);

  function trocarTipo(t: ColunaTipo) {
    setType(t);
    // Coluna nova (ou antiga, que ainda segue o tipo): acompanha a troca.
    if (!eventoEscolhido && atual?.eventoMeta === undefined) setEvento(eventoDaColuna({ type: t }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || salvando) return;
    setSalvando(true);
    await onSave({ name: name.trim(), color, ...(sistema ? {} : { type }), eventoMeta: evento });
    setSalvando(false);
  }

  return (
    <Modal
      title={atual ? "Editar coluna" : "Nova coluna"}
      subtitle={
        sistema
          ? "Coluna automática: a IA e o disparo trazem os cartões para cá. Dá para trocar o nome, a cor e o evento para a Meta."
          : "A coluna entra no fim do quadro. Depois é só arrastar os cartões para ela."
      }
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={salvar}>
        <label className="block text-xs font-semibold text-ink-800">
          Nome
          <input
            className="input mt-1 w-full"
            value={name}
            maxLength={40}
            autoFocus
            placeholder="Ex.: Aguardando financiamento"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div>
          <p className="text-xs font-semibold text-ink-800">Cor</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(COLUNA_CORES).map(([key, c]) => (
              <button
                key={key}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={color === key}
                onClick={() => setColor(key)}
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-full border",
                  color === key ? "border-ink-900" : "border-line",
                )}
              >
                <span className={clsx("h-4 w-4 rounded-full", c.dot)} />
              </button>
            ))}
          </div>
        </div>

        {!sistema && (
          <div>
            <p className="text-xs font-semibold text-ink-800">O que esta coluna significa</p>
            <div className="mt-2 grid gap-2">
              {(
                [
                  ["open", "Em andamento", "O negócio continua aberto e a IA segue atendendo."],
                  ["won", "Venda fechada", "Conta nas vendas do mês."],
                  ["lost", "Perdido", "O negócio sai das contas de em andamento."],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={clsx(
                    "flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2 text-xs",
                    type === value ? "border-ink-900 bg-canvas" : "border-line",
                  )}
                >
                  <input
                    type="radio"
                    name="tipo"
                    className="mt-0.5"
                    checked={type === value}
                    onChange={() => trocarTipo(value)}
                  />
                  <span>
                    <span className="font-semibold text-ink-900">{label}</span>
                    <span className="block text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="block text-xs font-semibold text-ink-800">
          Evento na Meta quando o cartão entra nesta coluna
          <select
            className="input mt-1 w-full"
            value={evento ?? ""}
            onChange={(e) => {
              setEventoEscolhido(true);
              setEvento((e.target.value || null) as EventoMeta | null);
            }}
          >
            <option value="">Nenhum</option>
            {EVENTOS_META.map((nome) => (
              <option key={nome} value={nome}>
                {EVENTO_META_ROTULO[nome]}
              </option>
            ))}
          </select>
          <span className="mt-1 block font-normal text-muted">
            Só conversas que vieram de anúncio, uma vez por conversa: a Meta aprende com quem compra. Precisa dos{" "}
            <Link href={`${base}/configuracao`} className="font-semibold text-brand-700 hover:underline">
              eventos para a Meta
            </Link>{" "}
            ligados na Configuração.
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={!name.trim() || salvando}>
            {salvando ? "Salvando…" : atual ? "Salvar" : "Criar coluna"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FollowupModal({
  coluna,
  atual,
  onClose,
  onSave,
}: {
  coluna: FunilColuna;
  atual: FollowupConfig;
  onClose: () => void;
  onSave: (valores: FollowupConfig) => Promise<string | null>;
}) {
  const [f, setF] = useState<FollowupConfig>(atual);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { modelos, aviso, carregando } = useModelosAutomaticos();
  const set = <K extends keyof FollowupConfig>(k: K, v: FollowupConfig[K]) => setF((x) => ({ ...x, [k]: v }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(await onSave(f));
    setSalvando(false);
  }

  return (
    <Modal
      title={`Follow-up em "${coluna.name}"`}
      subtitle="Quem está nesta coluna e parou de responder recebe um toque. A resposta do cliente zera a contagem."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={salvar}>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={f.ativo} onChange={(e) => set("ativo", e.target.checked)} />
          Follow-up ligado nesta coluna
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-ink-800">
            Depois de quantas horas sem resposta
            <input
              type="number"
              className="input mt-1 w-full"
              min={1}
              max={720}
              value={f.horas}
              onChange={(e) => set("horas", Number(e.target.value))}
            />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Máximo de toques
            <input
              type="number"
              className="input mt-1 w-full"
              min={1}
              max={10}
              value={f.maximo}
              onChange={(e) => set("maximo", Number(e.target.value))}
            />
          </label>
        </div>

        <div>
          <p className="text-xs font-semibold text-ink-800">Dentro da janela de 24h</p>
          <div className="mt-2 grid gap-2">
            {(
              [
                ["texto", "Texto fixo", "Vai o texto abaixo, com o primeiro nome no lugar de {{nome}}."],
                ["ia", "A IA escreve", "A IA da loja lê a conversa e escreve o toque, seguindo a orientação abaixo. Sem IA disponível, o toque não sai."],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={clsx(
                  "flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2 text-xs",
                  f.modo === value ? "border-ink-900 bg-canvas" : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="modo"
                  className="mt-0.5"
                  checked={f.modo === value}
                  onChange={() => set("modo", value)}
                />
                <span>
                  <span className="font-semibold text-ink-900">{label}</span>
                  <span className="block text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-800">
            {f.modo === "ia" ? "Orientação para a IA (opcional)" : "Texto do follow-up"}
            <textarea
              className="input mt-1 min-h-[90px] w-full"
              maxLength={1000}
              value={f.texto}
              placeholder={f.modo === "ia" ? "Ex.: lembre que a proposta vale até sexta." : ""}
              onChange={(e) => set("texto", e.target.value)}
            />
          </label>
          {f.modo === "texto" && (
            <>
              <div className="mt-1.5">
                <CamposDoTexto
                  campos={CAMPOS_DO_FOLLOWUP}
                  onInserir={(m) => set("texto", `${f.texto}${f.texto && !f.texto.endsWith(" ") ? " " : ""}${m}`)}
                />
              </div>
              {f.texto && (
                <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-canvas px-3 py-2 text-xs text-ink-800">
                  {preencherTexto(f.texto, { nome: "Ana", nome_completo: "Ana Souza", loja: "a loja" })}
                </p>
              )}
            </>
          )}
        </div>

        <EscolhaDeTemplate
          modelos={modelos}
          aviso={aviso}
          carregando={carregando}
          template={f.template}
          idioma={f.templateIdioma}
          vars={f.templateVars}
          campos={CAMPOS_DO_FOLLOWUP}
          semTemplate={
            f.horas >= 24
              ? "Com 24 horas ou mais sem resposta a janela já fechou: o template é obrigatório."
              : "Sem template, quem está fora da janela de 24h é pulado."
          }
          onChange={(v) => setF((x) => ({ ...x, ...v }))}
        />

        <p className="text-[11px] text-muted">
          Não sai de madrugada, para quem pediu opt-out, por SMS, nem em cima da cadência de uma campanha ou de
          outra mensagem automática.
        </p>

        {erro && <p className="text-xs text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ApagarModal({
  coluna,
  cartoes,
  onClose,
  onConfirm,
}: {
  coluna: FunilColuna;
  cartoes: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [apagando, setApagando] = useState(false);
  return (
    <Modal title={`Apagar a coluna "${coluna.name}"?`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-ink-800">
          {cartoes > 0
            ? `Os ${formatNumber(cartoes)} cartões dela voltam para a coluna da etapa em que estão. Nenhuma conversa é apagada.`
            : "Ela está vazia. Nenhuma conversa é apagada."}
        </p>
        {coluna.systemKey && (
          <p className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta é uma coluna automática. Sem ela, os cartões que a IA trouxer para esta etapa ficam em
            &quot;Sem etapa&quot; até você restaurar as colunas padrão.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="rounded-2xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            disabled={apagando}
            onClick={async () => {
              setApagando(true);
              await onConfirm();
              setApagando(false);
            }}
          >
            {apagando ? "Apagando…" : "Apagar coluna"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Card({
  item,
  colunas,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  item: Item;
  colunas: FunilColuna[];
  dragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onMove: (colunaId: string) => void;
}) {
  const { base, store } = useWaPanel();
  const st = STATUS_LABEL[item.status];
  const daysInStage = daysSince(item.stageChangedAt);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={clsx(
        "cursor-grab rounded-2xl border border-line bg-canvas p-3 text-sm shadow-[0_1px_2px_rgba(11,18,21,0.04)] transition hover:border-ink-300 active:cursor-grabbing",
        dragging && "dragging",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.name || item.phone}</p>
          {item.name && <p className="truncate text-[11px] text-muted">{item.phone}</p>}
        </div>
        <Link
          href={`${base}/central?c=${item.id}`}
          className="shrink-0 rounded-full p-1.5 text-muted hover:bg-paper hover:text-ink-900"
          title="Abrir conversa"
          onClick={(e) => e.stopPropagation()}
        >
          <MessageCircle size={15} />
        </Link>
      </div>

      {(item.company || item.city) && (
        <div className="mt-2 space-y-0.5 text-xs">
          {item.company && (
            <p className="flex items-center gap-1.5 text-ink-800">
              <Building2 size={12} className="shrink-0 text-muted" />
              <span className="truncate">{item.company}</span>
            </p>
          )}
          {item.city && (
            <p className="truncate text-[11px] text-muted">
              {item.city}
              {item.state ? `/${item.state}` : ""}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", st.cls)}>
          {st.label}
        </span>
        {!store && item.registered && (
          <span
            className="flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
            title="Já tem conta no CNV"
          >
            <BadgeCheck size={10} /> cadastrado
          </span>
        )}
        {item.campaignId && (
          <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">
            veio de campanha
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span>{item.lastMessageAt ? timeAgo(item.lastMessageAt) : "sem mensagem"}</span>
          {item.stalled && (
            <span className="flex items-center gap-0.5 font-semibold text-amber-700" title="Sem mensagem há 3 dias ou mais">
              <AlertTriangle size={11} /> parado
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {daysInStage > 0 && <span title="Dias nesta etapa">{daysInStage}d</span>}
          {item.unread > 0 && (
            <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-[#102333]">{item.unread}</span>
          )}
          {item.assignedTo && (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-700"
              title={item.assignedTo}
            >
              {initials(item.assignedTo.split("@")[0].replace(/[._-]/g, " "))}
            </span>
          )}
          {!item.assignedTo && item.status === "human_active" && <UserRound size={12} />}
        </span>
      </div>

      {/* Sem arrastar (celular, teclado): troca a coluna por aqui. */}
      <select
        className="mt-2 w-full rounded-xl border border-line bg-paper px-2 py-1 text-[11px] text-ink-700"
        value={item.colunaId === "sem" ? "" : item.colunaId}
        onChange={(e) => e.target.value && onMove(e.target.value)}
        aria-label="Mover para a coluna"
      >
        {item.colunaId === "sem" && <option value="">Mover para…</option>}
        {colunas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "flat",
}: {
  icon: typeof Target;
  label: string;
  value: number;
  hint: string;
  tone?: "flat" | "warn";
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <Icon size={16} className={tone === "warn" ? "text-amber-700" : "text-muted"} />
      </div>
      <p className={clsx("mt-2 text-3xl font-bold tracking-tight", tone === "warn" && value > 0 && "text-amber-700")}>
        {formatNumber(value)}
      </p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
