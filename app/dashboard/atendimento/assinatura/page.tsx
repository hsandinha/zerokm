import { redirect } from "next/navigation";
import { AssinaturaAtendimento } from "@wa/components/assinatura-atendimento";
import { requireScope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function AssinaturaPage() {
  const scope = await requireScope();
  if (scope.role !== "admin") redirect("/dashboard/atendimento/central");
  return <AssinaturaAtendimento />;
}
