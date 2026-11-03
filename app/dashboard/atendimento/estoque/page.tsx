import { redirect } from "next/navigation";
import { EstoqueLocal } from "@wa/components/estoque-local";
import { scopeDaPagina } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function EstoqueDoPatioPage() {
  const scope = await scopeDaPagina("estoque_local");
  if (scope.store?.kind !== "lojista") redirect("/dashboard/atendimento/central");
  return <EstoqueLocal canEdit={scope.role === "admin"} />;
}
