"use client";

// Casca do painel de WhatsApp do CNV. Usa o mesmo menu lateral da
// Administração (DashboardShell): as abas do painel continuam à vista e o
// WhatsApp aparece aberto com as telas dele logo abaixo. O menu nunca some
// ao entrar aqui. No topo ficam a busca, o saldo da Procob, o estado da IA e
// o status de quem atende; no celular, numa faixa no começo da tela.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Inbox,
  Kanban,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Search,
  Settings2,
  Sparkles,
  Upload,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
  Store,
  MessageCircle,
  MessageCircleReply,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { DashboardShell, type ShellTab } from "@/components/dashboard/DashboardShell";
import { abasDoAdmin } from "@/components/dashboard/abas-dos-paineis";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { WhatsAppTheme } from "@wa/components/admin-theme";
import { EquipeNaMoldura } from "@wa/components/equipe-status";
import { timeAgo } from "@wa/lib/stages";
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
      { href: "/dashboard/admin/whatsapp/iscas", label: "Iscas", icon: MessageCircleReply, adminOnly: true },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/dashboard/admin/whatsapp/lojas", label: "Lojas (atendimento)", icon: Store, adminOnly: true },
      { href: "/dashboard/admin/whatsapp/usuarios", label: "Usuários", icon: UserCog, adminOnly: true },
      { href: "/dashboard/admin/whatsapp/configuracao", label: "IA & WABA", icon: Settings2, adminOnly: true },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
/** Prefixo das telas do WhatsApp no menu: não colide com as abas da Administração. */
const WA = "wa:";
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
  const isMobile = useIsMobile();
  const { data: sessao } = useSession();
  const [user, setUser] = useState<PanelUser | null>(null);
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [wallet, setWallet] = useState(false);
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

  // Saldo da Procob. Sem `refresh` a rota só lê o banco: o número vem de
  // carona nas consultas pagas. Perguntar à Procob (o clique) não debita
  // crédito, mas gasta 1 requisição do proxy de IP fixo, que é limitado.
  const loadBalance = useCallback(async (refresh = false) => {
    setBalanceLoading(true);
    try {
      const res = await fetch(`/api/wa/procob/saldo${refresh ? "?refresh=1" : ""}`);
      if (res.ok) setBalance((await res.json()).balance ?? null);
    } catch {
      /* o topo não quebra por causa do saldo */
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
    const t = setInterval(() => loadBalance(), BALANCE_POLL_MS);
    return () => clearInterval(t);
  }, [loadBalance]);

  // Trocar de tela fecha o extrato: senão fica por cima da página.
  useEffect(() => {
    setWallet(false);
  }, [pathname]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/dashboard/admin/whatsapp/contatos?q=${encodeURIComponent(term)}`);
  }

  const isAdmin = user?.role === "admin";
  const visible = GROUPS.flatMap((g) => g.items.filter((i) => !i.adminOnly || isAdmin));
  const waiting = status?.counts.waiting ?? 0;

  // A rota mais específica que casa com o caminho (ex.: /campanhas/nova).
  const current = ALL_ITEMS.filter((i) => (pathname ?? "").startsWith(i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];

  // Telas do WhatsApp como subitens da aba WhatsApp.
  const telas: ShellTab[] = visible.map((item) => {
    const Icon = item.icon;
    return {
      id: `${WA}${item.href}`,
      label: item.label,
      icon: <Icon size={18} aria-hidden="true" />,
      ...(item.badge === "waiting" && waiting > 0 ? { badge: waiting } : {}),
    };
  });

  // Abas da Administração para quem é da administração da zerokm; quem só
  // está na lista do WhatsApp (operador de fila) vê o painel dele e o WhatsApp.
  const perfil = (sessao?.user as { profile?: string } | undefined)?.profile ?? null;
  const daAdministracao = perfil === "administrador" || perfil === "gerente" || perfil === "marketing";
  const abasDoPainel = daAdministracao
    ? abasDoAdmin(perfil)
    : [{ id: "painel", label: "Painel", icon: <LayoutDashboard size={20} aria-hidden="true" /> }];
  const comWhatsapp = abasDoPainel.some((t) => t.id === "whatsapp")
    ? abasDoPainel
    : [...abasDoPainel, { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle size={20} aria-hidden="true" /> }];
  const tabs: ShellTab[] = comWhatsapp.map((t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    ...(t.id === "whatsapp" ? { children: telas } : {}),
  }));
  const activeId = current ? `${WA}${current.href}` : "whatsapp";

  function selecionar(id: string) {
    if (id.startsWith(WA)) router.push(id.slice(WA.length));
    else if (id === "whatsapp") router.push("/dashboard/admin/whatsapp/visao-geral");
    else if (id === "painel") window.location.assign("/dashboard");
    // Aba da Administração: abre lá, na aba certa.
    else window.location.assign(`/dashboard/admin?view=${encodeURIComponent(id)}`);
  }

  const estadoDaIa = (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-muted"
      title={status?.displayPhone ? `WhatsApp ${status.displayPhone}` : undefined}
    >
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          !status ? "bg-ink-300" : status.aiActive ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {status ? (status.aiActive ? "IA respondendo" : "IA pausada") : "IA"}
    </span>
  );

  // Um lugar só por vez (topo no computador, faixa no celular): os controles
  // consultam o servidor, montados em dobro consultariam em dobro.
  const controles = (
    <>
      {!isMobile && (
        <form onSubmit={onSearch} className="hidden w-64 xl:block">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input py-1.5 pl-8 text-sm"
              placeholder="Buscar contato ou telefone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </form>
      )}
      {balance && <BalancePill balance={balance} loading={balanceLoading} onOpen={() => setWallet(true)} />}
      {estadoDaIa}
      {/* Status de quem atende e avisos no navegador (wa/components/equipe-status.tsx). */}
      <EquipeNaMoldura />
    </>
  );

  return (
    <DashboardShell
      sectionLabel={daAdministracao ? "Administração" : "Painel"}
      tabs={tabs}
      activeId={activeId}
      onSelect={selecionar}
      primaryIds={visible.filter((i) => i.primary).map((i) => `${WA}${i.href}`)}
      user={{
        name: user?.name ?? sessao?.user?.name ?? "Equipe",
        email: user?.email ?? sessao?.user?.email ?? null,
        role: isAdmin ? "Administrador" : "Operador",
      }}
      topbarAside={isMobile ? undefined : <WhatsAppTheme variante="compacto">{controles}</WhatsAppTheme>}
    >
      <WhatsAppTheme variante="painel">
        {isMobile && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line px-4 py-2">{controles}</div>
        )}
        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6">{children}</main>
        {wallet && balance && (
          <WalletModal
            balance={balance}
            refreshing={balanceLoading}
            onRefresh={() => loadBalance(true)}
            onClose={() => setWallet(false)}
          />
        )}
      </WhatsAppTheme>
    </DashboardShell>
  );
}
