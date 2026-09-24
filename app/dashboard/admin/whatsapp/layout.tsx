import type { Metadata } from "next";
import { WhatsAppTheme } from "@wa/components/admin-theme";
import { Shell } from "@wa/components/shell";
import { requireWaPage } from "@wa/lib/guard";
import "@wa/styles/whatsapp.css";

export const metadata: Metadata = {
  title: "CNV WhatsApp — Central de Vendas",
  description:
    "IA de vendas da CNV no WhatsApp: dúvidas, cadastro, assinatura e campanhas.",
};

export default async function WhatsAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O porteiro fica aqui, não em cada página: o `layout` embrulha todas as
  // rotas do módulo, inclusive as que ainda não existem.
  await requireWaPage();

  return (
    <WhatsAppTheme>
      <Shell>{children}</Shell>
    </WhatsAppTheme>
  );
}
