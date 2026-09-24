"use client";

// Alternador de tema DO MÓDULO. A escolha fica no localStorage; sem escolha, o
// padrão da CNV é o escuro (o script no layout já aplica antes da primeira
// pintura).
//
// A classe entra na `.wa-scope`, não no <html>: o tema da zerokm é outro
// mecanismo (`data-theme`) e não pode ser arrastado junto.

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "cnv-tema";

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(true);
  // Só depois de montar sabemos o tema real — antes disso o ícone renderizaria
  // errado no servidor e piscaria na hidratação.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.getElementById("wa-raiz")?.classList.contains("wa-dark") ?? true);
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.getElementById("wa-raiz")?.classList.toggle("wa-dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Modo anônimo com storage bloqueado: o tema vale só nesta sessão.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
      title={dark ? "Tema claro" : "Tema escuro"}
      className={clsx(
        "flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-ink-300 hover:text-ink-900",
        className,
      )}
    >
      {mounted && dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
