"use client";

// Moldura do atendimento das LOJAS (/dashboard/atendimento): o mesmo menu
// lateral do painel da zerokm (DashboardShell), com as abas do painel de
// quem está logado e o Atendimento aberto com as telas dele logo abaixo.
// O menu nunca some ao entrar no atendimento. O aviso de teste/assinatura
// fica sempre à vista: sem assinatura a IA para e as conversas vão direto
// para a equipe.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CarFront,
  CreditCard,
  Inbox,
  Kanban,
  LayoutTemplate,
  ListChecks,
  Megaphone,
  MessageCircleReply,
  MessagesSquare,
  Settings2,
  Signpost,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { DashboardShell, type ShellTab } from "@/components/dashboard/DashboardShell";
import { ABAS_CONCESSIONARIA, abasDoCliente, type AbaDoPainel } from "@/components/dashboard/abas-dos-paineis";
import { useRecursos } from "@/lib/hooks/useRecursos";
import { useFavoritos } from "@/lib/hooks/useFavoritos";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { WaPanelProvider, STORE_PANEL } from "@wa/components/wa-panel";
import { WhatsAppTheme } from "@wa/components/admin-theme";
import { EquipeNaMoldura } from "@wa/components/equipe-status";
import type { Recursos } from "@/lib/recursos";

export type StoreShellInfo = {
  name: string;
  kind: "concessionaria" | "lojista";
  role: "admin" | "operador";
  access: {
    active: boolean;
    trial: boolean;
    trialEndsAt: string | null;
    expiresAt: string | null;
    planName: string | null;
  };
  /** Funcionalidades que o CNV liberou: o que está desligado sai do menu. */
  recursos: Recursos;
};

/** De que painel a pessoa veio: as abas do menu lateral são as dele. */
export type PainelDeOrigem = {
  tipo: "concessionaria" | "cliente" | "outro";
  /** Rota do painel (as abas dele abrem lá com ?view=). */
  url: string;
  /** Rótulo da seção no topo do menu e na trilha (Concessionária, Cliente...). */
  rotulo: string;
  /** Plano grátis do cliente: sem Favoritos. */
  gratis: boolean;
  user: { name: string | null; email: string | null };
};

const BASE = STORE_PANEL.base;
/** Prefixo dos itens do atendimento no menu: não colide com as abas do painel. */
const AT = "at:";

function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000));
}

const icone = (Icon: LucideIcon, size = 18) => <Icon size={size} aria-hidden="true" />;

export function StoreShell({
  store,
  painel,
  children,
}: {
  /** null = conta sem o atendimento liberado (só o aviso, com o menu). */
  store: StoreShellInfo | null;
  painel: PainelDeOrigem;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const isMobile = useIsMobile();
  const [waiting, setWaiting] = useState(0);
  const gestor = store?.role === "admin";
  const { pode } = useRecursos();
  const podeFavoritar = painel.tipo === "cliente" && !painel.gratis && pode("favoritos");
  const { totalNovos } = useFavoritos(podeFavoritar);

  useEffect(() => {
    if (!store) return;
    const load = () =>
      fetch("/api/wa/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setWaiting(d?.counts?.waiting ?? 0))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [store]);

  // Telas do atendimento, com o que o CNV liberou para a loja.
  const telas: ShellTab[] = useMemo(() => {
    if (!store) return [];
    const r = store.recursos;
    const item = (slug: string, label: string, Icon: LucideIcon, badge?: number): ShellTab => ({
      id: `${AT}${slug}`,
      label,
      icon: icone(Icon),
      ...(badge ? { badge } : {}),
    });
    return [
      item("central", "Central", Inbox, waiting),
      ...(r.funil ? [item("pipeline", "Funil", Kanban)] : []),
      item("contatos", "Contatos", Users),
      ...(r.agenda ? [item("agenda", "Agenda", CalendarDays), item("tarefas", "Tarefas", ListChecks)] : []),
      ...(r.estoque_local ? [item("estoque", "Estoque do pátio", CarFront)] : []),
      ...(r.campanhas ? [item("campanhas", "Campanhas", Megaphone)] : []),
      item("resultados", "Resultados", BarChart3),
      // De onde vieram as conversas (anúncio, campanha, direto) e as vendas.
      item("origens", "Origens", Signpost),
      ...(gestor && r.automacoes ? [item("automacoes", "Automações", Zap)] : []),
      // Comentou no post → mensagem no Direct/Messenger (wa/components/iscas.tsx).
      ...(gestor && (r.instagram || r.messenger) ? [item("iscas", "Iscas", MessageCircleReply)] : []),
      ...(gestor && r.campanhas ? [item("templates", "Templates", LayoutTemplate)] : []),
      ...(gestor ? [item("configuracao", "Configuração", Settings2), item("assinatura", "Assinatura", CreditCard)] : []),
    ];
  }, [store, waiting, gestor]);

  // Abas do painel de onde a pessoa veio, com o Atendimento aberto.
  const tabs: ShellTab[] = useMemo(() => {
    const doPainel: AbaDoPainel[] =
      painel.tipo === "concessionaria"
        ? ABAS_CONCESSIONARIA.filter((t) => !t.recurso || t.id === "atendimento" || pode(t.recurso))
        : painel.tipo === "cliente"
          ? abasDoCliente({ podeFavoritar, novosFavoritos: totalNovos, podeAtendimento: true })
          : [{ id: "painel", label: "Painel", icon: icone(MessagesSquare, 20) }];
    const comAtendimento: AbaDoPainel[] = doPainel.some((t) => t.id === "atendimento")
      ? doPainel
      : [...doPainel, { id: "atendimento", label: "Atendimento", icon: icone(MessagesSquare, 20) }];
    return comAtendimento.map(({ id, label, icon, badge }) => ({
      id,
      label,
      icon,
      ...(badge ? { badge } : {}),
      ...(id === "atendimento" ? { children: telas } : {}),
    }));
  }, [painel.tipo, pode, podeFavoritar, totalNovos, telas]);

  // Tela ativa pela rota: /dashboard/atendimento/<tela>/...
  const slug = pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length + 1).split("/")[0] : "central";
  const activeId = store ? `${AT}${slug || "central"}` : "atendimento";

  function selecionar(id: string) {
    if (id.startsWith(AT)) {
      router.push(`${BASE}/${id.slice(AT.length)}`);
    } else if (id === "atendimento") {
      router.push(`${BASE}/central`);
    } else if (id === "painel") {
      window.location.assign(painel.url);
    } else {
      // Aba do painel: abre lá, na aba certa.
      window.location.assign(`${painel.url}?view=${encodeURIComponent(id)}`);
    }
  }

  const dias = store ? (store.access.trial ? diasAte(store.access.trialEndsAt) : diasAte(store.access.expiresAt)) : null;
  const controles = store ? <EquipeNaMoldura /> : null;

  const conteudo = (
    <WhatsAppTheme variante="painel">
      {store && !store.access.active ? (
        <p className="bg-red-50 px-4 py-2 text-sm text-red-700">
          Assinatura do atendimento inativa: a IA está parada e as conversas vão direto para a equipe.{" "}
          {gestor && (
            <Link href={`${BASE}/assinatura`} className="font-semibold underline">
              Assinar agora
            </Link>
          )}
        </p>
      ) : store?.access.trial && dias != null ? (
        <p className="bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Período de teste: {dias === 0 ? "termina hoje" : `${dias} dia${dias === 1 ? "" : "s"} restante${dias === 1 ? "" : "s"}`}.{" "}
          {gestor && (
            <Link href={`${BASE}/assinatura`} className="font-semibold underline">
              Ver planos
            </Link>
          )}
        </p>
      ) : null}
      {/* No celular o topo do painel some: status e avisos ficam aqui. Um
          lugar só por vez, para não consultar o status em dobro. */}
      {isMobile && controles && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <span className="truncate text-sm font-bold text-ink-900">{store?.name}</span>
          {controles}
        </div>
      )}
      <main className="p-4 md:p-6">{children}</main>
    </WhatsAppTheme>
  );

  return (
    <DashboardShell
      sectionLabel={painel.rotulo}
      tabs={tabs}
      activeId={activeId}
      onSelect={selecionar}
      primaryIds={[`${AT}central`, `${AT}pipeline`, `${AT}contatos`, `${AT}agenda`]}
      user={{ name: painel.user.name || painel.rotulo, email: painel.user.email, role: painel.rotulo }}
      topbarAside={
        store && !isMobile ? (
          <WhatsAppTheme variante="compacto">
            <span className="max-w-48 truncate text-xs font-semibold text-ink-700" title={store.name}>
              {store.name}
            </span>
            {controles}
          </WhatsAppTheme>
        ) : undefined
      }
    >
      {store ? (
        <WaPanelProvider value={{ ...STORE_PANEL, recursos: store.recursos }}>{conteudo}</WaPanelProvider>
      ) : (
        conteudo
      )}
    </DashboardShell>
  );
}
