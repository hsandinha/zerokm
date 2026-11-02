import { redirect } from "next/navigation";
import { TemplatesScreen } from "@wa/components/templates-screen";
import { requireScope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function TemplatesDaLojaPage() {
  const scope = await requireScope();
  if (scope.role !== "admin") redirect("/dashboard/atendimento/central");
  return <TemplatesScreen />;
}
