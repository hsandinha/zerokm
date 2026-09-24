"use client";

// Pipeline de atendimento: cada cartão é uma conversa do número da CNV, na
// etapa em que o lojista está. A etapa avança sozinha pelo fluxo (resposta →
// cadastro → pagamento → assinatura); arrastar corrige — e é o único jeito de
// marcar "assinante" à mão.

import { useCallback, useEffect, useState, type DragEvent } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  Hourglass,
  MessageCircle,
  RefreshCw,
  Search,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  STAGES,
  STAGE_BY_ID,
  STALLED_DAYS,
  STATUS_LABEL,
  daysSince,
  formatNumber,
  initials,
  timeAgo,
  type ConversationStatus,
  type Stage,
} from "@wa/lib/stages";

const POLL_MS = 10_000;

type Item = {
  id: string;
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
  /** Já tem conta na CNV (o cadastro criado pela IA). */
  registered: boolean;
  stalled: boolean;
};

type Data = {
  items: Item[];
  stageCounts: Record<string, number>;
  kpis: { open: number; stalled: number; wonMonth: number };
  perColumn: Record<string, number>;
};

export function Pipeline() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [showAbordado, setShowAbordado] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/pipeline");
      if (!res.ok) {
        setError("Não foi possível carregar o pipeline.");
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      /* rede oscilou — o próximo poll resolve */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      // Não troca a lista debaixo do cartão que está sendo arrastado.
      if (!dragId) load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load, dragId]);

  async function move(id: string, stage: Stage) {
    if (!data) return;
    const current = data.items.find((i) => i.id === id);
    if (!current || current.stage === stage) return;

    // Otimista: o cartão muda de coluna na hora; se a API falhar, recarrega.
    setData({
      ...data,
      items: data.items.map((i) =>
        i.id === id ? { ...i, stage, stageChangedAt: new Date().toISOString(), stalled: false } : i,
      ),
      stageCounts: {
        ...data.stageCounts,
        [current.stage]: Math.max(0, (data.stageCounts[current.stage] ?? 1) - 1),
        [stage]: (data.stageCounts[stage] ?? 0) + 1,
      },
    });

    const res = await fetch(`/api/wa/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "etapa", stage }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Falha ao mover o negócio");
    }
    await load();
  }

  function onDrop(e: DragEvent<HTMLDivElement>, stage: Stage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setOverStage(null);
    setDragId(null);
    if (id) move(id, stage);
  }

  const term = q.trim().toLowerCase();
  const matches = (i: Item) =>
    !term ||
    [i.name, i.phone, i.company, i.document].some((v) => v?.toLowerCase().includes(term));

  const columns = STAGES.filter((s) => showAbordado || s.id !== "abordado").map((s) => ({
    meta: s,
    items: (data?.items ?? []).filter((i) => i.stage === s.id && matches(i)),
    total: data?.stageCounts[s.id] ?? 0,
    cap: data?.perColumn[s.id] ?? 80,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">Atendimento</p>
          <h1 className="mt-1 text-2xl font-bold">Pipeline de vendas</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Cada cartão é uma conversa. A etapa avança sozinha conforme o lojista responde, cria o
            cadastro e recebe a cobrança. Arraste para corrigir — e para marcar como{" "}
            <b>assinante</b> quando a venda fechar fora do sistema.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input w-56 py-1.5 pl-8 text-xs"
              placeholder="Filtrar por nome ou empresa"
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
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">{error}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          icon={Target}
          label="Em andamento"
          value={data?.kpis.open ?? 0}
          hint="em conversa, cadastrados ou com cobrança enviada"
        />
        <Kpi icon={Trophy} label="Assinantes no mês" value={data?.kpis.wonMonth ?? 0} hint="assinatura ativa" />
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
          {columns.map(({ meta, items, total, cap }) => (
            <div
              key={meta.id}
              className={clsx(
                "flex w-72 shrink-0 flex-col rounded-3xl border border-line bg-paper",
                overStage === meta.id && dragId && "drop-target",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (overStage !== meta.id) setOverStage(meta.id);
              }}
              onDragLeave={() => overStage === meta.id && setOverStage(null)}
              onDrop={(e) => onDrop(e, meta.id)}
            >
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <span className={clsx("h-2.5 w-2.5 rounded-full", meta.dot)} />
                <span className="text-sm font-bold">{meta.label}</span>
                <span className="text-xs text-muted">{formatNumber(total)}</span>
                <span className="ml-auto text-[10px] text-muted" title={meta.hint}>
                  {meta.hint}
                </span>
              </div>

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
                    dragging={dragId === item.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", item.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(item.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                  />
                ))}
                {total > cap && items.length >= cap && (
                  <p className="px-2 py-1 text-center text-[11px] text-muted">
                    mostrando {cap} de {formatNumber(total)} — use a busca para achar os outros
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  item,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  item: Item;
  dragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
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
          href={`/dashboard/admin/whatsapp/central?c=${item.id}`}
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
        {item.registered && (
          <span
            className="flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
            title="Já tem conta na CNV"
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
            <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">{item.unread}</span>
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
