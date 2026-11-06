import { redirect } from "next/navigation";
import { Automacoes } from "@wa/components/automacoes";
import { scopeDaPagina } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

// Só o gestor configura; com o recurso desligado pelo CNV, volta para a Central.
export default async function AutomacoesDaLojaPage() {
  const scope = await scopeDaPagina("automacoes");
  if (scope.role !== "admin") redirect("/dashboard/atendimento/central");
  return <Automacoes />;
}
