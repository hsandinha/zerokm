// Escopo de quem está operando o atendimento: o CNV (a Vera, tenantId null)
// ou uma loja (tenantId = WaStore._id). É o `org_id` do Chatrun.
//
// As rotas compartilhadas (/api/wa/conversations, contatos, funil, canais,
// configuração...) filtram TUDO por `tenantId` daqui. As rotas que só existem
// para o CNV (enriquecimento, importação, Procob, integrações, usuários)
// continuam com requirePanelUser/requireAdmin, que nunca deixam loja passar.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPanelUser } from "@wa/lib/auth";
import { membershipFor, recursosDaLoja, storeAccess, type StoreAccess } from "@wa/lib/store";
import { MSG_RECURSO_DESLIGADO, type Recurso, type Recursos } from "@/lib/recursos";
import type { StoreKind } from "@wa/models/store";

export type Scope = {
  /** null = CNV. */
  tenantId: string | null;
  email: string;
  name: string | null;
  /** "admin" = configura (admin do CNV ou gestor da loja); "operador" = atende. */
  role: "admin" | "operador";
  store: { id: string; name: string; kind: StoreKind; access: StoreAccess; recursos: Recursos } | null;
};

export async function getScope(): Promise<Scope | null> {
  // Equipe do CNV primeiro: um administrador da zerokm opera a Vera.
  const panel = await getPanelUser();
  if (panel) {
    return { tenantId: null, email: panel.email, name: panel.name, role: panel.role, store: null };
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const u = session!.user as { name?: string | null; profile?: string; allowedProfiles?: string[] };
  const profiles = [...(u.allowedProfiles ?? []), ...(u.profile ? [u.profile] : [])];

  const membership = await membershipFor({ email, profiles });
  if (!membership) return null;
  const { store, role } = membership;
  return {
    tenantId: String(store._id),
    email,
    name: u.name ?? null,
    role: role === "gestor" ? "admin" : "operador",
    store: {
      id: String(store._id),
      name: store.name,
      kind: store.kind,
      access: storeAccess(store),
      recursos: await recursosDaLoja(store),
    },
  };
}

/** Loja sem o atendimento liberado não passa de nenhuma rota do atendimento.
 *  `recurso`: a funcionalidade que a rota exige além dele (funil, campanhas...). */
export async function requireScope(recurso?: Recurso): Promise<Scope> {
  const scope = await getScope();
  if (!scope) throw Object.assign(new Error("Não autorizado"), { status: 401 });
  requireRecurso(scope, "atendimento");
  if (recurso) requireRecurso(scope, recurso);
  return scope;
}

/** O CNV liberou esta funcionalidade para a loja? A Vera (CNV) sempre pode. */
export function podeUsar(scope: Pick<Scope, "store">, recurso: Recurso): boolean {
  return !scope.store || scope.store.recursos[recurso];
}

export function requireRecurso(scope: Pick<Scope, "store">, recurso: Recurso): void {
  if (!podeUsar(scope, recurso)) {
    throw Object.assign(new Error(MSG_RECURSO_DESLIGADO), { status: 403 });
  }
}

/** Quem configura: administrador do CNV ou gestor da loja. */
export async function requireScopeAdmin(recurso?: Recurso): Promise<Scope> {
  const scope = await requireScope(recurso);
  if (scope.role !== "admin") {
    throw Object.assign(new Error("Acesso restrito a gestores"), { status: 403 });
  }
  return scope;
}

/** Filtro de loja para as coleções do atendimento. `null` também casa com
 *  documento sem o campo (tudo que é do CNV desde antes das lojas). */
export function tenantFilter(scope: Pick<Scope, "tenantId">): { tenantId: string | null } {
  return { tenantId: scope.tenantId };
}

/** O documento é desta loja? (detalhe de conversa, contato, campanha...) */
export function sameTenant(
  scope: Pick<Scope, "tenantId">,
  doc: { tenantId?: string | null } | null | undefined,
): boolean {
  if (!doc) return false;
  return (doc.tenantId ?? null) === scope.tenantId;
}

export function scopeError(err: unknown): { error: string; status: number } {
  const status = (err as { status?: number })?.status ?? 401;
  return { error: err instanceof Error ? err.message : "Não autorizado", status };
}

/** Página do atendimento que depende de uma funcionalidade: desligada, volta
 *  para a Central (o menu já não mostra o link; isto cobre o endereço digitado). */
export async function scopeDaPagina(recurso: Recurso): Promise<Scope> {
  const scope = await requireScope();
  if (!podeUsar(scope, recurso)) redirect("/dashboard/atendimento/central");
  return scope;
}
