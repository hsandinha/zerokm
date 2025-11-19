import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Login - Zero KM",
  description: "Acesse sua conta no sistema nacional de vendas de carros zero km"
};

export default function LoginLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}