import { Central } from "@wa/components/central";
import { requireWaPage } from "@wa/lib/guard";

export const dynamic = "force-dynamic";

export default async function CentralPage() {
  // Quem atende precisa saber o que é "minhas" — o e-mail vem da sessão, não
  // de um fetch no cliente, para a fila já abrir filtrada certo.
  const user = await requireWaPage();
  return <Central currentEmail={user.email} />;
}
