import { redirect } from "next/navigation";
import { CampaignWizard } from "@wa/components/campaign-wizard";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

export default async function NovaCampanhaPage({
  searchParams,
}: {
  searchParams: Promise<{ coluna?: string }>;
}) {
  const user = await requireWaPage();
  if (user.role !== "admin") redirect("/dashboard/admin/whatsapp/campanhas");

  // ?coluna=<id>: o funil abre o assistente com a coluna já escolhida.
  const { coluna } = await searchParams;
  return <CampaignWizard colunaInicial={coluna ?? null} />;
}
