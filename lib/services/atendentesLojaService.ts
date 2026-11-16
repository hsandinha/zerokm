import { randomInt } from 'crypto';
import mongoose from 'mongoose';
import { adminAuth } from '@/lib/firebase-admin';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';
import {
    ehAtendenteDaLoja, gerarSenhaProvisoria, limiteDeAtendentes, msgLimiteAtingido, normalizarLimite,
    recusaDeEmailEmUso, temVagaDeAtendente, validarAtendente, LIMITE_ATENDENTES_MAXIMO,
} from '@/lib/utils/atendentesLoja';

/**
 * Atendentes de uma concessionária: logins próprios ligados à mesma loja por
 * `dealershipId`, com `papelLoja: 'atendente'`. Mesmo desenho dos convidados do
 * lojista (senha provisória mostrada a quem cadastra e troca no primeiro
 * acesso), sem o Invite: o convite do lojista carrega mensalidade por tela e
 * herança de assinatura, que a concessionária não tem.
 *
 * Toda função recebe a concessionária JÁ resolvida pela rota (a do titular
 * logado, ou a que a equipe do CNV escolheu) e só toca em usuário que seja
 * atendente dela: um id de outra loja, ou do titular, não é encontrado.
 */

export type AtendenteDaLoja = {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    ativo: boolean;
    ultimoAcesso: string | null;
    criadoEm: string | null;
};

export type Resultado<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const erro = (status: number, error: string) => ({ ok: false as const, status, error });

const filtroAtendentes = (concessionariaId: string) => ({ dealershipId: concessionariaId, papelLoja: 'atendente' as const });
const filtroAtivos = (concessionariaId: string) => ({ ...filtroAtendentes(concessionariaId), atendenteInativo: { $ne: true } });

async function lojaOu404(concessionariaId: string) {
    if (!mongoose.isValidObjectId(concessionariaId)) return null;
    return Concessionaria.findById(concessionariaId).select('_id nome razaoSocial limiteAtendentes').lean() as Promise<any>;
}

/** Atendente desta loja, pelo _id do usuário. Titular e usuário de outra loja não voltam. */
async function atendenteDaLoja(concessionariaId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) return null;
    const usuario = await User.findOne({ _id: id, ...filtroAtendentes(concessionariaId) });
    return usuario && ehAtendenteDaLoja(usuario, concessionariaId) ? usuario : null;
}

function serializar(u: any, ultimoAcesso: string | null = null): AtendenteDaLoja {
    return {
        id: String(u._id),
        nome: u.displayName || u.email,
        email: u.email,
        telefone: u.phoneNumber || '',
        ativo: u.atendenteInativo !== true,
        ultimoAcesso,
        criadoEm: u.createdAt ? new Date(u.createdAt).toISOString() : null,
    };
}

/** Derruba a sessão aberta: o token único deixa de casar (lib/services/userService.ts validateUserSession). */
async function derrubarSessao(usuario: { _id: mongoose.Types.ObjectId | string; firebaseUid?: string }) {
    await User.updateOne({ _id: usuario._id }, { $unset: { currentSessionToken: '' } });
    if (usuario.firebaseUid) await adminAuth.revokeRefreshTokens(usuario.firebaseUid).catch(() => undefined);
}

export async function listarAtendentes(concessionariaId: string): Promise<Resultado<{
    concessionaria: { id: string; nome: string };
    atendentes: AtendenteDaLoja[];
    titulares: { id: string; nome: string; email: string }[];
    limite: number;
    ativos: number;
}>> {
    const loja = await lojaOu404(concessionariaId);
    if (!loja) return erro(404, 'Concessionária não encontrada.');

    const usuarios = await User.find({ dealershipId: concessionariaId })
        .select('_id firebaseUid email displayName phoneNumber papelLoja atendenteInativo createdAt')
        .sort({ displayName: 1 })
        .limit(LIMITE_ATENDENTES_MAXIMO + 50)
        .lean() as any[];

    const atendentes: AtendenteDaLoja[] = [];
    const titulares: { id: string; nome: string; email: string }[] = [];
    for (const u of usuarios) {
        if (!ehAtendenteDaLoja(u, concessionariaId)) {
            titulares.push({ id: String(u._id), nome: u.displayName || u.email, email: u.email });
            continue;
        }
        // O último acesso só existe no Firebase Auth. Falha de leitura não derruba a lista.
        const registro = u.firebaseUid ? await adminAuth.getUser(u.firebaseUid).catch(() => null) : null;
        const acesso = registro?.metadata?.lastSignInTime;
        atendentes.push(serializar(u, acesso ? new Date(acesso).toISOString() : null));
    }

    return {
        ok: true,
        concessionaria: { id: String(loja._id), nome: loja.nome || loja.razaoSocial || 'Concessionária' },
        atendentes,
        titulares,
        limite: limiteDeAtendentes(loja),
        ativos: atendentes.filter(a => a.ativo).length,
    };
}

export async function criarAtendente(
    concessionariaId: string,
    body: unknown,
    criadoPor?: string | null,
): Promise<Resultado<{ atendente: AtendenteDaLoja; senhaProvisoria: string }>> {
    const loja = await lojaOu404(concessionariaId);
    if (!loja) return erro(404, 'Concessionária não encontrada.');

    const valido = validarAtendente(body as any);
    if (!valido.ok) return erro(400, valido.error);
    const { nome, email, telefone } = valido.dados;

    const limite = limiteDeAtendentes(loja);
    if (!temVagaDeAtendente(await User.countDocuments(filtroAtivos(concessionariaId)), limite)) {
        return erro(409, msgLimiteAtingido(limite));
    }

    const recusa = recusaDeEmailEmUso(
        await User.findOne({ email }).select('dealershipId papelLoja allowedProfiles').lean() as any,
        concessionariaId,
    );
    if (recusa) return erro(409, recusa);

    const senhaProvisoria = gerarSenhaProvisoria(randomInt);
    let registro;
    try {
        registro = await adminAuth.createUser({ email, password: senhaProvisoria, displayName: nome, emailVerified: true, disabled: false });
    } catch (e: any) {
        if (e?.code === 'auth/email-already-exists') {
            return erro(409, 'Este e-mail já tem login no CNV. Use outro e-mail para o atendente.');
        }
        if (e?.code === 'auth/invalid-email') return erro(400, 'E-mail inválido.');
        throw e;
    }

    let criado: any;
    try {
        criado = await User.create({
            firebaseUid: registro.uid,
            email,
            displayName: nome,
            phoneNumber: telefone || undefined,
            allowedProfiles: ['concessionaria'],
            defaultProfile: 'concessionaria',
            dealershipId: concessionariaId,
            papelLoja: 'atendente',
            atendenteInativo: false,
            atendenteCriadoPor: criadoPor || undefined,
            forcePasswordChange: true,
        });
    } catch (e) {
        // Sem o documento no banco o login ficaria órfão no Firebase, prendendo o e-mail.
        await adminAuth.deleteUser(registro.uid).catch(() => undefined);
        throw e;
    }

    // Dois cadastros ao mesmo tempo passam juntos pela contagem: quem estourou o limite sai.
    if (await User.countDocuments(filtroAtivos(concessionariaId)) > limite) {
        await User.deleteOne({ _id: criado._id });
        await adminAuth.deleteUser(registro.uid).catch(() => undefined);
        return erro(409, msgLimiteAtingido(limite));
    }

    return { ok: true, atendente: serializar(criado), senhaProvisoria };
}

/** Nome e telefone. O e-mail é o login: para trocar, remova e cadastre de novo. */
export async function editarAtendente(concessionariaId: string, id: string, body: unknown): Promise<Resultado<{ atendente: AtendenteDaLoja }>> {
    const usuario = await atendenteDaLoja(concessionariaId, id);
    if (!usuario) return erro(404, 'Atendente não encontrado nesta concessionária.');

    const valido = validarAtendente(body as any, { exigirEmail: false });
    if (!valido.ok) return erro(400, valido.error);
    const { nome, telefone } = valido.dados;

    await User.updateOne(
        { _id: usuario._id },
        // profileVersion: a sessão aberta do atendente relê o nome (lib/authOptions.ts).
        telefone
            ? { $set: { displayName: nome, phoneNumber: telefone }, $inc: { profileVersion: 1 } }
            : { $set: { displayName: nome }, $unset: { phoneNumber: '' }, $inc: { profileVersion: 1 } },
    );
    if (usuario.firebaseUid) await adminAuth.updateUser(usuario.firebaseUid, { displayName: nome }).catch(() => undefined);
    usuario.displayName = nome;
    usuario.phoneNumber = telefone || undefined;
    return { ok: true, atendente: serializar(usuario) };
}

/** Desativar bloqueia o login, derruba a sessão e libera a vaga. Reativar passa pelo limite. */
export async function definirSituacaoDoAtendente(concessionariaId: string, id: string, ativo: boolean): Promise<Resultado<{ atendente: AtendenteDaLoja }>> {
    const usuario = await atendenteDaLoja(concessionariaId, id);
    if (!usuario) return erro(404, 'Atendente não encontrado nesta concessionária.');

    if (ativo) {
        if (usuario.atendenteInativo === true) {
            const loja = await lojaOu404(concessionariaId);
            const limite = limiteDeAtendentes(loja);
            if (!temVagaDeAtendente(await User.countDocuments(filtroAtivos(concessionariaId)), limite)) {
                return erro(409, msgLimiteAtingido(limite));
            }
        }
        if (usuario.firebaseUid) await adminAuth.updateUser(usuario.firebaseUid, { disabled: false });
        await User.updateOne({ _id: usuario._id }, { $set: { atendenteInativo: false } });
        usuario.atendenteInativo = false;
        return { ok: true, atendente: serializar(usuario) };
    }

    // Primeiro o banco: a partir daqui nenhuma rota da loja atende este usuário.
    await User.updateOne({ _id: usuario._id }, { $set: { atendenteInativo: true }, $unset: { currentSessionToken: '' } });
    if (usuario.firebaseUid) await adminAuth.updateUser(usuario.firebaseUid, { disabled: true });
    await derrubarSessao(usuario);
    usuario.atendenteInativo = true;
    return { ok: true, atendente: serializar(usuario) };
}

/** Apaga o login do atendente (Firebase e banco). O e-mail fica livre para um novo cadastro. */
export async function removerAtendente(concessionariaId: string, id: string): Promise<Resultado<{ email: string }>> {
    const usuario = await atendenteDaLoja(concessionariaId, id);
    if (!usuario) return erro(404, 'Atendente não encontrado nesta concessionária.');

    // Corta o acesso antes de apagar: se o Firebase falhar no meio, o atendente já não opera a loja.
    await User.updateOne({ _id: usuario._id }, { $set: { atendenteInativo: true }, $unset: { currentSessionToken: '' } });
    if (usuario.firebaseUid) {
        try {
            await adminAuth.deleteUser(usuario.firebaseUid);
        } catch (e: any) {
            if (e?.code !== 'auth/user-not-found') throw e;
        }
    }
    await User.deleteOne({ _id: usuario._id });
    return { ok: true, email: usuario.email };
}

/** Campo do admin: quantos atendentes ativos a loja pode ter. Não desativa quem já existe. */
export async function definirLimiteDeAtendentes(concessionariaId: string, valor: unknown): Promise<Resultado<{ limite: number }>> {
    const limite = normalizarLimite(valor);
    if (limite === null) return erro(400, `Informe um limite entre 0 e ${LIMITE_ATENDENTES_MAXIMO}.`);
    if (!mongoose.isValidObjectId(concessionariaId)) return erro(404, 'Concessionária não encontrada.');
    const r = await Concessionaria.updateOne({ _id: concessionariaId }, { $set: { limiteAtendentes: limite } });
    if (!r.matchedCount) return erro(404, 'Concessionária não encontrada.');
    return { ok: true, limite };
}

/**
 * Lojas antigas têm dois ou três logins, todos titulares (o campo não existia).
 * A equipe do CNV rebaixa os que são atendentes, ou devolve a titularidade.
 * Sempre sobra pelo menos um titular.
 */
export async function definirPapelNaLoja(concessionariaId: string, id: string, papel: 'titular' | 'atendente'): Promise<Resultado<{ papel: 'titular' | 'atendente' }>> {
    if (!mongoose.isValidObjectId(id)) return erro(404, 'Usuário não encontrado nesta concessionária.');
    const usuario = await User.findOne({ _id: id, dealershipId: concessionariaId });
    if (!usuario) return erro(404, 'Usuário não encontrado nesta concessionária.');
    const atual = ehAtendenteDaLoja(usuario, concessionariaId) ? 'atendente' : 'titular';
    if (atual === papel) return { ok: true, papel };

    if (papel === 'atendente') {
        const titulares = await User.countDocuments({ dealershipId: concessionariaId, papelLoja: { $ne: 'atendente' } });
        if (titulares <= 1) return erro(409, 'A concessionária precisa de pelo menos um titular.');
        const loja = await lojaOu404(concessionariaId);
        const limite = limiteDeAtendentes(loja);
        if (!temVagaDeAtendente(await User.countDocuments(filtroAtivos(concessionariaId)), limite)) {
            return erro(409, msgLimiteAtingido(limite));
        }
        await User.updateOne({ _id: usuario._id }, { $set: { papelLoja: 'atendente', atendenteInativo: false } });
        return { ok: true, papel };
    }

    if (usuario.atendenteInativo === true) return erro(409, 'Reative o atendente antes de torná-lo titular.');
    await User.updateOne({ _id: usuario._id }, { $set: { papelLoja: 'titular' }, $unset: { atendenteInativo: '' } });
    return { ok: true, papel };
}
