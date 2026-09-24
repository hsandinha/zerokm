import { redirect } from "next/navigation";
import { TemplatesScreen } from "@wa/components/templates-screen";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireWaPage();
  if (user.role !== "admin") redirect("/dashboard/admin/whatsapp/central");

  return <TemplatesScreen />;
}
