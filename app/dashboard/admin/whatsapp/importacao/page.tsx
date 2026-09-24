import { redirect } from "next/navigation";
import { ImportScreen } from "@wa/components/import-screen";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

export default async function ImportacaoPage() {
  const user = await requireWaPage();
  if (user.role !== "admin") redirect("/dashboard/admin/whatsapp/central");

  return <ImportScreen />;
}
