import { Pipeline } from "@wa/components/pipeline";
import { scopeDaPagina } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function FunilDaLojaPage() {
  await scopeDaPagina("funil");
  return <Pipeline />;
}
