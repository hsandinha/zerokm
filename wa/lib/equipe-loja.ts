// Quem é da equipe de uma loja hoje, sem depender de quem está operando.
// A Central usa para listar a quem transferir (wa/lib/central.ts
// equipeDoEscopo); o push usa para não avisar quem já saiu (wa/lib/push.ts).
//
// Mesma regra de wa/lib/store.ts membershipFor: a equipe cadastrada mais quem
// entra por direito (usuários da concessionária, o lojista titular e os
// sub-usuários dele). CNV: os usuários do painel (wa_admins) e os
// administradores da zerokm, que sempre entram (wa/lib/panel-role.ts).

import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Invite from "@/models/Invite";
import { WaAdmin } from "@wa/models/panel";
import type { IWaStore } from "@wa/models/store";
import { getStore } from "@wa/lib/store";
import { ADMIN_PROFILES } from "@wa/lib/panel-role";

export type MembroDaLoja = { email: string; name: string | null; role: "gestor" | "atendente" };

/** Teto de leitura por fonte: é a equipe de uma loja, não a base inteira. */
const TETO = 500;

/** Equipe da loja, sem repetir e-mail (a primeira fonte que trouxe vale). */
export async function membrosDaLoja(store: IWaStore): Promise<MembroDaLoja[]> {
  await dbConnect();
  const porEmail = new Map<string, MembroDaLoja>();
  const add = (email: string | null | undefined, name: string | null | undefined, role: MembroDaLoja["role"]) => {
    const e = email?.toLowerCase().trim();
    if (!e || porEmail.has(e)) return;
    porEmail.set(e, { email: e, name: name?.trim() || null, role });
  };

  if (store.kind === "concessionaria" && store.concessionariaId) {
    const users = await User.find({
      dealershipId: String(store.concessionariaId),
      allowedProfiles: { $in: ["concessionaria", "dealership"] },
    })
      .select("email displayName")
      .limit(TETO)
      .lean();
    for (const u of users) add(u.email, u.displayName, "gestor");
  }
  if (store.kind === "lojista" && store.ownerUserId) {
    const dono = await User.findById(store.ownerUserId).select("email displayName").lean();
    if (dono) add(dono.email, dono.displayName, "gestor");
    const convites = await Invite.find({ inviterId: store.ownerUserId, status: "accepted" })
      .select("inviteeUserId")
      .limit(TETO)
      .lean();
    const ids = convites.map((c) => c.inviteeUserId).filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (ids.length) {
      const subs = await User.find({ _id: { $in: ids } }).select("email displayName").lean();
      for (const u of subs) add(u.email, u.displayName, "atendente");
    }
  }
  for (const m of store.members ?? []) add(m.email, m.name, m.role);
  return [...porEmail.values()];
}

/**
 * E-mails de quem é da equipe agora (minúsculos). Loja que não existe mais:
 * conjunto vazio, ninguém é da equipe dela.
 */
export async function emailsDaEquipe(tenantId: string | null): Promise<Set<string>> {
  await dbConnect();
  if (!tenantId) {
    const [admins, daZerokm] = await Promise.all([
      WaAdmin.find().select("email").lean(),
      User.find({ allowedProfiles: { $in: ADMIN_PROFILES } }).select("email").limit(TETO).lean(),
    ]);
    return new Set(
      [...admins, ...daZerokm].map((a) => a.email?.toLowerCase().trim()).filter((e): e is string => Boolean(e)),
    );
  }
  const store = await getStore(tenantId);
  if (!store) return new Set();
  return new Set((await membrosDaLoja(store)).map((m) => m.email));
}
