// Loja do atendimento (WaStore): quem é dono, quem opera e o que ela pode.
//
// A loja nasce sozinha no primeiro acesso de quem tem direito a ela — o
// usuário da concessionária ou o lojista titular —, já com o período de teste,
// desde que o CNV tenha liberado o atendimento para a conta (lib/recursos.ts).
// Antes disso ela não é criada: o teste só começa a contar depois de liberado.

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Concessionaria from "@/models/Concessionaria";
import Invite from "@/models/Invite";
import { WaStore, type IWaStore, type StoreRole } from "@wa/models/store";
import { recursosDaConta } from "@/lib/services/recursosConta";
import type { Recursos } from "@/lib/recursos";

export const STORE_TRIAL_DAYS = 7;

const DEALERSHIP_PROFILES = ["concessionaria", "dealership"];
const LOJISTA_PROFILES = ["cliente", "gratis"];

export type StoreMembership = { store: IWaStore; role: StoreRole };

/** Loja da concessionária, criada no primeiro acesso. */
export async function storeOfConcessionaria(concessionariaId: string): Promise<IWaStore | null> {
  if (!mongoose.isValidObjectId(concessionariaId)) return null;
  await dbConnect();
  const existing = await WaStore.findOne({ concessionariaId });
  if (existing) return existing;
  if (!(await recursosDaConta({ tipo: "concessionaria", id: concessionariaId })).atendimento) return null;
  const c = await Concessionaria.findById(concessionariaId).select("nome razaoSocial").lean();
  if (!c) return null;
  return createStore({
    kind: "concessionaria",
    concessionariaId: new mongoose.Types.ObjectId(concessionariaId),
    name: c.nome || c.razaoSocial || "Concessionária",
  });
}

/** Loja do lojista titular, criada no primeiro acesso. */
export async function storeOfLojista(ownerUserId: string): Promise<IWaStore | null> {
  if (!mongoose.isValidObjectId(ownerUserId)) return null;
  await dbConnect();
  const existing = await WaStore.findOne({ ownerUserId });
  if (existing) return existing;
  if (!(await recursosDaConta({ tipo: "lojista", id: ownerUserId })).atendimento) return null;
  const u = await User.findById(ownerUserId).select("displayName email").lean();
  if (!u) return null;
  return createStore({
    kind: "lojista",
    ownerUserId: new mongoose.Types.ObjectId(ownerUserId),
    name: u.displayName || u.email,
  });
}

async function createStore(data: Partial<IWaStore>): Promise<IWaStore> {
  try {
    return await WaStore.create({
      ...data,
      trialEndsAt: new Date(Date.now() + STORE_TRIAL_DAYS * 86400_000),
      // Lojista revende a rede do CNV; a concessionária vende o próprio estoque.
      ai: { vendeEstoqueCnv: data.kind === "lojista" },
    });
  } catch (err) {
    // Dois acessos simultâneos criaram juntos: fica o primeiro.
    if ((err as { code?: number })?.code === 11000) {
      const filter = data.concessionariaId
        ? { concessionariaId: data.concessionariaId }
        : { ownerUserId: data.ownerUserId };
      const found = await WaStore.findOne(filter);
      if (found) return found;
    }
    throw err;
  }
}

/**
 * Loja que esta pessoa opera, e com que papel. Ordem:
 *   1. está na equipe de uma loja (convidada pelo gestor) → papel de lá;
 *   2. usuário de concessionária → gestor da loja da concessionária;
 *   3. sub-usuário de um lojista (convite aceito) → atendente da loja dele;
 *   4. lojista titular → gestor da própria loja.
 */
export async function membershipFor(user: {
  email: string;
  profiles: string[];
}): Promise<StoreMembership | null> {
  await dbConnect();
  const email = user.email.toLowerCase();

  const asMember = await WaStore.findOne({ "members.email": email });
  if (asMember) {
    const m = asMember.members.find((x) => x.email === email);
    return { store: asMember, role: m?.role ?? "atendente" };
  }

  const doc = await User.findOne({ email }).select("_id dealershipId allowedProfiles").lean();
  if (!doc) return null;
  const perfis = [...user.profiles, ...(doc.allowedProfiles ?? [])];

  if (perfis.some((p) => DEALERSHIP_PROFILES.includes(p)) && doc.dealershipId) {
    const store = await storeOfConcessionaria(String(doc.dealershipId));
    if (store) return { store, role: "gestor" };
  }

  if (perfis.some((p) => LOJISTA_PROFILES.includes(p))) {
    const invite = await Invite.findOne({ inviteeUserId: doc._id, status: "accepted" })
      .select("inviterId")
      .lean();
    if (invite) {
      const store = await storeOfLojista(String(invite.inviterId));
      if (store) return { store, role: "atendente" };
    }
    const store = await storeOfLojista(String(doc._id));
    if (store) return { store, role: "gestor" };
  }
  return null;
}

/** Assinatura do atendimento em dia (ou ainda no teste). */
export function storeIsActive(store: Pick<IWaStore, "subscription" | "trialEndsAt">): boolean {
  const now = Date.now();
  const sub = store.subscription;
  if (sub?.status === "active" && (!sub.expiresAt || new Date(sub.expiresAt).getTime() > now)) {
    return true;
  }
  return Boolean(store.trialEndsAt && new Date(store.trialEndsAt).getTime() > now);
}

export type StoreAccess = {
  active: boolean;
  trial: boolean;
  trialEndsAt: string | null;
  expiresAt: string | null;
  planName: string | null;
};

export function storeAccess(store: IWaStore): StoreAccess {
  const sub = store.subscription;
  const paid =
    sub?.status === "active" && (!sub.expiresAt || new Date(sub.expiresAt).getTime() > Date.now());
  return {
    active: storeIsActive(store),
    trial: !paid,
    trialEndsAt: store.trialEndsAt ? new Date(store.trialEndsAt).toISOString() : null,
    expiresAt: sub?.expiresAt ? new Date(sub.expiresAt).toISOString() : null,
    planName: sub?.planName ?? null,
  };
}

/** Funcionalidades que o CNV liberou para a conta dona da loja. */
export async function recursosDaLoja(
  store: Pick<IWaStore, "kind" | "concessionariaId" | "ownerUserId">,
): Promise<Recursos> {
  const id = store.kind === "concessionaria" ? store.concessionariaId : store.ownerUserId;
  return recursosDaConta({ tipo: store.kind, id: String(id) });
}

export async function getStore(tenantId: string | null | undefined): Promise<IWaStore | null> {
  if (!tenantId || !mongoose.isValidObjectId(tenantId)) return null;
  await dbConnect();
  return WaStore.findById(tenantId);
}
