import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { AdminDesignLayout } from "@/components/dashboard/AdminDesignLayout";
import { StoreShell, type PainelDeOrigem } from "@wa/components/store-shell";
import { getScope } from "@wa/lib/scope";
import "@wa/styles/whatsapp.css";

export const metadata: Metadata = {
  title: "Atendimento — CNV",
  description: "WhatsApp, Instagram e IA de vendas da sua loja, com o estoque da zerokm.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export const dynamic = "force-dynamic";

const PAINEL_DO_PERFIL: Record<string, { tipo: PainelDeOrigem["tipo"]; url: string; rotulo: string }> = {
  concessionaria: { tipo: "concessionaria", url: "/dashboard/dealership", rotulo: "Concessionária" },
  dealership: { tipo: "concessionaria", url: "/dashboard/dealership", rotulo: "Concessionária" },
  cliente: { tipo: "cliente", url: "/dashboard/cliente", rotulo: "Cliente" },
  gratis: { tipo: "cliente", url: "/dashboard/cliente", rotulo: "Cliente" },
  administrador: { tipo: "outro", url: "/dashboard/admin", rotulo: "Administração" },
  gerente: { tipo: "outro", url: "/dashboard/admin", rotulo: "Administração" },
  marketing: { tipo: "outro", url: "/dashboard/admin", rotulo: "Administração" },
  operador: { tipo: "outro", url: "/dashboard/operator", rotulo: "Operação" },
  operator: { tipo: "outro", url: "/dashboard/operator", rotulo: "Operação" },
  administrativo: { tipo: "outro", url: "/dashboard/administrativo", rotulo: "Administrativo" },
  vendedor: { tipo: "outro", url: "/dashboard/vendedor", rotulo: "Vendedor" },
};

/** O painel de quem está logado: o menu lateral do atendimento é o dele. */
function painelDe(
  user: { name?: string | null; email?: string | null; profile?: string; allowedProfiles?: string[] } | undefined,
  kind: "concessionaria" | "lojista" | null,
): PainelDeOrigem {
  const perfis = [...(user?.profile ? [user.profile] : []), ...(user?.allowedProfiles ?? [])];
  // A loja manda quando o perfil é dela (o dono de uma concessionária também
  // pode ter outro perfil na zerokm).
  const daLoja = perfis.find((p) =>
    kind === "concessionaria" ? PAINEL_DO_PERFIL[p]?.tipo === "concessionaria" : kind === "lojista" ? PAINEL_DO_PERFIL[p]?.tipo === "cliente" : false,
  );
  const perfil = daLoja ?? perfis.find((p) => PAINEL_DO_PERFIL[p]) ?? "";
  const base = PAINEL_DO_PERFIL[perfil] ?? { tipo: "outro" as const, url: "/dashboard", rotulo: "Painel" };
  return {
    ...base,
    gratis: perfis.includes("gratis") && !perfis.includes("cliente"),
    user: { name: user?.name ?? null, email: user?.email ?? null },
  };
}

// Porteiro do atendimento das lojas: concessionária e lojista entram na loja
// deles; a equipe do CNV opera a Vera em /dashboard/admin/whatsapp. Conta sem
// o atendimento liberado pelo CNV (lib/recursos.ts) vê só o aviso, com o
// mesmo menu lateral do painel.
export default async function AtendimentoLayout({ children }: { children: React.ReactNode }) {
  const scope = await getScope();
  const session = await getServerSession(authOptions);
  if (!scope && !session?.user) redirect("/login?callbackUrl=/dashboard/atendimento");
  if (scope && !scope.store) redirect("/dashboard/admin/whatsapp");
  const user = session?.user as
    | { name?: string | null; email?: string | null; profile?: string; allowedProfiles?: string[] }
    | undefined;
  const painel = painelDe(user, scope?.store?.kind ?? null);
  const liberado = Boolean(scope?.store?.recursos.atendimento);

  return (
    <AdminDesignLayout>
      <StoreShell store={liberado && scope?.store ? { ...scope.store, role: scope.role } : null} painel={painel}>
        {liberado ? children : <NaoLiberado painelUrl={painel.url} />}
      </StoreShell>
    </AdminDesignLayout>
  );
}

function NaoLiberado({ painelUrl }: { painelUrl: string }) {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <p className="brand-kicker">Atendimento</p>
      <h1 className="mt-2 text-xl font-bold text-ink-900">O atendimento ainda não foi liberado para a sua conta</h1>
      <p className="mt-2 text-sm text-muted">
        WhatsApp, Instagram e IA de vendas com o estoque da zerokm. Fale com o CNV para liberar.
      </p>
      <Link href={painelUrl} className="mt-6 inline-block text-sm font-semibold underline">
        Voltar ao painel
      </Link>
    </div>
  );
}
