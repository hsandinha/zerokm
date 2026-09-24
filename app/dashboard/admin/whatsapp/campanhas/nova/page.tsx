import { redirect } from "next/navigation";
import { CampaignWizard } from "@wa/components/campaign-wizard";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

export default async function NovaCampanhaPage() {
  const user = await requireWaPage();
  if (user.role !== "admin") redirect("/dashboard/admin/whatsapp/campanhas");

  return <CampaignWizard />;
}
