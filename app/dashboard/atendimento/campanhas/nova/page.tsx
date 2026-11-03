import { redirect } from "next/navigation";
import { CampaignWizard } from "@wa/components/campaign-wizard";
import { scopeDaPagina } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function NovaCampanhaDaLojaPage() {
  const scope = await scopeDaPagina("campanhas");
  if (scope.role !== "admin") redirect("/dashboard/atendimento/campanhas");
  return <CampaignWizard />;
}
