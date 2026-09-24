"use client";
import { useTheme } from "@/lib/contexts/ThemeContext";

export function WhatsAppTheme({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <div id="wa-raiz" className={`wa-scope min-h-screen${theme === 'dark' ? ' wa-dark' : ''}`}>{children}</div>;
}
