import { redirect } from "next/navigation";
import { ConfigScreen } from "@wa/components/config-screen";
import { Integrations } from "@wa/components/integrations";
import { Diagnostics } from "@wa/components/diagnostics";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

export default async function ConfiguracaoPage() {
  const user = await requireWaPage();
  if (user.role !== "admin") redirect("/dashboard/admin/whatsapp/central");

  return (
    <div className="space-y-8">
      <Diagnostics />
      <ConfigScreen />
      <div className="border-t border-line pt-8">
        <Integrations />
      </div>
    </div>
  );
}
