import { OrigensTela } from "@wa/components/origens-tela";
import { requireScope } from "@wa/lib/scope";

export const dynamic = "force-dynamic";

export default async function OrigensDaLojaPage() {
  await requireScope();
  return <OrigensTela />;
}
