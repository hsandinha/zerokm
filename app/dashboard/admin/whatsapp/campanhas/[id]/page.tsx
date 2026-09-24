import { CampaignDetail } from "@wa/components/campaign-detail";

// O filtro inicial vem da query (?status=failed no link "ver motivo"). Ler
// aqui, no server component, evita precisar embrulhar o cliente em Suspense.
export default async function CampanhaPage({
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
