import { redirect } from "next/navigation";
import { Iscas } from "@wa/components/iscas";
import { requireScope } from "@wa/lib/scope";
import { podeUsarIscas } from "@wa/lib/iscas-servidor";

export const dynamic = "force-dynamic";

// Iscas de comentário da loja. O menu mostra só para o gestor (é quem cria);
// a equipe que abrir pelo endereço vê a lista sem editar. Sem Instagram e sem
// Messenger liberados pelo CNV, volta para a Central.
export default async function IscasDaLojaPage() {
  const scope = await requireScope().catch(() => null);
  if (!scope || !podeUsarIscas(scope)) redirect("/dashboard/atendimento/central");
  return <Iscas />;
}
