import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
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
// deles; a equipe do CNV opera a Vera em /dashboard/admin/whatsapp. Conta sem
// o atendimento liberado pelo CNV (lib/recursos.ts) vê só o aviso.
export default async function AtendimentoLayout({ children }: { children: React.ReactNode }) {
  const scope = await getScope();
  if (!scope) {
    const session = await getServerSession(authOptions);
    if (!session?.user) redirect("/login?callbackUrl=/dashboard/atendimento");
    return <NaoLiberado />;
  }
  if (!scope.store) redirect("/dashboard/admin/whatsapp");
  if (!scope.store.recursos.atendimento) return <NaoLiberado />;

  return (
    <WhatsAppTheme>
      <StoreShell store={{ ...scope.store, role: scope.role }}>{children}</StoreShell>
    </WhatsAppTheme>
  );
}

function NaoLiberado() {
  return (
    <WhatsAppTheme>
      <main className="mx-auto max-w-lg p-8 text-center">
        <p className="brand-kicker">Atendimento</p>
        <h1 className="mt-2 text-xl font-bold text-ink-900">O atendimento ainda não foi liberado para a sua conta</h1>
        <p className="mt-2 text-sm text-muted">
          WhatsApp, Instagram e IA de vendas com o estoque da zerokm. Fale com o CNV para liberar.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm font-semibold underline">
          Voltar ao painel
        </Link>
      </main>
    </WhatsAppTheme>
  );
}
