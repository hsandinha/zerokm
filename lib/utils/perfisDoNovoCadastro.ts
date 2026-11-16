/**
 * Quem pode abrir cada caminho do "Novo cadastro". A tela só esconde o que o
 * servidor já recusaria; a regra de verdade continua em cada rota:
 *  - lojista: rotas do CRM (/api/admin/crm/**), só administrador;
 *  - equipe interna: canManageUsers (app/dashboard/admin/users/actions.ts);
 *  - concessionária: a tela Concessionárias, aberta a toda a equipe interna
 *    (POST /api/concessionarias). O login da loja é outra permissão:
 *    criarUsuarioDaLoja exige canManageUsers.
 */

export type TipoDeCadastro = 'concessionaria' | 'lojista' | 'equipe';

const PERFIS_CRM = new Set(['admin', 'administrador']);
const PERFIS_GESTAO_DE_USUARIOS = new Set(['admin', 'administrador', 'administrativo']);
const PERFIS_CONCESSIONARIAS = new Set(['admin', 'administrador', 'administrativo', 'gerente', 'operador', 'operator', 'vendedor']);

const ORDEM: TipoDeCadastro[] = ['concessionaria', 'lojista', 'equipe'];

export function podeCadastrar(tipo: TipoDeCadastro, perfil: string | null | undefined): boolean {
    if (!perfil) return false;
    if (tipo === 'lojista') return PERFIS_CRM.has(perfil);
    if (tipo === 'equipe') return PERFIS_GESTAO_DE_USUARIOS.has(perfil);
    return PERFIS_CONCESSIONARIAS.has(perfil);
}

/** Opções do primeiro passo do "Novo cadastro" para o perfil, na ordem da tela. */
export function tiposDeCadastroDoPerfil(perfil: string | null | undefined): TipoDeCadastro[] {
    return ORDEM.filter(tipo => podeCadastrar(tipo, perfil));
}

/** Criar o login da concessionária (criarUsuarioDaLoja) pede gestão de usuários. */
export function podeCriarLoginDeLoja(perfil: string | null | undefined): boolean {
    return !!perfil && PERFIS_GESTAO_DE_USUARIOS.has(perfil);
}

/**
 * Perfis da equipe que o criador não pode conceder. O administrativo gerencia
 * a equipe, mas não cria administrador (mesma restrição da tela Equipe).
 */
export function perfisRestritosDoCriador(perfil: string | null | undefined): string[] {
    return perfil === 'administrativo' ? ['administrador'] : [];
}
