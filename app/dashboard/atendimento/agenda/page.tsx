import { Agenda } from "@wa/components/agenda";
import { scopeDaPagina } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function AgendaDaLojaPage() {
  const scope = await scopeDaPagina("agenda");
  return <Agenda gestor={scope.role === "admin"} />;
}
