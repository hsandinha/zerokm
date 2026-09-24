// Porteiro das páginas do módulo (server components).
//
// As rotas de API se defendem sozinhas com `requirePanelUser`/`requireAdmin`,
// que lançam 401/403. Numa página isso viraria tela de erro: aqui o certo é
// redirecionar. Sem sessão vai para o login; com sessão mas sem acesso ao
// módulo, volta para o painel da zerokm em vez de cair num 403 sem saída.
//
// Isto é a segunda tranca, não a primeira: o proxy já barra no edge pelo
// `waRole` do token. A diferença é que aqui o papel é relido do Mongo, então
// um token velho — de alguém que saiu da allowlist depois de entrar — não
// vale mais nada.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPanelUser, type PanelUser } from "@wa/lib/auth";

export async function requireWaPage(): Promise<PanelUser> {
  const user = await getPanelUser();
  if (user) return user;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/dashboard/admin/whatsapp");
  }
  redirect("/dashboard/admin");
}
