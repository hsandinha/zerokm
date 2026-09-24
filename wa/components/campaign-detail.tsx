"use client";

// Detalhe de uma campanha: progresso, funil, configuração e a lista de
// destinatários com o motivo de cada falha traduzido — código cru da Meta
// ("130472") não diz a ninguém se o problema é o número, o template ou nada
// disso.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, Ban, Loader2, MessageCircle, Pause, Play, RefreshCw } from "lucide-react";
import {
  CAMPAIGN_STATUS_CLS,
  CAMPAIGN_STATUS_LABEL,
  campaignProgress,
  estimateCostUsd,
} from "@wa/lib/campaign-status";
import { PARAM_LABEL, type ParamMapItem, type ParamType } from "@wa/lib/campaign-params";
import { REENVIO_LABEL, metaErrorInfo } from "@wa/lib/meta-errors";
import { formatPhoneBr } from "@wa/lib/phone";
import { dateTime, formatNumber, percent } from "@wa/lib/stages";

type Campaign = {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  templateBody: string | null;
  templateCategory: string | null;
  status: string;
  source: string;
  scheduledAt: string | null;
  sendStart: string;
  sendEnd: string;
  sendDays: number[];
  timezone: string;
  windowLabel: string;
  windowOpenNow: boolean;
  dailyLimit: number;
  sentToday: number;
  throttleSeconds: number;
  followupTemplates: string[];
  followupDelaysHours: number[];
  paramsMap: ParamMapItem[];
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  skipped: number;
  createdAt: string;
  createdBy: string | null;
};

type Recipient = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  attempt: number;
  sentAt: string | null;
  error: string | null;
  conversationId: string | null;
};

type Payload = {
  campaign: Campaign;
  counts: Record<string, number>;
  recipients: Recipient[];
  exibidos: number;
  totalNoFiltro: number;
};

const STATUS_DEST: Record<string, { label: string; cls: string }> = {
  pending: { label: "Na fila", cls: "bg-ink-100 text-ink-800" },
  sent: { label: "Enviada", cls: "bg-sky-100 text-sky-700" },
  delivered: { label: "Entregue", cls: "bg-brand-100 text-brand-700" },
  read: { label: "Lida", cls: "bg-violet-100 text-violet-700" },
  replied: { label: "Respondeu", cls: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Falhou", cls: "bg-red-100 text-red-600" },
  skipped: { label: "Pulado", cls: "bg-amber-100 text-amber-700" },
};

const FILTROS = ["todos", "pending", "sent", "delivered", "read", "replied", "failed", "skipped"];

/** Código cru da Meta vira explicação de quem opera. */
function ErroMeta({ erro }: { erro: string }) {
  const info = metaErrorInfo(erro);
  if (!info) return <span className="text-xs">{erro}</span>;
  return (
    <span className="block">
      <span className="block text-xs font-semibold">{info.titulo}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted">{info.explicacao}</span>
      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-ink-300">
        {REENVIO_LABEL[info.reenviar]}
      </span>
    </span>
  );
}

export function CampaignDetail({ id, statusInicial }: { id: string; statusInicial?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [filtro, setFiltro] = useState(statusInicial ?? "todos");
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/wa/campaigns/${id}?status=${filtro}`);
    const body = await res.json();
    if (!res.ok) {
      setErro(body.error ?? "Falha ao carregar");
      return;
    }
    setData(body);
    setErro(null);
  }, [id, filtro]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function acao(action: "iniciar" | "pausar" | "retomar" | "cancelar") {
    if (action === "cancelar" && !confirm("Cancelar a campanha? O que não saiu não sai mais.")) {
      return;
    }
    setAgindo(true);
    try {
      const res = await fetch(`/api/wa/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body.error ?? "Falha ao atualizar");
      }
      await load();
    } finally {
      setAgindo(false);
    }
  }

  if (erro && !data) {
    return (
      <div className="space-y-3">
        <Link href="/dashboard/admin/whatsapp/campanhas" className="inline-flex items-center gap-1 text-sm text-muted">
          <ArrowLeft size={15} /> Campanhas
        </Link>
        <p className="card text-sm text-red-600">{erro}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Carregando…
      </p>
    );
  }

  const c = data.campaign;
  const progresso = campaignProgress(c);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/dashboard/admin/whatsapp/campanhas"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink-900"
          >
            <ArrowLeft size={14} /> Campanhas
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold">
            {c.name}
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                CAMPAIGN_STATUS_CLS[c.status] ?? "bg-ink-100 text-ink-800",
              )}
            >
              {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
            </span>
          </h1>
          <p className="text-sm text-muted">
            Template <b>{c.templateName}</b> ({c.templateLanguage}) · criada {dateTime(c.createdAt)}
            {c.createdBy ? ` por ${c.createdBy}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={load}>
            <RefreshCw size={13} /> Atualizar
          </button>
          {c.status === "draft" && (
            <button
              className="btn-dark px-3 py-1.5 text-xs"
              disabled={agindo}
              onClick={() => acao("iniciar")}
            >
              <Play size={13} /> Iniciar
            </button>
          )}
          {(c.status === "running" || c.status === "scheduled") && (
            <button
              className="btn-ghost px-3 py-1.5 text-xs"
              disabled={agindo}
              onClick={() => acao("pausar")}
            >
              <Pause size={13} /> Pausar
            </button>
          )}
          {c.status === "paused" && (
            <button
              className="btn-dark px-3 py-1.5 text-xs"
              disabled={agindo}
              onClick={() => acao("retomar")}
            >
              <Play size={13} /> Retomar
            </button>
          )}
          {!["completed", "cancelled"].includes(c.status) && (
            <button
              className="btn-ghost px-3 py-1.5 text-xs text-red-600"
              disabled={agindo}
              onClick={() => acao("cancelar")}
            >
              <Ban size={13} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {erro && (
        <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">
          {erro}
        </p>
      )}

      {/* Progresso */}
      <div className="card space-y-3">
        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width]"
            style={{ width: `${progresso}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-7">
          <Metric label="Total" value={formatNumber(c.total)} />
          <Metric label="Enviadas" value={formatNumber(c.sent)} />
          <Metric label="Entregues" value={formatNumber(c.delivered)} />
          <Metric label="Lidas" value={formatNumber(c.read)} />
          <Metric
            label="Responderam"
            value={`${formatNumber(c.replied)} · ${percent(c.replied, c.sent)}`}
            destaque
          />
          <Metric label="Falhas" value={formatNumber(c.failed)} />
          <Metric label="Pulados" value={formatNumber(c.skipped)} />
        </div>
      </div>

      {/* Configuração */}
      <div className="card grid gap-3 text-sm sm:grid-cols-2">
        <Linha
          label="Janela de trabalho"
          value={`${c.windowLabel} · ${c.windowOpenNow ? "aberta agora" : "fechada agora"}`}
        />
        <Linha
          label="Ritmo"
          value={`1 a cada ${c.throttleSeconds}s${
            c.dailyLimit > 0
              ? ` · ${formatNumber(c.sentToday)}/${formatNumber(c.dailyLimit)} hoje`
              : " · sem limite diário"
          }`}
        />
        <Linha
          label="Início"
          value={c.scheduledAt ? dateTime(c.scheduledAt) : "assim que iniciada"}
        />
        <Linha
          label="Custo estimado na Meta"
          value={`US$ ${estimateCostUsd(c.total, c.templateCategory).toFixed(2)} (${
            c.templateCategory ?? "MARKETING"
          })`}
        />
        <Linha
          label="Cadência"
          value={
            c.followupTemplates.length > 0
              ? c.followupTemplates
                  .map((t, i) => `${i + 2}º toque: ${t} em ${c.followupDelaysHours[i] ?? 48}h`)
                  .join(" · ")
              : "sem follow-up"
          }
        />
        <Linha
          label="Variáveis"
          value={
            c.paramsMap.length > 0
              ? c.paramsMap
                  .map((p, i) => `{{${i + 1}}} ${PARAM_LABEL[p.type as ParamType] ?? p.type}`)
                  .join(" · ")
              : "template sem variáveis"
          }
        />
      </div>

      {c.templateBody && (
        <div className="card">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Mensagem enviada
          </p>
          <p className="whitespace-pre-wrap text-sm">{c.templateBody}</p>
        </div>
      )}

      {/* Destinatários */}
      <div className="card p-0">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line p-2">
          {FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={clsx(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                filtro === f ? "pill-active" : "border border-line text-muted",
              )}
            >
              {f === "todos" ? "Todos" : (STATUS_DEST[f]?.label ?? f)}
              <span className="ml-1 opacity-70">
                {f === "todos" ? formatNumber(c.total) : formatNumber(data.counts[f] ?? 0)}
              </span>
            </button>
          ))}
        </div>

        <ul className="divide-y divide-line">
          {data.recipients.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted">
              Nenhum destinatário com esse filtro.
            </li>
          )}
          {data.recipients.map((r) => {
            const st = STATUS_DEST[r.status] ?? { label: r.status, cls: "bg-ink-100 text-ink-800" };
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {r.name || formatPhoneBr(r.phone)}
                    </span>
                    {r.attempt > 1 && (
                      <span
                        className="rounded-full bg-ink-100 px-1.5 text-[10px] text-ink-800"
                        title="Outro número da mesma pessoa"
                      >
                        {r.attempt}º número
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted">
                    {r.name ? `${formatPhoneBr(r.phone)} · ` : ""}
                    {r.sentAt ? dateTime(r.sentAt) : "ainda na fila"}
                  </span>
                  {r.error && (
                    <span className="mt-1 block rounded-lg bg-red-50 px-2 py-1 text-red-600">
                      <ErroMeta erro={r.error} />
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.conversationId && (
                    <Link
                      href={`/dashboard/admin/whatsapp/central?c=${r.conversationId}`}
                      className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink-900"
                      title="Abrir conversa"
                    >
                      <MessageCircle size={14} />
                    </Link>
                  )}
                  <span
                    className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}
                  >
                    {st.label}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {data.totalNoFiltro > data.exibidos && (
          <p className="border-t border-line px-4 py-2 text-center text-[11px] text-muted">
            mostrando {formatNumber(data.exibidos)} de {formatNumber(data.totalNoFiltro)}
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  destaque,
}: {
  label: string;
  value: string;
  destaque?: boolean;
}) {
  return (
    <div className={clsx("rounded-xl py-2", destaque ? "bg-brand-50" : "bg-canvas")}>
      <p className={clsx("text-sm font-bold", destaque ? "text-brand-700" : "text-ink-900")}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
