import type { Metadata } from "next";
import { Shell } from "@wa/components/shell";
import { requireWaPage } from "@wa/lib/guard";
import "@wa/styles/whatsapp.css";

export const metadata: Metadata = {
  title: "CNV WhatsApp — Central de Vendas",
  description:
    "IA de vendas do CNV no WhatsApp: dúvidas, cadastro, assinatura e campanhas.",
};

export default async function WhatsAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O porteiro fica aqui, não em cada página: o `layout` embrulha todas as
  // rotas do módulo, inclusive as que ainda não existem.
  await requireWaPage();

  // O Shell usa o menu lateral da Administração e põe o tema do WhatsApp só
  // no conteúdo: o menu fica igual ao das outras telas.
  return <Shell>{children}</Shell>;
}
