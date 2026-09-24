"use client";

import clsx from "clsx";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/contexts/ThemeContext";

/** All administration screens share the same independent theme preference. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}
    aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
    title={theme === "dark" ? "Tema claro" : "Tema escuro"}
    className={clsx("flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-ink-300 hover:text-ink-900", className)}>
    {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
  </button>;
}
