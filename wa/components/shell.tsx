"use client";

// Casca do painel. No desktop, barra lateral recolhida (só ícones) que
// expande ao passar o mouse — por cima do conteúdo, sem empurrar a página —
// e uma barra superior com busca; no celular, barra flutuante embaixo, porque
// o polegar não alcança o topo e a Central é usada em pé, no meio do
// atendimento.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Bot,
  Inbox,
  Kanban,
  LayoutDashboard,
  LayoutTemplate,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Search,
  Settings2,
  Sparkles,
  Upload,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { signOut as nextAuthSignOut } from "next-auth/react";
import { ThemeToggle } from "@wa/components/theme-toggle";
import { timeAgo } from "@wa/lib/stages";
import { BrandMark } from "@wa/components/brand-mark";
import { WalletModal, type Balance } from "@wa/components/wallet-modal";

type PanelUser = { email: string; name: string | null; role: "admin" | "operador" };

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Esconde a aba; quem realmente barra é a rota de API. */
  adminOnly?: boolean;
  /** Aparece na barra do celular; o resto vai para o "Mais". */
  primary?: boolean;
  badge?: "waiting";
};

const GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Operação",
    items: [
      { href: "/dashboard/admin/whatsapp/visao-geral", label: "Visão geral", icon: LayoutDashboard, primary: true },
      { href: "/dashboard/admin/whatsapp/central", label: "Central", icon: Inbox, primary: true, badge: "waiting" },
      { href: "/dashboard/admin/whatsapp/pipeline", label: "Pipeline", icon: Kanban, primary: true },
      { href: "/dashboard/admin/whatsapp/contatos", label: "Contatos", icon: Users, primary: true },
    ],
  },
  {
    title: "Base",
    items: [
      { href: "/dashboard/admin/whatsapp/contatos/enriquecer", label: "Enriquecer", icon: Sparkles, adminOnly: true },
      { href: "/dashboard/admin/whatsapp/contatos/pesquisas", label: "Pesquisas", icon: Search },
      { href: "/dashboard/admin/whatsapp/importacao", label: "Importação", icon: Upload, adminOnly: true },
    ],
  },
  {
    title: "Disparo",
    items: [
      { href: "/dashboard/admin/whatsapp/campanhas", label: "Campanhas", icon: Megaphone, adminOnly: true },
      { href: "/dashboard/admin/whatsapp/templates", label: "Templates", icon: LayoutTemplate, adminOnly: true },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/dashboard/admin/whatsapp/usuarios", label: "Usuários", icon: UserCog, adminOnly: true },
      { href: "/dashboard/admin/whatsapp/configuracao", label: "IA & WABA", icon: Settings2, adminOnly: true },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
const STATUS_POLL_MS = 30_000;
// O saldo muda devagar (só consulta paga o move) e a leitura é guardada no
// banco — pesquisar de minuto em minuto seria só carga sem informação nova.
const BALANCE_POLL_MS = 5 * 60_000;
/** Abaixo disto o indicador fica âmbar: é o crédito mínimo de recarga. */
const LOW_BALANCE = 50;

type PanelStatus = {
  aiActive: boolean;
  displayPhone: string | null;
  counts: { waiting: number; sla: number; mine: number };
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Saldo da Procob no header. A Procob não tem recarga por API — recarga é
 * comercial (crédito mínimo R$ 50). O que dá para fazer é não ser pego de
 * surpresa: o número fica à vista, vira alerta antes de acabar e abre o
 * extrato (consultas pagas e evolução do saldo) no clique.
 */
function BalancePill({ balance, loading, onOpen }: { balance: Balance; loading: boolean; onOpen: () => void }) {
  const { amount, saldo, message, stale } = balance;
  const label = amount != null ? BRL.format(amount) : (saldo ?? "saldo?");
  const failed = amount == null && !saldo;
  const empty = amount != null && amount <= 0;
  const low = amount != null && amount > 0 && amount < LOW_BALANCE;

  const title = [
    failed ? "Não foi possível ler o saldo da Procob." : `Saldo da Procob: ${label}.`,
    // O número velho continua à vista; o tooltip é que conta que é velho.
    stale && !failed ? `Último valor conhecido${balance.checkedAt ? ` (${timeAgo(balance.checkedAt)})` : ""} — a leitura de agora falhou.` : null,
    !stale && balance.checkedAt ? `Lido ${timeAgo(balance.checkedAt)}.` : null,
    message,
    balance.sandbox ? "Conta sandbox — dados fictícios." : null,
    empty ? "Sem crédito: as consultas vão falhar." : null,
    low ? "Saldo baixo — recarga é pelo painel da Procob (mínimo R$ 50)." : null,
    "Clique para ver o extrato das consultas e a evolução do saldo.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      onClick={onOpen}
      title={title}
      aria-label={title}
      className={clsx(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition",
        loading && "opacity-60",
        empty || failed
          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : low
            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            : "border-line text-muted hover:bg-canvas hover:text-ink-900",
      )}
    >
      <Wallet size={14} className="shrink-0" />
      <span className="tabular-nums">{label}</span>
      {/* Número velho não vira alarme — só ganha um til. */}
      {stale && !failed && <span className="opacity-60">~</span>}
      {balance.sandbox && <span className="hidden text-[10px] font-bold uppercase opacity-70 sm:inline">sandbox</span>}
    </button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PanelUser | null>(null);
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [wallet, setWallet] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/wa/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/wa/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setStatus(d))
        .catch(() => {});
    load();
    const t = setInterval(load, STATUS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Saldo da Procob. Sem `refresh` a rota só lê o banco — o número vem de
  // carona nas consultas pagas. Perguntar à Procob (o clique) não debita
  // crédito, mas gasta 1 requisição do proxy de IP fixo, que é limitado.
  const loadBalance = useCallback(async (refresh = false) => {
    setBalanceLoading(true);
    try {
      const res = await fetch(`/api/wa/procob/saldo${refresh ? "?refresh=1" : ""}`);
      if (res.ok) setBalance((await res.json()).balance ?? null);
    } catch {
      /* header não quebra por causa do saldo */
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
    const t = setInterval(() => loadBalance(), BALANCE_POLL_MS);
    return () => clearInterval(t);
  }, [loadBalance]);

  // Trocar de tela fecha a gaveta e o extrato — senão ficam por cima da página.
  useEffect(() => {
    setSheet(false);
    setWallet(false);
  }, [pathname]);

  async function signOut() {
    await nextAuthSignOut({ callbackUrl: "/login" });
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/dashboard/admin/whatsapp/contatos?q=${encodeURIComponent(term)}`);
  }

  const isAdmin = user?.role === "admin";
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || isAdmin),
  })).filter((g) => g.items.length > 0);
  const visible = groups.flatMap((g) => g.items);
  const primary = visible.filter((t) => t.primary);
  const extra = visible.filter((t) => !t.primary);

  // A rota mais específica que casa com o caminho (ex.: /campanhas/nova).
  const current = ALL_ITEMS.filter((i) => (pathname ?? "").startsWith(i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];

  const waiting = status?.counts.waiting ?? 0;
  const sla = status?.counts.sla ?? 0;

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop: barra lateral ───────────────────────────── */}
      {/* O <aside> reserva 4rem no fluxo; o painel interno cresce para 15rem
          no hover e sobrepõe o conteúdo (z acima do header), então nada se
          move na página quando ele abre. */}
      <aside className="cnv-wa-navigation group relative z-40 hidden w-16 shrink-0 md:block">
        <div className="sticky top-0 flex h-screen w-16 flex-col overflow-hidden border-r border-line bg-paper transition-[width,box-shadow] duration-200 ease-out group-hover:w-60 group-hover:shadow-[8px_0_30px_rgba(11,18,21,0.35)]">
          <div className="flex h-16 shrink-0 items-center px-3">
            <Link href="/dashboard/admin/whatsapp/visao-geral" className="flex items-center gap-2 overflow-hidden" aria-label="Visão geral">
              <BrandMark className="h-10 w-10 shrink-0 text-ink-900" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover:max-w-[10rem] group-hover:opacity-100">
                <span className="brand-kicker">CNV</span>{" "}
                <span className="text-sm font-bold text-ink-900">WhatsApp</span>
              </span>
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
            {groups.map((g, gi) => (
              <div key={g.title} className={clsx(gi > 0 && "mt-1 group-hover:mt-5")}>
                {gi > 0 && <div className="mx-2 mb-1 border-t border-line group-hover:hidden" />}
                <p className="hidden truncate px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted group-hover:block">
                  {g.title}
                </p>
                <div className="space-y-0.5">
                  {g.items.map((item) => {
                    const active = current?.href === item.href;
                    const Icon = item.icon;
                    const badge = item.badge === "waiting" ? waiting : 0;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        className={clsx(
                          "relative flex h-10 items-center gap-2.5 rounded-2xl px-[0.6875rem] text-sm font-semibold transition",
                          active ? "pill-active" : "text-ink-700 hover:bg-canvas hover:text-ink-900",
                        )}
                      >
                        <Icon size={18} className="shrink-0" />
                        <span className="max-w-0 flex-1 truncate opacity-0 transition-[max-width,opacity] duration-200 group-hover:max-w-[12rem] group-hover:opacity-100">
                          {item.label}
                        </span>
                        {badge > 0 && (
                          <>
                            {/* Recolhida: só um ponto no canto do ícone. */}
                            <span
                              className={clsx(
                                "absolute left-6 top-1.5 h-2 w-2 rounded-full ring-2 ring-paper group-hover:hidden",
                                sla > 0 ? "bg-red-500" : "bg-amber-500",
                              )}
                            />
                            <span
                              className={clsx(
                                "hidden rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none group-hover:inline-block",
                                active
                                  ? "bg-white/20 text-inherit"
                                  : sla > 0
                                    ? "bg-red-100 text-red-600"
                                    : "bg-amber-100 text-amber-700",
                              )}
                            >
                              {badge}
                            </span>
                          </>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-line p-3">
            {/* O módulo mora dentro do painel da zerokm — sem esta saída ele
                vira um beco, e a única forma de voltar seria deslogar. */}
            <Link
              href="/dashboard/admin"
              title="Voltar ao painel da zerokm"
              className="mb-2 flex h-10 items-center gap-2.5 rounded-2xl px-[0.6875rem] text-sm font-semibold text-ink-700 transition hover:bg-canvas hover:text-ink-900"
            >
              <ChevronLeft size={18} className="shrink-0" />
              <span className="max-w-0 flex-1 truncate opacity-0 transition-[max-width,opacity] duration-200 group-hover:max-w-[12rem] group-hover:opacity-100">
                Painel zerokm
              </span>
            </Link>

            {/* Recolhida: ícone com a cor do estado. Expandida: o cartão. */}
            <Link
              href="/dashboard/admin/whatsapp/central"
              title={status ? (status.aiActive ? "IA respondendo" : "IA pausada") : "IA"}
              className="relative flex h-10 items-center justify-center rounded-2xl text-brand-700 hover:bg-canvas group-hover:hidden"
            >
              <Bot size={18} />
              <span
                className={clsx(
                  "absolute left-6 top-1.5 h-2 w-2 rounded-full ring-2 ring-paper",
                  !status ? "bg-ink-300" : status.aiActive ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
            </Link>
            <div className="hidden rounded-2xl border border-brand-300 bg-brand-50 p-3 group-hover:block">
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink-900">
                <Bot size={14} className="text-brand-700" />
                {status ? (status.aiActive ? "IA respondendo" : "IA pausada") : "IA"}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                {!status
                  ? "Carregando…"
                  : waiting === 0
                    ? "Nenhuma conversa esperando você."
                    : `${waiting} conversa${waiting === 1 ? "" : "s"} aguardando humano${
                        sla > 0 ? ` · ${sla} fora do SLA` : ""
                      }.`}
              </p>
              {status?.displayPhone && (
                <p className="mt-1 truncate text-[11px] text-muted">WhatsApp {status.displayPhone}</p>
              )}
              <Link
                href="/dashboard/admin/whatsapp/central"
                className="mt-2 inline-block text-[11px] font-semibold text-brand-700 hover:underline"
              >
                Abrir a Central →
              </Link>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Link href="/dashboard/admin/whatsapp/visao-geral" className="flex shrink-0 items-center gap-2 md:hidden">
              <BrandMark className="h-8 w-8 text-ink-900" />
              <span className="brand-kicker">CNV</span>
            </Link>
            {/* Mesmo caminho do topo das outras telas do painel: Administração › WhatsApp › tela. */}
            <nav aria-label="Você está em" className="hidden min-w-0 shrink-0 items-center gap-1.5 text-sm text-muted md:flex">
              <Link href="/dashboard/admin" className="whitespace-nowrap transition hover:text-ink-900">Administração</Link>
              <ChevronRight size={14} className="shrink-0 opacity-60" aria-hidden="true" />
              {current ? (
                <>
                  <Link href="/dashboard/admin/whatsapp/visao-geral" className="whitespace-nowrap transition hover:text-ink-900">WhatsApp</Link>
                  <ChevronRight size={14} className="shrink-0 opacity-60" aria-hidden="true" />
                  <span aria-current="page" className="truncate font-semibold text-ink-900">{current.label}</span>
                </>
              ) : (
                <span aria-current="page" className="font-semibold text-ink-900">WhatsApp</span>
              )}
            </nav>

            <form onSubmit={onSearch} className="ml-auto hidden w-full max-w-md sm:block">
              <label className="relative block">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  className="input py-2 pl-9"
                  placeholder="Buscar contato, empresa ou telefone…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-3 sm:ml-0">
              {balance && <BalancePill balance={balance} loading={balanceLoading} onOpen={() => setWallet(true)} />}
              {user && (
                <span className="hidden text-right text-xs leading-tight lg:block">
                  <span className="block font-semibold text-ink-900">{user.name ?? user.email}</span>
                  <span className="text-muted">
                    {user.role === "admin" ? "administrador" : "operador"}
                  </span>
                </span>
              )}
              <ThemeToggle />
              <button
                onClick={signOut}
                className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-muted transition hover:bg-canvas hover:text-ink-900 md:flex"
              >
                <LogOut size={15} />
                Sair
              </button>
            </div>
          </div>
        </header>

        <main className="has-tabbar mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6">
          {children}
        </main>
      </div>

      {/* ── Celular: barra flutuante ─────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around rounded-full border border-line bg-paper/95 px-2 py-2 shadow-[0_8px_30px_rgba(11,18,21,0.35)] backdrop-blur">
          {primary.map((tab) => {
            const active = current?.href === tab.href;
            const Icon = tab.icon;
            const badge = tab.badge === "waiting" ? waiting : 0;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-label={tab.label}
                className={clsx(
                  "relative flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 transition",
                  active ? "text-ink-900" : "text-ink-400",
                )}
              >
                <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
                {badge > 0 && (
                  <span className="absolute right-1 top-0.5 rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-4 text-white">
                    {badge}
                  </span>
                )}
                <span className={clsx("text-[10px]", active ? "font-bold" : "font-medium")}>
                  {tab.label === "Visão geral" ? "Visão" : tab.label}
                </span>
                <span
                  className={clsx(
                    "h-1 w-1 rounded-full transition",
                    active ? "bg-brand-500" : "bg-transparent",
                  )}
                />
              </Link>
            );
          })}

          {extra.length > 0 && (
            <button
              onClick={() => setSheet(true)}
              aria-label="Mais"
              className="flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-ink-400"
            >
              <MoreHorizontal size={21} strokeWidth={1.9} />
              <span className="text-[10px] font-medium">Mais</span>
              <span className="h-1 w-1" />
            </button>
          )}
        </div>
      </nav>

      {/* ── Celular: gaveta do "Mais" ────────────────────────── */}
      {sheet && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar"
            onClick={() => setSheet(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-line bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-ink-900">{user?.name ?? user?.email}</p>
                <p className="text-xs text-muted">
                  {user?.role === "admin" ? "administrador" : "operador"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button
                  onClick={() => setSheet(false)}
                  className="rounded-full p-2 text-muted hover:bg-canvas"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <form onSubmit={onSearch} className="mb-3">
              <input
                className="input"
                placeholder="Buscar contato, empresa ou telefone…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </form>

            <div className="space-y-1.5">
              {extra.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas"
                  >
                    <Icon size={18} className="text-muted" />
                    {tab.label}
                  </Link>
                );
              })}
              <Link
                href="/dashboard/admin"
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas"
              >
                <ChevronLeft size={18} className="text-muted" />
                Painel zerokm
              </Link>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                <LogOut size={18} />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Carteira: extrato das consultas e evolução do saldo ── */}
      {wallet && balance && (
        <WalletModal
          balance={balance}
          refreshing={balanceLoading}
          onRefresh={() => loadBalance(true)}
          onClose={() => setWallet(false)}
        />
      )}
    </div>
  );
}
