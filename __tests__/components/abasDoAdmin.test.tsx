import { describe, expect, it } from 'vitest';
import { ABAS_ADMIN, ABAS_CONCESSIONARIA, abasDoAdmin } from '../../components/dashboard/abas-dos-paineis';

/** Cada grupo aparece num bloco só: se uma aba ficar fora do lugar, o título do grupo repete no menu. */
function gruposContiguos(abas: Array<{ grupo?: string }>) {
    const vistos: string[] = [];
    let anterior: string | undefined;
    for (const aba of abas) {
        if (aba.grupo && aba.grupo !== anterior) {
            if (vistos.includes(aba.grupo)) return false;
            vistos.push(aba.grupo);
        }
        anterior = aba.grupo;
    }
    return true;
}

describe('ordem do menu lateral', () => {
    it('a Administração tem cada grupo num bloco só, com Visão geral no topo', () => {
        expect(ABAS_ADMIN[0].id).toBe('visao-geral');
        expect(ABAS_ADMIN[0].grupo).toBeUndefined();
        expect(gruposContiguos(ABAS_ADMIN)).toBe(true);
        expect(ABAS_ADMIN.slice(1).every(a => a.grupo)).toBe(true);
    });

    it('os perfis com menu reduzido continuam com os grupos em bloco', () => {
        for (const perfil of ['gerente', 'marketing', 'administrador']) {
            expect(gruposContiguos(abasDoAdmin(perfil))).toBe(true);
        }
        expect(abasDoAdmin('marketing').map(a => a.id)).toEqual(['funil', 'integracoes']);
    });

    it('a concessionária também', () => {
        expect(gruposContiguos(ABAS_CONCESSIONARIA)).toBe(true);
    });

    it('não perde nenhuma tela ao reorganizar', () => {
        expect(ABAS_ADMIN.map(a => a.id).sort()).toEqual([
            'avisos', 'banners', 'catalogo', 'cobrancas', 'concessionarias', 'configuracoes', 'crm', 'estoque-concessionarias',
            'funcionalidades', 'funil', 'integracoes', 'planos', 'transportadoras', 'usuarios', 'veiculos', 'visao-geral', 'whatsapp',
        ]);
    });
});
