/**
 * O que cada perfil da equipe faz na ficha da concessionária. Espelha as regras
 * que as rotas já aplicam (a tela só esconde o que o servidor recusaria):
 *  - marcas: app/api/concessionarias/[id]/catalog-brand
 *  - login e atendentes: app/dashboard/admin/users/actions.ts e lib/utils/atendentesLoja.ts
 *  - plano de repasse, atendimento, funcionalidades e vitrine: só administrador
 *  - boleto para a loja: lib/utils/cobrancaConcessionaria.ts
 *  - cobranças: app/api/admin/cobrancas (sem gerente e sem vendedor)
 *  - estoque: lib/services/dealershipScope.ts (sem vendedor)
 *
 * Arquivo puro: usado pela rota da ficha e pelos testes.
 */

export const PERFIS_DA_EQUIPE = ['admin', 'administrador', 'gerente', 'operador', 'operator', 'vendedor', 'administrativo'] as const;

export type PermissoesDaFicha = {
    editarDados: boolean;
    trocarOperador: boolean;
    editarMarcas: boolean;
    gerirAcessos: boolean;
    ativarPlanos: boolean;
    emitirBoleto: boolean;
    liberarRecursos: boolean;
    verCobrancas: boolean;
    verEstoque: boolean;
};

const em = (perfil: string, ...lista: string[]) => lista.includes(perfil);

export function ehPerfilDaEquipe(perfil: string | null | undefined): boolean {
    return Boolean(perfil && (PERFIS_DA_EQUIPE as readonly string[]).includes(perfil));
}

export function permissoesDaFicha(perfil: string | null | undefined): PermissoesDaFicha | null {
    if (!perfil || !ehPerfilDaEquipe(perfil)) return null;
    const administrador = em(perfil, 'admin', 'administrador');
    return {
        // A rota de cadastro aceita toda a equipe (o vendedor já editava a carteira dele).
        editarDados: true,
        trocarOperador: administrador || em(perfil, 'gerente', 'administrativo'),
        editarMarcas: perfil !== 'vendedor',
        gerirAcessos: administrador || perfil === 'administrativo',
        ativarPlanos: administrador,
        emitirBoleto: administrador || perfil === 'administrativo',
        liberarRecursos: administrador,
        verCobrancas: administrador || em(perfil, 'administrativo', 'operador', 'operator'),
        verEstoque: perfil !== 'vendedor',
    };
}
