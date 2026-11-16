/**
 * Equipe da concessionária: o titular (gestor) e os atendentes.
 *
 * Todo usuário com `dealershipId` enxerga a mesma loja (estoque, repasse,
 * banners, métricas). O que muda é o papel: o atendente faz o dia a dia, mas
 * não gerencia atendentes, não vê nem paga cobrança/plano e não altera os dados
 * cadastrais da loja. Usuário antigo, sem o campo, é titular.
 *
 * Arquivo puro (sem banco): usado pelo servidor, pela tela e pelos testes.
 * Quem lê o banco é lib/services/acessoLoja.ts e atendentesLojaService.ts.
 */

export type PapelLoja = 'titular' | 'atendente';

/** O que só o titular faz. O resto (estoque, preços, repasse, atendimento) é de todos. */
export type AcaoDoTitular = 'gerenciar-atendentes' | 'cobranca' | 'dados-cadastrais' | 'integracoes';

export const LIMITE_ATENDENTES_PADRAO = 5;
/** Teto do campo configurável pelo admin: é a equipe de uma loja, não uma base de usuários. */
export const LIMITE_ATENDENTES_MAXIMO = 50;

export const PERFIS_DA_LOJA = ['concessionaria', 'dealership'];
/** Equipe do CNV que cadastra atendentes de qualquer loja (a mesma que gerencia usuários). */
export const PERFIS_QUE_GERENCIAM_ATENDENTES = ['admin', 'administrador', 'administrativo'];

export const MSG_SO_TITULAR = 'Somente o titular da concessionária pode fazer isso.';
export const MSG_ACESSO_DESATIVADO = 'Seu acesso a esta concessionária foi desativado.';

type UsuarioDaLoja = {
    dealershipId?: unknown;
    papelLoja?: string | null;
    atendenteInativo?: boolean | null;
    allowedProfiles?: string[] | null;
};

export function papelDoUsuario(usuario: Pick<UsuarioDaLoja, 'papelLoja'> | null | undefined): PapelLoja {
    return usuario?.papelLoja === 'atendente' ? 'atendente' : 'titular';
}

/** O atendente não faz nada do que é reservado ao titular. */
export function podeNaLoja(papel: PapelLoja, _acao: AcaoDoTitular): boolean {
    return papel === 'titular';
}

/** Atendente desativado não opera a loja, mesmo com sessão ainda aberta. */
export function acessoLiberado(usuario: Pick<UsuarioDaLoja, 'papelLoja' | 'atendenteInativo'> | null | undefined): boolean {
    if (!usuario) return false;
    return !(papelDoUsuario(usuario) === 'atendente' && usuario.atendenteInativo === true);
}

export function ehPerfilDaLoja(perfil: string | null | undefined): boolean {
    return Boolean(perfil && PERFIS_DA_LOJA.includes(perfil));
}

/**
 * De qual concessionária esta pessoa gerencia os atendentes.
 *  - equipe do CNV: a que pedir (`concessionariaPedida`);
 *  - titular: sempre a dele, o id pedido é ignorado;
 *  - atendente e qualquer outro perfil: nenhuma.
 */
export function lojaQueGerencia(quem: {
    perfil?: string | null;
    usuario?: UsuarioDaLoja | null;
    concessionariaPedida?: string | null;
}): { ok: true; concessionariaId: string; comoEquipeCnv: boolean } | { ok: false; status: number; error: string } {
    const perfil = quem.perfil || '';
    if (PERFIS_QUE_GERENCIAM_ATENDENTES.includes(perfil)) {
        const id = (quem.concessionariaPedida || '').trim();
        if (!id) return { ok: false, status: 400, error: 'Informe a concessionária.' };
        return { ok: true, concessionariaId: id, comoEquipeCnv: true };
    }
    if (ehPerfilDaLoja(perfil)) {
        const u = quem.usuario;
        if (!u?.dealershipId) return { ok: false, status: 404, error: 'Usuário não associado a uma concessionária.' };
        if (!acessoLiberado(u)) return { ok: false, status: 403, error: MSG_ACESSO_DESATIVADO };
        if (!podeNaLoja(papelDoUsuario(u), 'gerenciar-atendentes')) return { ok: false, status: 403, error: MSG_SO_TITULAR };
        return { ok: true, concessionariaId: String(u.dealershipId), comoEquipeCnv: false };
    }
    return { ok: false, status: 403, error: 'Acesso negado.' };
}

/** O usuário é atendente DESTA loja? Só assim ele pode ser editado, desativado ou removido por aqui. */
export function ehAtendenteDaLoja(usuario: UsuarioDaLoja | null | undefined, concessionariaId: unknown): boolean {
    if (!usuario?.dealershipId || !concessionariaId) return false;
    return String(usuario.dealershipId) === String(concessionariaId) && papelDoUsuario(usuario) === 'atendente';
}

/** Limite gravado na concessionária; sem o campo (ou inválido), o padrão. */
export function limiteDeAtendentes(concessionaria: { limiteAtendentes?: unknown } | null | undefined): number {
    const bruto = concessionaria?.limiteAtendentes;
    if (typeof bruto !== 'number' || !Number.isFinite(bruto) || bruto < 0) return LIMITE_ATENDENTES_PADRAO;
    return Math.min(Math.floor(bruto), LIMITE_ATENDENTES_MAXIMO);
}

/** Valor do campo do admin, já validado. `null` = inválido. */
export function normalizarLimite(valor: unknown): number | null {
    if (valor === '' || valor === null || valor === undefined || typeof valor === 'boolean') return null;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 0 || n > LIMITE_ATENDENTES_MAXIMO) return null;
    return n;
}

/** Só os ativos ocupam vaga: desativar libera, reativar passa pela mesma conta. */
export function temVagaDeAtendente(ativos: number, limite: number): boolean {
    return ativos < limite;
}

export function msgLimiteAtingido(limite: number): string {
    if (limite === 0) return 'Esta concessionária não tem atendentes liberados. Fale com o CNV.';
    return `Limite de ${limite} ${limite === 1 ? 'atendente ativo' : 'atendentes ativos'} atingido. Desative ou remova um atendente, ou peça ao CNV para aumentar o limite.`;
}

const ROTULO_PERFIL: Record<string, string> = {
    admin: 'administrador', administrador: 'administrador', administrativo: 'administrativo', gerente: 'gerente',
    operador: 'operador', operator: 'operador', vendedor: 'vendedor', marketing: 'marketing',
    concessionaria: 'concessionária', dealership: 'concessionária', cliente: 'lojista', gratis: 'lojista',
};

/**
 * O e-mail do atendente novo não pode existir em nenhum outro cadastro: um
 * login com dois perfis abriria o painel de outra área para o atendente.
 * Devolve a mensagem de recusa, ou `null` quando o e-mail está livre.
 */
export function recusaDeEmailEmUso(existente: UsuarioDaLoja | null | undefined, concessionariaId: unknown): string | null {
    if (!existente) return null;
    if (existente.dealershipId && String(existente.dealershipId) === String(concessionariaId)) {
        return papelDoUsuario(existente) === 'atendente'
            ? 'Este e-mail já é de um atendente desta concessionária.'
            : 'Este e-mail já é do titular desta concessionária.';
    }
    if (existente.dealershipId) return 'Este e-mail já é usuário de outra concessionária. Use outro e-mail para o atendente.';
    const perfil = (existente.allowedProfiles || []).map(p => ROTULO_PERFIL[p]).find(Boolean);
    return `Este e-mail já tem cadastro no CNV${perfil ? ` com o perfil ${perfil}` : ''}. Use outro e-mail para o atendente.`;
}

export type DadosDoAtendente = { nome: string; email: string; telefone: string };

/** Limpa e valida o formulário. `exigirEmail: false` na edição (o e-mail é o login e não muda). */
export function validarAtendente(
    body: { nome?: unknown; email?: unknown; telefone?: unknown } | null | undefined,
    opts: { exigirEmail: boolean } = { exigirEmail: true },
): { ok: true; dados: DadosDoAtendente } | { ok: false; error: string } {
    const nome = String(body?.nome ?? '').trim().replace(/\s+/g, ' ');
    const email = String(body?.email ?? '').trim().toLowerCase();
    const telefone = String(body?.telefone ?? '').replace(/\D/g, '');
    if (nome.length < 2) return { ok: false, error: 'Informe o nome do atendente.' };
    if (nome.length > 80) return { ok: false, error: 'O nome pode ter até 80 caracteres.' };
    if (opts.exigirEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'E-mail inválido.' };
    if (telefone && (telefone.length < 10 || telefone.length > 13)) {
        return { ok: false, error: 'Telefone inválido. Informe DDD e número.' };
    }
    return { ok: true, dados: { nome, email, telefone } };
}

/** Nome de quem mexeu, para "atualizado por". Cai no e-mail quando não há nome. */
export function nomeDeQuemAtualizou(usuario: { name?: string | null; email?: string | null } | null | undefined): string | undefined {
    const nome = usuario?.name?.trim();
    if (nome) return nome.slice(0, 80);
    return usuario?.email?.trim() || undefined;
}

/**
 * Trava das rotas reservadas ao titular (cobrança, plano, dados cadastrais,
 * integrações). Só olha o perfil concessionária: os outros perfis seguem a
 * regra que a rota já tinha. Devolve a recusa, ou `null` quando pode seguir.
 */
export function recusaDoTitular(
    perfil: string | null | undefined,
    usuario: UsuarioDaLoja | null | undefined,
    acao: AcaoDoTitular,
): { status: number; error: string } | null {
    if (!ehPerfilDaLoja(perfil)) return null;
    if (!usuario?.dealershipId) return { status: 403, error: 'Usuário não associado a uma concessionária.' };
    if (!acessoLiberado(usuario)) return { status: 403, error: MSG_ACESSO_DESATIVADO };
    if (!podeNaLoja(papelDoUsuario(usuario), acao)) return { status: 403, error: MSG_SO_TITULAR };
    return null;
}

/** Senha provisória no mesmo formato da dos convidados (app/api/user/invite): "CNV@" + 6 caracteres sem ambíguos. */
export function gerarSenhaProvisoria(sortear: (max: number) => number = max => Math.floor(Math.random() * max)): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let senha = 'CNV@';
    for (let i = 0; i < 6; i++) senha += chars[sortear(chars.length)];
    return senha;
}
