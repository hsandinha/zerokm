import { CampaignDetail } from "@wa/components/campaign-detail";

export default async function CampanhaDaLojaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status } = await searchParams;
  return <CampaignDetail id={id} statusInicial={status} />;
}
