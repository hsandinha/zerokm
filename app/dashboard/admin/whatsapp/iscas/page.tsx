import { Iscas } from "@wa/components/iscas";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

// Iscas de comentário do CNV (Instagram e Página da Vera). Sem canal de
// Instagram ou Messenger pelo gateway, a tela explica como conectar.
export default async function IscasDoCnvPage() {
  await requireWaPage();
  return <Iscas />;
}
