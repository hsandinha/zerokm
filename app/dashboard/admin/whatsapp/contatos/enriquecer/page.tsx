import { redirect } from "next/navigation";
import { Enrichment } from "@wa/components/enrichment";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

export default async function EnriquecerPage() {
  const user = await requireWaPage();
  if (user.role !== "admin") redirect("/dashboard/admin/whatsapp/central");

  return <Enrichment />;
}
