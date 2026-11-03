import { Campaigns } from "@wa/components/campaigns";
import { scopeDaPagina } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function CampanhasDaLojaPage() {
  await scopeDaPagina("campanhas");
  return <Campaigns />;
}
