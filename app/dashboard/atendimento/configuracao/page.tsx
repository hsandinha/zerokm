import { redirect } from "next/navigation";
import { StoreConfig } from "@wa/components/store-config";
import { requireScope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function ConfiguracaoDaLojaPage() {
  const scope = await requireScope();
  if (scope.role !== "admin") redirect("/dashboard/atendimento/central");
  return <StoreConfig />;
}
