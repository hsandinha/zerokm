import { CampaignDetail } from "@wa/components/campaign-detail";
import { scopeDaPagina } from "@wa/lib/scope";

export default async function CampanhaDaLojaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  await scopeDaPagina("campanhas");
  const { id } = await params;
  const { status } = await searchParams;
  return <CampaignDetail id={id} statusInicial={status} />;
}
