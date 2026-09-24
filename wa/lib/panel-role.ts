// Resolução do papel de alguém no módulo WhatsApp.
//
// Vive num arquivo só seu porque tem dois chamadores que não podem se enxergar:
// `lib/authOptions` (grava o papel no token, no login) e `wa/lib/auth` (relê o
// papel a cada requisição). Como `wa/lib/auth` importa `authOptions` para ler a
// sessão, pôr esta função lá dentro fecharia um ciclo de imports.

import dbConnect from "@/lib/mongodb";
import { WaAdmin, type PanelRole } from "@wa/models/panel";

/** Perfis da zerokm que valem como administrador do módulo. */
export const ADMIN_PROFILES = ["administrador", "admin"];

export function ehAdminZerokm(perfis: string[] | undefined | null): boolean {
  return (perfis ?? []).some((p) => ADMIN_PROFILES.includes(p));
}

/**
 * Papel de um e-mail no módulo, ou null quando não tem acesso.
 *
 * Duas portas, nesta ordem:
 *   1. administrador da zerokm → `admin`, sempre. É o dono da plataforma; não
 *      faz sentido depender de uma allowlist dentro da própria casa dele —
 *      estar na lista como `operador` não o rebaixa;
 *   2. e-mail em `wa_admins` → entra com o papel de lá. É o que permite dar a
 *      fila a quem atende WhatsApp sem promovê-lo a administrador da zerokm.
 */
export async function resolvePanelRole(
  email: string,
  isZerokmAdmin: boolean,
): Promise<PanelRole | null> {
  if (isZerokmAdmin) return "admin";
  await dbConnect();
  const admin = await WaAdmin.findOne({ email: email.trim().toLowerCase() }).lean();
  if (!admin) return null;
  return (admin.role as PanelRole) ?? "admin";
}
