"use client";

// Visão geral: o estado da operação AGORA, o funil dos últimos 30 dias e o que
// a IA fez sozinha.
//
// A ordem das seções é a ordem das perguntas de quem abre o painel de manhã:
// "alguém está esperando?", "o que entrou?", "quanto virou cadastro e
// assinatura?". Número que não responde a uma dessas não entra aqui.

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CreditCard,
  Inbox,
  Loader2,
  MessageSquare,
  Send,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import {
  STAGE_BY_ID,
  TRANSFER_REASON_LABEL,
  formatNumber,
  greeting,
  money,
  percent,
  timeAgo,
  type Stage,
} from "@wa/lib/stages";

type Overview = {
  now: {
    total: number;
    waiting: number;
    ai: number;
    human: number;
    closedToday: number;
    sla: number;
    stages: Record<string, number>;
  };
  today: { inbound: number; inboundYesterday: number };
  funnel: {
    sent: number;
    replied: number;
    registered: number;
    payments: number;
    won: number;
    lost: number;
  };
  ai: { replies: number; followups: number; inCadence: number; transfers: number };
  base: { targetsReady: number; activeCampaigns: number };
  month: { won: number; approved: number; revenue: number };
  attention: Array<{
    id: string;
    reason: string | null;
    waitingSince: string | null;
    stage: string;
    preview: string | null;
    assignedTo: string | null;
    name: string | null;
    phone: string;
  }>;
  week: Array<{ key: string; label: string; inbound: number; ai: number }>;
};

const POLL_MS = 60_000;

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "normal",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Inbox;
  tone?: "normal" | "alert" | "good";
  href?: string;
}) {
  const body = (
    <div
      className={clsx(
        "card h-full transition",
        href && "hover:border-ink-300",
        tone === "alert" && "border-amber-300 bg-amber-50",
        tone === "good" && "border-emerald-300 bg-emerald-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <Icon
          size={16}
          className={clsx(
            tone === "alert" ? "text-amber-700" : tone === "good" ? "text-emerald-600" : "text-muted",
          )}
        />
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Barra do funil: a largura é relativa ao topo, para a queda ficar visível. */
function FunnelRow({
  label,
  value,
  top,
  color,
  hint,
}: {
  label: string;
  value: number;
  top: number;
  color: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-ink-900">{label}</span>
        <span className="tabular-nums text-muted">
          {formatNumber(value)}
          {top > 0 && <span className="ml-1.5 text-xs">({percent(value, top)})</span>}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
        <div
          className={clsx("h-full rounded-full transition-[width] duration-500", color)}
          style={{ width: top > 0 ? `${Math.max(2, Math.round((value / top) * 100))}%` : "0%" }}
        />
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Overview() {
  const [data, setData] = useState<Overview | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/wa/overview")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar"))))
        .then((d) => alive && setData(d))
        .catch((e) => alive && setErro(e instanceof Error ? e.message : "Falha"));
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (erro && !data) {
    return <p className="card text-sm text-red-600">{erro}</p>;
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Carregando…
      </p>
    );
  }

  const { now, today, funnel, ai, base, month, attention, week } = data;
  const maxDia = Math.max(1, ...week.map((d) => Math.max(d.inbound, d.ai)));
  const variacao = today.inbound - today.inboundYesterday;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl">{greeting()}</h1>
        <p className="text-sm text-muted">
          {now.waiting === 0
            ? "Nenhuma conversa esperando atendimento."
            : `${now.waiting} conversa${now.waiting === 1 ? "" : "s"} esperando atendimento${
                now.sla > 0 ? ` — ${now.sla} fora do SLA` : ""
              }.`}
        </p>
      </div>

      {/* ── Agora ──────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Aguardando humano"
          value={formatNumber(now.waiting)}
          hint={now.sla > 0 ? `${now.sla} há mais de 15 min` : "dentro do SLA"}
          icon={now.sla > 0 ? AlertTriangle : Inbox}
          tone={now.sla > 0 ? "alert" : "normal"}
          href="/dashboard/admin/whatsapp/central?filtro=waiting_human"
        />
        <Kpi
          label="Com a IA"
          value={formatNumber(now.ai)}
          hint={`${formatNumber(now.human)} em atendimento humano`}
          icon={Bot}
          href="/dashboard/admin/whatsapp/central?filtro=ai_active"
        />
        <Kpi
          label="Mensagens hoje"
          value={formatNumber(today.inbound)}
          hint={
            variacao === 0
              ? "igual a ontem"
              : `${variacao > 0 ? "+" : ""}${formatNumber(variacao)} em relação a ontem`
          }
          icon={MessageSquare}
        />
        <Kpi
          label="Resolvidas hoje"
          value={formatNumber(now.closedToday)}
          hint={`${formatNumber(now.total)} conversas no total`}
          icon={CheckCircle2}
          tone={now.closedToday > 0 ? "good" : "normal"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Funil ───────────────────────────────────────── */}
        <section className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base">Funil — últimos 30 dias</h2>
            <Link href="/dashboard/admin/whatsapp/pipeline" className="text-xs font-semibold text-brand-700 hover:underline">
              ver pipeline →
            </Link>
          </div>
          <div className="space-y-4">
            <FunnelRow
              label="Disparos enviados"
              value={funnel.sent}
              top={funnel.sent}
              color="bg-ink-300"
              hint={`${formatNumber(base.activeCampaigns)} campanha(s) em execução`}
            />
            <FunnelRow label="Responderam" value={funnel.replied} top={funnel.sent} color="bg-sky-500" />
            <FunnelRow
              label="Cadastros criados"
              value={funnel.registered}
              top={funnel.sent}
              color="bg-violet-500"
              hint="cada cadastro já ativa o teste grátis de 24h"
            />
            <FunnelRow
              label="Pagamentos gerados"
              value={funnel.payments}
              top={funnel.sent}
              color="bg-amber-500"
            />
            <FunnelRow
              label="Assinantes"
              value={funnel.won}
              top={funnel.sent}
              color="bg-emerald-500"
              hint={`${formatNumber(funnel.lost)} perdidos no período`}
            />
          </div>
        </section>

        {/* ── O que a IA fez sozinha ──────────────────────── */}
        <section className="card">
          <h2 className="mb-3 text-base">A IA no período</h2>
          <dl className="space-y-3 text-sm">
            {[
              { label: "Respostas enviadas", value: ai.replies, icon: Bot },
              { label: "Cadastros criados", value: funnel.registered, icon: UserPlus },
              { label: "Pagamentos gerados", value: funnel.payments, icon: CreditCard },
              { label: "Transferências para humano", value: ai.transfers, icon: Users },
              { label: "Follow-ups enviados", value: ai.followups, icon: Send },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted">
                  <row.icon size={15} />
                  {row.label}
                </dt>
                <dd className="font-bold tabular-nums text-ink-900">{formatNumber(row.value)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
            {ai.inCadence > 0
              ? `${formatNumber(ai.inCadence)} conversa(s) com follow-up agendado.`
              : "Nenhum follow-up agendado."}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Semana ──────────────────────────────────────── */}
        <section className="card lg:col-span-2">
          <h2 className="mb-1 text-base">Últimos 7 dias</h2>
          <p className="mb-4 text-xs text-muted">
            Mensagens recebidas (barra cheia) e respostas da IA (barra clara).
          </p>
          <div className="flex h-40 items-end gap-2">
            {week.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div
                    title={`${d.inbound} recebidas`}
                    className="w-1/2 rounded-t bg-sky-500"
                    style={{ height: `${Math.round((d.inbound / maxDia) * 100)}%` }}
                  />
                  <div
                    title={`${d.ai} respostas da IA`}
                    className="w-1/2 rounded-t bg-brand-500/60"
                    style={{ height: `${Math.round((d.ai / maxDia) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Mês e base ──────────────────────────────────── */}
        <section className="card">
          <h2 className="mb-3 text-base">No mês</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted">
                <TrendingUp size={15} /> Assinaturas fechadas
              </span>
              <span className="font-bold tabular-nums text-ink-900">{formatNumber(month.won)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted">
                <CreditCard size={15} /> Pagamentos aprovados
              </span>
              <span className="font-bold tabular-nums text-ink-900">
                {formatNumber(month.approved)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Receita aprovada</span>
              <span className="font-bold tabular-nums text-emerald-600">{money(month.revenue)}</span>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Empresas prontas para disparo</span>
              <span className="font-bold tabular-nums text-ink-900">
                {formatNumber(base.targetsReady)}
              </span>
            </div>
            <Link
              href="/dashboard/admin/whatsapp/campanhas/nova"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
            >
              Montar campanha <ArrowRight size={13} />
            </Link>
          </div>
        </section>
      </div>

      {/* ── Precisa de gente ───────────────────────────────── */}
      {attention.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-base">Esperando atendimento</h2>
          <ul className="divide-y divide-line">
            {attention.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/admin/whatsapp/central?c=${c.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-canvas"
                >
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      STAGE_BY_ID[c.stage as Stage]?.chip ?? "bg-ink-100 text-ink-800",
                    )}
                  >
                    {STAGE_BY_ID[c.stage as Stage]?.label ?? c.stage}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {c.name ?? c.phone}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {c.reason ? `${TRANSFER_REASON_LABEL[c.reason] ?? c.reason} · ` : ""}
                      {c.preview ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(c.waitingSince)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
