// Quem pode operar o módulo WhatsApp dentro da zerokm.
//
// Autenticar já não é problema daqui: quem entra no painel entra pelo login da
// zerokm (Firebase + NextAuth em `lib/authOptions`). O que esta camada resolve
// é AUTORIZAR — ter sessão na zerokm não dá, por si, acesso à Central.
//
// O papel é relido do banco a cada chamada, não tirado do token: rebaixar
// alguém tem que valer na hora, não só no próximo login. Quem lê do token é
// só o proxy, que roda no edge e não alcança o Mongo.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/mongodb";
import { WaAdmin, type PanelRole } from "@wa/models/panel";
import { ehAdminZerokm, resolvePanelRole } from "@wa/lib/panel-role";

export type PanelUser = {
  id: string;
  email: string;
  name: string | null;
  role: PanelRole;
};

/**
 * Quem está operando agora, ou null quando não há sessão ou a sessão não dá
 * acesso ao módulo.
 */
export async function getPanelUser(): Promise<PanelUser | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const user = session!.user as {
    uid?: string;
    name?: string | null;
    profile?: string;
    allowedProfiles?: string[];
  };
  const perfis = [...(user.allowedProfiles ?? []), ...(user.profile ? [user.profile] : [])];

  const role = await resolvePanelRole(email, ehAdminZerokm(perfis));
  if (!role) return null;

  await dbConnect();
  const admin = await WaAdmin.findOne({ email }).lean();
  // Mantém viva a coluna "último acesso" da tela de usuários, agora que o
  // login não acontece mais aqui dentro. Não vale segurar a resposta por isso.
  if (admin) {
    void WaAdmin.updateOne({ email }, { lastSignInAt: new Date() }).catch(() => {});
  }

  return {
    id: user.uid ?? email,
    email,
    name: admin?.name ?? user.name ?? null,
    role,
  };
}

/** Qualquer pessoa autorizada no módulo (admin ou operador). */
export async function requirePanelUser(): Promise<PanelUser> {
  const user = await getPanelUser();
  if (!user) throw Object.assign(new Error("Não autorizado"), { status: 401 });
  return user;
}

/**
 * Só administrador. Usar nas rotas que mexem em configuração, credenciais,
 * base, templates, campanhas, integrações e usuários — coisas que um operador
 * de fila não deveria conseguir alterar.
 */
export async function requireAdmin(): Promise<PanelUser> {
  const user = await requirePanelUser();
  if (user.role !== "admin") {
    throw Object.assign(new Error("Acesso restrito a administradores"), { status: 403 });
  }
  return user;
}
