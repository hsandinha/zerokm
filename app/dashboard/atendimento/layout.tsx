import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WhatsAppTheme } from "@wa/components/admin-theme";
import { StoreShell } from "@wa/components/store-shell";
import { getScope } from "@wa/lib/scope";
import "@wa/styles/whatsapp.css";

export const metadata: Metadata = {
  title: "Atendimento — CNV",
  description: "WhatsApp, Instagram e IA de vendas da sua loja, com o estoque da zerokm.",
};

export const dynamic = "force-dynamic";

// Porteiro do atendimento das lojas: concessionária e lojista entram na loja
// deles; a equipe do CNV opera a Vera em /dashboard/admin/whatsapp.
export default async function AtendimentoLayout({ children }: { children: React.ReactNode }) {
  const scope = await getScope();
  if (!scope) redirect("/login?callbackUrl=/dashboard/atendimento");
  if (!scope.store) redirect("/dashboard/admin/whatsapp");

  return (
    <WhatsAppTheme>
      <StoreShell store={{ ...scope.store, role: scope.role }}>{children}</StoreShell>
    </WhatsAppTheme>
  );
}
