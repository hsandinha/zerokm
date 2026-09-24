import { redirect } from "next/navigation";
import { UsersScreen } from "@wa/components/users-screen";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await requireWaPage();
  if (user.role !== "admin") redirect("/dashboard/admin/whatsapp/central");

  return <UsersScreen />;
}
