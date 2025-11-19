import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Login - Zero KM",
  description: "Acesse sua conta no sistema nacional de vendas de carros zero km",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1"
};

export default function LoginLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <style dangerouslySetInnerHTML={{
          __html: `
            body { margin: 0; padding: 0; overflow-x: hidden; }
            * { box-sizing: border-box; }
          `
        }} />
      </head>
      <body suppressHydrationWarning={true}>
        {children}
      </body>
    </html>
  );
}