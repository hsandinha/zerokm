import { redirect } from "next/navigation";
import { CampaignWizard } from "@wa/components/campaign-wizard";
import { requireScope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function NovaCampanhaDaLojaPage() {
  const scope = await requireScope();
  if (scope.role !== "admin") redirect("/dashboard/atendimento/campanhas");
  return <CampaignWizard />;
}
