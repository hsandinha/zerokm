import { Central } from "@wa/components/central";
import { requireScope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function CentralDaLojaPage() {
  const scope = await requireScope();
  return <Central currentEmail={scope.email} />;
}
