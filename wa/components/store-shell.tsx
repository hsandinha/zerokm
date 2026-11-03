"use client";

// Moldura do atendimento das LOJAS (/dashboard/atendimento): o mesmo visual do
// painel da Vera, com o menu de quem vende carro — central, funil, contatos,
// estoque do pátio e configuração. O aviso de teste/assinatura fica sempre à
// vista: sem assinatura a IA para e as conversas vão direto para a equipe.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { CarFront, ChevronLeft, CreditCard, Inbox, Kanban, LayoutTemplate, Megaphone, Settings2, Users } from "lucide-react";
import { WaPanelProvider, STORE_PANEL } from "@wa/components/wa-panel";
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

const BASE = STORE_PANEL.base;

function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000));
}

export function StoreShell({ store, children }: { store: StoreShellInfo; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [waiting, setWaiting] = useState(0);
  const gestor = store.role === "admin";

  useEffect(() => {
    const load = () =>
      fetch("/api/wa/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setWaiting(d?.counts?.waiting ?? 0))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const r = store.recursos;
  const items = [
    { href: `${BASE}/central`, label: "Central", icon: Inbox, badge: waiting },
    ...(r.funil ? [{ href: `${BASE}/pipeline`, label: "Funil", icon: Kanban }] : []),
    { href: `${BASE}/contatos`, label: "Contatos", icon: Users },
    ...(r.estoque_local ? [{ href: `${BASE}/estoque`, label: "Estoque do pátio", icon: CarFront }] : []),
    ...(r.campanhas ? [{ href: `${BASE}/campanhas`, label: "Campanhas", icon: Megaphone }] : []),
    ...(gestor
      ? [
          ...(r.campanhas ? [{ href: `${BASE}/templates`, label: "Templates", icon: LayoutTemplate }] : []),
          { href: `${BASE}/configuracao`, label: "Configuração", icon: Settings2 },
          { href: `${BASE}/assinatura`, label: "Assinatura", icon: CreditCard },
        ]
      : []),
  ];

  const dias = store.access.trial ? diasAte(store.access.trialEndsAt) : diasAte(store.access.expiresAt);

  return (
    <WaPanelProvider value={{ ...STORE_PANEL, recursos: store.recursos }}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-line bg-paper">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink-900"
              title="Voltar ao painel da zerokm"
            >
              <ChevronLeft size={16} /> Painel
            </Link>
            <div className="min-w-0">
              <p className="brand-kicker">Atendimento</p>
              <p className="truncate text-sm font-bold text-ink-900">{store.name}</p>
            </div>
            <nav className="ml-auto flex flex-wrap gap-1">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-semibold transition",
                      active ? "pill-active" : "text-ink-700 hover:bg-canvas",
                    )}
                  >
                    <Icon size={16} />
                    {item.label}
                    {"badge" in item && item.badge ? (
                      <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
          {!store.access.active ? (
            <p className="bg-red-50 px-4 py-2 text-sm text-red-700">
              Assinatura do atendimento inativa: a IA está parada e as conversas vão direto para a equipe.{" "}
              {gestor && (
                <Link href={`${BASE}/assinatura`} className="font-semibold underline">
                  Assinar agora
                </Link>
              )}
            </p>
          ) : store.access.trial && dias != null ? (
            <p className="bg-amber-50 px-4 py-2 text-sm text-amber-800">
              Período de teste: {dias === 0 ? "termina hoje" : `${dias} dia${dias === 1 ? "" : "s"} restante${dias === 1 ? "" : "s"}`}.{" "}
              {gestor && (
                <Link href={`${BASE}/assinatura`} className="font-semibold underline">
                  Ver planos
                </Link>
              )}
            </p>
          ) : null}
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </WaPanelProvider>
  );
}
