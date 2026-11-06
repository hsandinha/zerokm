"use client";
import { useTheme } from "@/lib/contexts/ThemeContext";

/**
 * Escopo visual do atendimento (.wa-scope) no tema claro/escuro do painel.
 * - "pagina" (padrão): a página inteira (o painel do CNV);
 * - "painel": o conteúdo dentro do menu lateral da zerokm (DashboardShell),
 *   que já cuida da altura e da rolagem;
 * - "compacto": um pedaço dentro de outra moldura (controles no topo), sem o
 *   id da raiz.
 */
export function WhatsAppTheme({
  children,
  variante = "pagina",
}: {
  children: React.ReactNode;
  variante?: "pagina" | "painel" | "compacto";
}) {
  const { theme } = useTheme();
  const escuro = theme === "dark" ? " wa-dark" : "";
  if (variante === "compacto") return <div className={`wa-scope flex items-center gap-3${escuro}`}>{children}</div>;
  const altura = variante === "pagina" ? " min-h-screen" : "";
  return <div id="wa-raiz" className={`wa-scope${altura}${escuro}`}>{children}</div>;
}
