import { redirect } from "next/navigation";
import { CampaignWizard } from "@wa/components/campaign-wizard";
import { scopeDaPagina } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function NovaCampanhaDaLojaPage({
  searchParams,
}: {
  searchParams: Promise<{ coluna?: string }>;
}) {
  const scope = await scopeDaPagina("campanhas");
  if (scope.role !== "admin") redirect("/dashboard/atendimento/campanhas");
  // ?coluna=<id>: o funil abre o assistente com a coluna já escolhida.
  const { coluna } = await searchParams;
  return <CampaignWizard colunaInicial={coluna ?? null} />;
}
