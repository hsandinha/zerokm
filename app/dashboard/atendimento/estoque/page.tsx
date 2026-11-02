import { redirect } from "next/navigation";
import { EstoqueLocal } from "@wa/components/estoque-local";
import { requireScope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function EstoqueDoPatioPage() {
  const scope = await requireScope();
  if (scope.store?.kind !== "lojista") redirect("/dashboard/atendimento/central");
  return <EstoqueLocal canEdit={scope.role === "admin"} />;
}
