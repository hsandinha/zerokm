// Dono do estoque local (o lojista titular da loja de quem está operando).
// O estoque local mora na RepasseVehicle com `lojistaId` — ver o modelo.

import { requireScope, requireScopeAdmin } from "@wa/lib/scope";
import { getStore } from "@wa/lib/store";

export async function lojistaDoEscopo(admin: boolean) {
  const scope = admin ? await requireScopeAdmin() : await requireScope();
  const store = await getStore(scope.tenantId);
  if (!store || store.kind !== "lojista" || !store.ownerUserId) {
    throw Object.assign(new Error("Estoque local é só para lojistas"), { status: 404 });
  }
  return { scope, lojistaId: store.ownerUserId };
}
