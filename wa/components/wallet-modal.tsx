"use client";

// Carteira Procob: o extrato das consultas pagas e a evolução do saldo.
//
// A Procob não tem extrato por API. O que ela dá é o campo `saldo` no
// envelope de toda resposta — e cada consulta paga guarda o seu. Então o
// extrato aqui é reconstruído: cada linha é uma consulta com o saldo que
// sobrou depois dela, e a diferença para a linha anterior é o custo.
//
// Por isso a curva é um DEGRAU, não uma reta interpolada: entre duas
// consultas o saldo não "desce devagar", ele fica parado até a próxima
// debitar. Desenhar rampa contaria uma história que não aconteceu.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  Loader2,
  RefreshCw,
  TrendingUp,
  User,
  Wallet,
  X,
} from "lucide-react";
import { formatCnpj, formatCpf } from "@wa/lib/documento";
import { dateTime, formatNumber, timeAgo } from "@wa/lib/stages";

export type Balance = {
  saldo: string | null;
  amount: number | null;
  code: string | null;
  kind: string | null;
  message: string | null;
  /** O número é o último conhecido — a leitura de agora falhou. */
  stale: boolean;
  sandbox: boolean;
  checkedAt: string | null;
};

type Entry = {
  id: string;
  product: "L0006" | "L0001";
  productLabel: string;
  document: string;
  name: string | null;
  code: string;
  found: boolean;
  sandbox: boolean;
  saldo: string | null;
  amount: number | null;
  /** Quanto esta consulta debitou (saldo anterior − saldo depois). */
  cost: number | null;
  /** Saldo subiu desde a consulta anterior: entrou recarga no meio. */
  credit: number | null;
  at: string;
  requestedBy: string | null;
};

type Point = { at: string; amount: number; cost: number | null };

type Stats = {
  total: number;
  last30: number;
  last7: number;
  cnpj: number;
  cpf: number;
  spent30: number | null;
  avgCost: number | null;
  truncated: boolean;
};

type Extrato = { balance: Balance | null; entries: Entry[]; series: Point[]; stats: Stats };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** Crédito mínimo de recarga da Procob — vira a linha de referência do gráfico. */
const LOW_BALANCE = 50;

function money(n: number | null | undefined): string {
  return n == null ? "—" : BRL.format(n);
}

/** Teto do eixo arredondado para cima em passo redondo — "R$ 35" lê melhor
 *  que "R$ 31,37", e o passo é fino o bastante para a curva não achatar. */
function niceTop(value: number): number {
  const step = Math.pow(10, Math.floor(Math.log10(value))) / 2;
  return Math.ceil(value / step) * step;
}

// ── Evolução do saldo ────────────────────────────────────────
//
// Série única: sem legenda (o título já diz o que é), sem número em cada
// ponto — só o último rotulado, e o resto no hover. O eixo Y começa no zero
// porque o assunto é "quanto falta", não a variação.

function BalanceChart({ series }: { series: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (series.length === 0) return null;
    const now = Date.now();
    const t0 = new Date(series[0].at).getTime();
    // A curva vai até agora: o último saldo continua valendo até esta hora.
    const t1 = Math.max(now, new Date(series[series.length - 1].at).getTime());
    const span = Math.max(t1 - t0, 1);
    const max = Math.max(...series.map((p) => p.amount), LOW_BALANCE / 5, 1);
    const top = niceTop(max * 1.1);
    const x = (at: string) => ((new Date(at).getTime() - t0) / span) * 100;
    const y = (v: number) => 100 - (v / top) * 100;
    const pts = series.map((p) => ({ ...p, cx: x(p.at), cy: y(p.amount) }));

    // Degrau: o saldo de uma consulta vale até a próxima debitar.
    let line = `M ${pts[0].cx.toFixed(2)} ${pts[0].cy.toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      line += ` L ${pts[i].cx.toFixed(2)} ${pts[i - 1].cy.toFixed(2)} L ${pts[i].cx.toFixed(2)} ${pts[i].cy.toFixed(2)}`;
    }
    line += ` L 100 ${pts[pts.length - 1].cy.toFixed(2)}`;
    const area = `${line} L 100 100 L ${pts[0].cx.toFixed(2)} 100 Z`;

    return { pts, line, area, top, threshold: LOW_BALANCE < top ? y(LOW_BALANCE) : null };
  }, [series]);

  if (!geo || series.length < 2) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
        A curva aparece a partir da segunda consulta paga — é a diferença entre duas leituras de saldo que mostra o
        gasto.
      </p>
    );
  }

  const { pts, line, area, top, threshold } = geo;
  const active = hover != null ? pts[hover] : null;
  const last = pts[pts.length - 1];

  function pick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = ((e.clientX - rect.left) / rect.width) * 100;
    let best = 0;
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i].cx - frac) < Math.abs(pts[best].cx - frac)) best = i;
    }
    setHover(best);
  }

  return (
    <div>
      <div
        className="relative h-40 w-full cursor-crosshair"
        onMouseMove={pick}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {/* grade recessiva: topo, meio, base */}
          {[0, 50, 100].map((gy) => (
            <line
              key={gy}
              x1="0"
              x2="100"
              y1={gy}
              y2={gy}
              className="stroke-line"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {threshold != null && (
            <line
              x1="0"
              x2="100"
              y1={threshold}
              y2={threshold}
              stroke="#f59e0b"
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              opacity={0.7}
            />
          )}
          <path d={area} fill="var(--color-brand-700)" opacity={0.12} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-brand-700)"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {active && (
            <line
              x1={active.cx}
              x2={active.cx}
              y1="0"
              y2="100"
              className="stroke-ink-300"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Marcadores fora do SVG: o viewBox é esticado e deformaria o círculo. */}
        {pts.map((p, i) => (
          <span
            key={`${p.at}-${i}`}
            className={clsx(
              "pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper transition",
              hover === i ? "scale-150 bg-brand-700" : "bg-brand-700/70",
            )}
            style={{ left: `${p.cx}%`, top: `${p.cy}%` }}
          />
        ))}

        {/* Escala: topo e base do eixo, discretos, dentro do gráfico. */}
        <span className="pointer-events-none absolute left-0 top-0 text-[10px] font-semibold text-muted">
          {money(Number(top.toFixed(2)))}
        </span>
        <span className="pointer-events-none absolute bottom-0 left-0 text-[10px] font-semibold text-muted">R$ 0</span>
        {threshold != null && (
          <span
            className="pointer-events-none absolute right-0 mt-0.5 text-[10px] font-semibold text-amber-600"
            style={{ top: `${threshold}%` }}
          >
            recarga mínima {money(LOW_BALANCE)}
          </span>
        )}

        {/* Rótulo direto do último valor — o número que importa. */}
        {!active && (
          <span
            className="pointer-events-none absolute right-0 -translate-y-1/2 rounded-full bg-paper/90 px-1.5 text-[11px] font-bold text-ink-900"
            style={{ top: `${last.cy}%` }}
          >
            {money(last.amount)}
          </span>
        )}

        {active && (
          <div
            className={clsx(
              "pointer-events-none absolute top-1 z-10 w-40 rounded-xl border border-line bg-paper p-2 text-[11px] shadow-lg",
              active.cx > 55 ? "-translate-x-full" : "",
            )}
            style={{ left: `${active.cx}%` }}
          >
            <p className="font-bold text-ink-900">{money(active.amount)}</p>
            <p className="text-muted">{dateTime(active.at)}</p>
            {active.cost != null && <p className="text-muted">consulta: −{money(active.cost)}</p>}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-muted">
        <span>{dateTime(series[0].at)}</span>
        <span>agora</span>
      </div>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────

function Tile({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-2xl border border-line px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="text-[11px] leading-tight text-muted">{hint}</p>}
    </div>
  );
}

export function WalletModal({
  balance,
  refreshing,
  onRefresh,
  onClose,
}: {
  balance: Balance;
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<Extrato | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wa/procob/extrato");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Não foi possível carregar o extrato");
      setData(body as Extrato);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o extrato");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // O saldo do header é a fonte da verdade — o extrato só complementa.
  const shown = balance.amount != null ? balance : (data?.balance ?? balance);
  const label = shown.amount != null ? BRL.format(shown.amount) : (shown.saldo ?? "saldo?");
  const empty = shown.amount != null && shown.amount <= 0;
  const low = shown.amount != null && shown.amount > 0 && shown.amount < LOW_BALANCE;
  const stats = data?.stats;

  async function refreshAll() {
    onRefresh();
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full min-w-0 max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        {/* ── Cabeçalho: saldo agora ─────────────────────────── */}
        <div className="flex items-start gap-3 border-b border-line p-5">
          <span
            className={clsx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              empty ? "bg-red-100 text-red-600" : low ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700",
            )}
          >
            <Wallet size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="brand-kicker">Carteira Procob</p>
            <p className="flex items-baseline gap-2 text-2xl font-bold tabular-nums text-ink-900">
              {label}
              {shown.sandbox && (
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
                  sandbox
                </span>
              )}
            </p>
            <p className="text-xs text-muted">
              {shown.stale
                ? `último valor conhecido${shown.checkedAt ? ` · ${timeAgo(shown.checkedAt)}` : ""}`
                : shown.checkedAt
                  ? `lido ${timeAgo(shown.checkedAt)}`
                  : "sem leitura"}
              {shown.message ? ` · ${shown.message}` : ""}
            </p>
          </div>
          <button
            onClick={refreshAll}
            disabled={refreshing || loading}
            title="Pergunta o saldo à Procob. Não gasta consulta (usa 1 requisição do proxy de IP fixo)."
            className="btn-ghost px-3 py-2 text-xs"
          >
            <RefreshCw size={14} className={clsx(refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-2 text-muted hover:bg-canvas">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {(empty || low) && (
            <p
              className={clsx(
                "mb-4 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-xs",
                empty ? "border-red-200 bg-red-50 text-red-600" : "border-amber-200 bg-amber-50 text-amber-700",
              )}
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                {empty
                  ? "Sem crédito: as próximas consultas vão falhar."
                  : "Saldo baixo para o ritmo de consultas."}{" "}
                A Procob não tem recarga por API — é pelo painel dela ou com o comercial, mínimo {money(LOW_BALANCE)}.
              </span>
            </p>
          )}

          {loading && !data ? (
            <p className="flex items-center gap-2 py-10 text-sm text-muted">
              <Loader2 size={15} className="animate-spin" /> Carregando extrato…
            </p>
          ) : error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          ) : !data ? null : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Tile
                  label="Consultas 30 d"
                  value={formatNumber(stats?.last30 ?? 0)}
                  hint={`${formatNumber(stats?.last7 ?? 0)} nos últimos 7 dias`}
                />
                <Tile
                  label="Gasto 30 d"
                  value={money(stats?.spent30 ?? null)}
                  hint={stats?.spent30 == null ? "sem saldo para comparar" : "diferença entre saldos"}
                />
                <Tile
                  label="Custo médio"
                  value={money(stats?.avgCost ?? null)}
                  hint="por consulta paga"
                />
                <Tile
                  label="Total consultado"
                  value={formatNumber(stats?.total ?? 0)}
                  hint={`${formatNumber(stats?.cnpj ?? 0)} CNPJ · ${formatNumber(stats?.cpf ?? 0)} CPF`}
                />
              </div>

              {/* ── Evolução do saldo ──────────────────────────── */}
              <section className="mt-5">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                  <TrendingUp size={15} className="text-brand-700" /> Evolução do saldo
                </h3>
                <p className="mb-3 text-xs text-muted">
                  O saldo que a Procob informou depois de cada consulta paga. Ele só se mexe quando alguém consulta —
                  ou quando entra recarga.
                </p>
                <BalanceChart series={data.series} />
              </section>

              {/* ── Extrato ────────────────────────────────────── */}
              <section className="mt-6">
                <h3 className="text-sm font-bold text-ink-900">Consultas realizadas</h3>
                <p className="mb-3 text-xs text-muted">
                  Cada linha é uma consulta paga, com o saldo que sobrou depois dela. Repetir o mesmo documento sai do
                  cache e não aparece aqui — porque não custa.
                </p>

                {data.entries.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
                    Nenhuma consulta paga ainda.
                  </p>
                ) : (
                  // A tabela tem largura mínima própria: no celular ela rola
                  // dentro da caixa em vez de esticar o modal.
                  <div className="overflow-x-auto rounded-2xl border border-line">
                    <table className="w-full min-w-[32rem] text-left text-xs">
                      <thead className="bg-canvas text-[10px] uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-3 py-2 font-bold">Quando</th>
                          <th className="px-3 py-2 font-bold">Consulta</th>
                          <th className="px-3 py-2 text-right font-bold">Custo</th>
                          <th className="px-3 py-2 text-right font-bold">Saldo depois</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.entries.map((e) => {
                          const doc = e.document.length === 14 ? formatCnpj(e.document) : formatCpf(e.document);
                          const Icon = e.product === "L0006" ? Building2 : User;
                          return (
                            <tr key={e.id} className="border-t border-line align-top hover:bg-canvas/60">
                              <td className="whitespace-nowrap px-3 py-2 text-muted">
                                {dateTime(e.at)}
                                {e.requestedBy && (
                                  <span className="block truncate text-[10px]">{e.requestedBy}</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Link
                                  href={`/dashboard/admin/whatsapp/contatos/pesquisas?tipo=${e.product === "L0006" ? "cnpj" : "cpf"}&doc=${e.document}`}
                                  onClick={onClose}
                                  className="flex items-start gap-1.5 font-semibold text-ink-900 hover:text-brand-700"
                                >
                                  <Icon size={13} className="mt-0.5 shrink-0 text-muted" />
                                  <span className="min-w-0">
                                    <span className="block truncate">{e.name ?? doc}</span>
                                    <span className="block text-[10px] font-medium text-muted">
                                      {e.productLabel} · {doc}
                                      {!e.found && " · sem registro"}
                                      {e.sandbox && " · sandbox"}
                                    </span>
                                  </span>
                                </Link>
                                {e.credit != null && (
                                  <span className="mt-1 inline-block rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                    +{money(e.credit)} de recarga antes desta consulta
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-ink-900">
                                {e.cost != null ? `−${money(e.cost)}` : "—"}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted">
                                {e.amount != null ? money(e.amount) : (e.saldo ?? "—")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {stats?.truncated && (
                  <p className="mt-2 text-[11px] text-muted">
                    Mostrando as {formatNumber(data.entries.length)} consultas mais recentes de{" "}
                    {formatNumber(stats.total)}.
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[11px] leading-tight text-muted">
            Custo por consulta é calculado pela diferença entre saldos — a Procob não devolve o preço na resposta.
          </p>
          <Link
            href="/dashboard/admin/whatsapp/contatos/pesquisas"
            onClick={onClose}
            className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
          >
            Ver pesquisas <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
