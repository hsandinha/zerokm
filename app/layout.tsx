import type { Metadata, Viewport } from "next";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "CNV — Comércio Nacional de Veículos 0km",
  description: "Plataforma completa para concessionárias e compradores de veículos zero quilômetro. Gestão de estoque, CRM, logística e vendas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function LoginLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{
          __html: `
            body { margin: 0; padding: 0; overflow-x: hidden; }
            * { box-sizing: border-box; }
          `
        }} />
      </head>
      <body suppressHydrationWarning={true}>
        <SessionProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}