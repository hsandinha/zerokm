import { Tarefas } from "@wa/components/tarefas";
import { scopeDaPagina } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function TarefasDaLojaPage() {
  const scope = await scopeDaPagina("agenda");
  return <Tarefas me={scope.email} />;
}
