"use client";

// Campanhas: a lista do que foi disparado, está disparando ou espera a hora.
// A criação mora no assistente (/campanhas/nova) — aqui é acompanhamento.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Ban, Loader2, Megaphone, Pause, Play, Plus } from "lucide-react";
import {
  CAMPAIGN_STATUS_CLS,
  CAMPAIGN_STATUS_LABEL,
  campaignProgress,
} from "@wa/lib/campaign-status";
import { describeWindow } from "@wa/lib/send-window";
import { dateTime, formatNumber, percent } from "@wa/lib/stages";
import { useFeedback } from "@/components/ui/Feedback";

type Campaign = {
  id: string;
  name: string;
  templateName: string;
  status: string;
  source: string;
  filters: { cnae?: string; uf?: string; city?: string } | null;
  scheduledAt: string | null;
  sendStart: string;
  sendEnd: string;
  sendDays: number[];
  timezone: string;
  dailyLimit: number;
  followupTemplates: string[];
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  skipped: number;
  createdAt: string;
};

const SOURCE_LABEL: Record<string, string> = {
  cnpja: "CNPJá",
  csv: "CSV",
  targets: "base",
  pessoa: "por pessoa",
  manual: "manual",
};

const POLL_MS = 8000;

export function Campaigns() {
  const { confirm: confirmar, feedback } = useFeedback();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/campaigns");
      if (!res.ok) return;
      const body = await res.json();
      setCampaigns(body.campaigns ?? []);
    } catch {
      /* próximo poll resolve */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function acao(c: Campaign, action: "iniciar" | "pausar" | "retomar" | "cancelar") {
    if (action === "cancelar" && !(await confirmar({ title: `Cancelar "${c.name}"?`, description: "As mensagens que ainda não saíram não serão mais enviadas.", confirmLabel: "Cancelar campanha", cancelLabel: "Voltar", danger: true }))) {
      return;
    }
    setAgindo(c.id);
    setErro(null);
    try {
      const res = await fetch(`/api/wa/campaigns/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body.error ?? "Falha ao atualizar a campanha");
      }
      await load();
    } finally {
      setAgindo(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">Disparo</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">Campanhas</h1>
          <p className="mt-1 text-sm text-muted">
            Cada campanha respeita a janela de trabalho e o limite diário — é o que mantém a nota de
            qualidade do número.
          </p>
        </div>
        <Link href="/dashboard/admin/whatsapp/campanhas/nova" className="btn-primary">
          <Plus size={16} /> Nova campanha
        </Link>
      </div>

      {erro && (
        <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">
          {erro}
        </p>
      )}

      {campaigns === null ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Carregando…
        </p>
      ) : campaigns.length === 0 ? (
        <div className="card text-center">
          <Megaphone className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted">
            Nenhuma campanha ainda. Comece buscando empresas no CNPJá, usando a base já enriquecida
            ou importando um CSV.
          </p>
          <Link href="/dashboard/admin/whatsapp/campanhas/nova" className="btn-primary mt-3 inline-flex">
            <Plus size={15} /> Criar a primeira
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => {
            const progresso = campaignProgress(c);
            return (
              <div key={c.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/dashboard/admin/whatsapp/campanhas/${c.id}`} className="font-bold hover:text-brand-700">
                      {c.name}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {c.templateName} · {SOURCE_LABEL[c.source] ?? c.source}
                      {c.filters?.cnae ? ` · CNAE ${c.filters.cnae}` : ""}
                      {c.filters?.uf ? ` · ${c.filters.uf}` : ""}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      CAMPAIGN_STATUS_CLS[c.status] ?? "bg-ink-100 text-ink-800",
                    )}
                  >
                    {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>

                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width]"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                  <p className="mt-1 flex justify-between text-[11px] text-muted">
                    <span>
                      {formatNumber(c.sent)} de {formatNumber(c.total)} enviadas
                    </span>
                    <span>{progresso}%</span>
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <Metric label="Entregues" value={formatNumber(c.delivered)} />
                  <Metric label="Lidas" value={formatNumber(c.read)} />
                  <Metric
                    label="Responderam"
                    value={`${formatNumber(c.replied)} · ${percent(c.replied, c.sent)}`}
                  />
                </div>

                <p className="text-[11px] text-muted">
                  {describeWindow({
                    send_start: c.sendStart,
                    send_end: c.sendEnd,
                    send_days: c.sendDays,
                    timezone: c.timezone,
                  })}
                  {c.dailyLimit > 0 ? ` · máx. ${formatNumber(c.dailyLimit)}/dia` : ""}
                  {c.followupTemplates.length > 0
                    ? ` · ${c.followupTemplates.length} follow-up(s)`
                    : ""}
                  {c.scheduledAt ? ` · começa ${dateTime(c.scheduledAt)}` : ""}
                </p>

                {c.failed > 0 && (
                  <Link
                    href={`/dashboard/admin/whatsapp/campanhas/${c.id}?status=failed`}
                    className="block text-xs font-semibold text-red-600 hover:underline"
                  >
                    {formatNumber(c.failed)} falha(s) de envio — ver o motivo
                  </Link>
                )}

                <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                  {c.status === "draft" && (
                    <button
                      className="btn-dark px-3 py-1.5 text-xs"
                      disabled={agindo === c.id}
                      onClick={() => acao(c, "iniciar")}
                    >
                      <Play size={13} /> Iniciar
                    </button>
                  )}
                  {(c.status === "running" || c.status === "scheduled") && (
                    <button
                      className="btn-ghost px-3 py-1.5 text-xs"
                      disabled={agindo === c.id}
                      onClick={() => acao(c, "pausar")}
                    >
                      <Pause size={13} /> Pausar
                    </button>
                  )}
                  {c.status === "paused" && (
                    <button
                      className="btn-dark px-3 py-1.5 text-xs"
                      disabled={agindo === c.id}
                      onClick={() => acao(c, "retomar")}
                    >
                      <Play size={13} /> Retomar
                    </button>
                  )}
                  {!["completed", "cancelled"].includes(c.status) && (
                    <button
                      className="btn-ghost px-3 py-1.5 text-xs text-red-600"
                      disabled={agindo === c.id}
                      onClick={() => acao(c, "cancelar")}
                    >
                      <Ban size={13} /> Cancelar
                    </button>
                  )}
                  <Link
                    href={`/dashboard/admin/whatsapp/campanhas/${c.id}`}
                    className="ml-auto self-center text-xs text-muted hover:text-ink-900"
                  >
                    detalhes →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="zk-ui">{feedback}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-canvas py-2">
      <p className="text-sm font-bold text-ink-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
