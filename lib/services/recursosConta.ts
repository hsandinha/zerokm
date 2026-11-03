import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';
import Invite from '@/models/Invite';
import { lerRecursos, type Recurso, type Recursos, type TipoConta } from '@/lib/recursos';

/**
 * De qual conta saem as funcionalidades de quem está logado (lib/recursos.ts):
 *   usuário de concessionária → a concessionária;
 *   sub-usuário de lojista (convite aceito) → o lojista titular;
 *   lojista → ele mesmo.
 * Equipe do CNV não tem conta de cliente: `null`, e nada é bloqueado.
 */
export type ContaDosRecursos = { tipo: TipoConta; id: string };

const PERFIS_CONCESSIONARIA = ['concessionaria', 'dealership'];
const PERFIS_LOJISTA = ['cliente', 'gratis'];

/** `perfis`: os perfis com que a pessoa está usando o sistema agora. */
export async function contaDoUsuario(email: string, perfis: string[]): Promise<ContaDosRecursos | null> {
    if (!perfis.some(p => PERFIS_CONCESSIONARIA.includes(p) || PERFIS_LOJISTA.includes(p))) return null;
    await dbConnect();
    const doc = await User.findOne({ email: email.toLowerCase() }).select('_id dealershipId').lean();
    if (!doc) return null;

    if (perfis.some(p => PERFIS_CONCESSIONARIA.includes(p)) && doc.dealershipId && mongoose.isValidObjectId(doc.dealershipId)) {
        return { tipo: 'concessionaria', id: String(doc.dealershipId) };
    }
    if (perfis.some(p => PERFIS_LOJISTA.includes(p))) {
        const convite = await Invite.findOne({ inviteeUserId: doc._id, status: 'accepted' }).select('inviterId').lean();
        return { tipo: 'lojista', id: String(convite?.inviterId ?? doc._id) };
    }
    return null;
}

/** O que está gravado na conta, já resolvido (padrões e dependências). */
export async function recursosDaConta(conta: ContaDosRecursos): Promise<Recursos> {
    await dbConnect();
    const bruto = conta.tipo === 'concessionaria'
        ? (await Concessionaria.findById(conta.id).select('recursos').lean())?.recursos
        : (await User.findById(conta.id).select('recursos').lean())?.recursos;
    return lerRecursos(bruto, conta.tipo);
}

/** Funcionalidades de quem está logado. `null` = equipe do CNV (tudo liberado). */
export async function recursosDoUsuario(email: string, perfis: string[]): Promise<{ conta: ContaDosRecursos; recursos: Recursos } | null> {
    const conta = await contaDoUsuario(email, perfis);
    if (!conta) return null;
    return { conta, recursos: await recursosDaConta(conta) };
}

/** Atalho para as rotas do painel: a sessão pode usar este recurso? Vale o
 *  perfil com que a pessoa entrou: um administrador que também é cliente
 *  continua sendo equipe do CNV no painel de admin. */
export async function sessaoPodeUsar(
    session: { user?: { email?: string | null; profile?: string; allowedProfiles?: string[] } } | null,
    recurso: Recurso,
): Promise<boolean> {
    const email = session?.user?.email;
    if (!email) return false;
    const perfis = session.user?.profile ? [session.user.profile] : (session.user?.allowedProfiles ?? []);
    const r = await recursosDoUsuario(email, perfis);
    return !r || r.recursos[recurso];
}
