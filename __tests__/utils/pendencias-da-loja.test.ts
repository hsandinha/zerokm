import { describe, expect, it } from 'vitest';
import { diasSemAtualizar, estoqueParado, farolDoEstoque, lojasComPendencia, pendenciasDaLoja, temPendencia, type ResumoDaLoja } from '@/lib/utils/pendenciasDaLoja';
import { permissoesDaFicha } from '@/lib/utils/permissoesDaFicha';

const AGORA = new Date('2026-11-16T12:00:00.000Z');
const ha = (dias: number) => new Date(AGORA.getTime() - dias * 86_400_000).toISOString();
const EM_30_DIAS = new Date(AGORA.getTime() + 30 * 86_400_000).toISOString();

/** Loja sem nada pendente: marca, login, estoque em dia e só 0KM (sem plano, sem repasse). */
const emDia = (over: Partial<ResumoDaLoja> = {}): ResumoDaLoja => ({
    ativo: true,
    marcaIds: ['m1'],
    temLogin: true,
    planoRepasse: { ativo: false, expiresAt: null },
    repassesCadastrados: 0,
    ultimaAtualizacao: ha(3),
    ...over,
});
const ids = (loja: ResumoDaLoja) => pendenciasDaLoja(loja, AGORA).map(p => p.id);

describe('pendências da concessionária', () => {
    it('loja em dia, só com 0KM e sem plano de repasse, não tem pendência', () => {
        expect(ids(emDia())).toEqual([]);
        expect(temPendencia(emDia(), AGORA)).toBe(false);
    });

    it('sem marca: lista vazia e sem a marca única do formato antigo', () => {
        expect(ids(emDia({ marcaIds: [] }))).toEqual(['sem-marca']);
        expect(ids(emDia({ marcaIds: undefined, marcaId: null }))).toEqual(['sem-marca']);
        expect(ids(emDia({ marcaIds: [], marcaId: 'antiga' }))).toEqual([]);
        expect(pendenciasDaLoja(emDia({ marcaIds: [] }), AGORA)[0]).toMatchObject({ rotulo: 'Sem marca', aba: 'marcas' });
    });

    it('sem login só quando o servidor disse que não há titular', () => {
        expect(ids(emDia({ temLogin: false }))).toEqual(['sem-login']);
        // Resposta antiga da API, sem o campo: não inventa pendência.
        expect(ids(emDia({ temLogin: undefined }))).toEqual([]);
    });

    it('sem plano: só quando a falta do plano derruba alguma coisa', () => {
        // Nunca assinou e não tem repasse: o 0KM funciona sem plano.
        expect(ids(emDia({ planoRepasse: null }))).toEqual([]);
        // Repasse cadastrado sem plano: os anúncios estão fora da vitrine.
        const comRepasse = pendenciasDaLoja(emDia({ repassesCadastrados: 2 }), AGORA);
        expect(comRepasse.map(p => p.rotulo)).toEqual(['Sem plano']);
        expect(comRepasse[0].detalhe).toContain('2 anúncios de repasse');
        // Plano vencido: fila de renovação, com ou sem repasse cadastrado.
        const vencido = pendenciasDaLoja(emDia({ planoRepasse: { ativo: false, expiresAt: ha(5) } }), AGORA);
        expect(vencido.map(p => [p.id, p.rotulo, p.aba])).toEqual([['sem-plano', 'Plano vencido', 'planos']]);
        // Plano em dia nunca é pendência.
        expect(ids(emDia({ planoRepasse: { ativo: true, expiresAt: EM_30_DIAS }, repassesCadastrados: 9 }))).toEqual([]);
    });

    it('estoque parado segue o vermelho do farol: sem envio ou mais de 30 dias', () => {
        expect(ids(emDia({ ultimaAtualizacao: ha(30) }))).toEqual([]);
        expect(ids(emDia({ ultimaAtualizacao: ha(31) }))).toEqual(['estoque-parado']);
        expect(ids(emDia({ ultimaAtualizacao: null }))).toEqual(['estoque-parado']);
        expect(pendenciasDaLoja(emDia({ ultimaAtualizacao: null }), AGORA)[0].detalhe).toBe('A loja nunca enviou estoque.');
        // Campo ausente: a regra não foi avaliada.
        expect(ids(emDia({ ultimaAtualizacao: undefined }))).toEqual([]);
    });

    it('loja inativa está pausada: nenhuma pendência', () => {
        expect(ids({ ativo: false, marcaIds: [], temLogin: false, ultimaAtualizacao: null, planoRepasse: { ativo: false, expiresAt: ha(90) } })).toEqual([]);
    });

    it('junta tudo na ordem marca, login, plano, estoque', () => {
        expect(ids({ ativo: true, marcaIds: [], temLogin: false, planoRepasse: { ativo: false, expiresAt: ha(1) }, ultimaAtualizacao: null }))
            .toEqual(['sem-marca', 'sem-login', 'sem-plano', 'estoque-parado']);
    });

    it('filtro "Com pendência" devolve só as lojas com algo a resolver', () => {
        const lojas = [
            { id: 'a', ...emDia() },
            { id: 'b', ...emDia({ marcaIds: [] }) },
            { id: 'c', ...emDia({ ativo: false, marcaIds: [] }) },
            { id: 'd', ...emDia({ ultimaAtualizacao: ha(45) }) },
        ];
        expect(lojasComPendencia(lojas, AGORA).map(l => l.id)).toEqual(['b', 'd']);
    });
});

describe('farol do estoque', () => {
    it('verde até 15 dias, amarelo até 30, vermelho acima ou sem envio', () => {
        expect(farolDoEstoque(ha(0), AGORA)).toEqual({ tone: 'positive', label: 'Hoje' });
        expect(farolDoEstoque(ha(1), AGORA)).toEqual({ tone: 'positive', label: 'Ontem' });
        expect(farolDoEstoque(ha(15), AGORA).tone).toBe('positive');
        expect(farolDoEstoque(ha(16), AGORA)).toEqual({ tone: 'warning', label: 'Há 16 dias' });
        expect(farolDoEstoque(ha(30), AGORA).tone).toBe('warning');
        expect(farolDoEstoque(ha(31), AGORA).tone).toBe('negative');
        expect(farolDoEstoque(null, AGORA)).toEqual({ tone: 'negative', label: 'Sem envio' });
        expect(diasSemAtualizar('data inválida', AGORA)).toBeNull();
        expect(estoqueParado(ha(30), AGORA)).toBe(false);
        expect(estoqueParado(undefined, AGORA)).toBe(true);
    });
});

describe('permissões da ficha por perfil', () => {
    it('quem não é da equipe não abre a ficha', () => {
        for (const perfil of ['concessionaria', 'dealership', 'cliente', 'gratis', 'marketing', '', undefined, null]) {
            expect(permissoesDaFicha(perfil)).toBeNull();
        }
    });

    it('administrador faz tudo', () => {
        for (const perfil of ['admin', 'administrador']) {
            expect(Object.values(permissoesDaFicha(perfil)!).every(Boolean)).toBe(true);
        }
    });

    it('administrativo cuida de acessos e boleto, mas não ativa plano nem libera funcionalidade', () => {
        expect(permissoesDaFicha('administrativo')).toMatchObject({
            gerirAcessos: true, emitirBoleto: true, verCobrancas: true, verEstoque: true, ativarPlanos: false, liberarRecursos: false,
        });
    });

    it('gerente não vê cobrança nem gerencia acessos', () => {
        expect(permissoesDaFicha('gerente')).toMatchObject({
            editarMarcas: true, trocarOperador: true, verEstoque: true, gerirAcessos: false, verCobrancas: false, ativarPlanos: false, emitirBoleto: false,
        });
    });

    it('operador vê cobranças e estoque, sem trocar o operador da loja', () => {
        expect(permissoesDaFicha('operador')).toMatchObject({
            editarMarcas: true, verCobrancas: true, verEstoque: true, trocarOperador: false, gerirAcessos: false, emitirBoleto: false,
        });
    });

    it('vendedor só consulta: sem marcas, acessos, planos, cobranças e estoque', () => {
        expect(permissoesDaFicha('vendedor')).toEqual({
            editarDados: true, trocarOperador: false, editarMarcas: false, gerirAcessos: false, ativarPlanos: false,
            emitirBoleto: false, liberarRecursos: false, verCobrancas: false, verEstoque: false,
        });
    });
});
