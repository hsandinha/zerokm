// Colunas do funil: qual coluna mostra o cartão e que etapa ele ganha ao ser
// posto numa coluna. É a regra que o quadro, a Central e a consulta do
// servidor compartilham (wa/lib/stages.ts).
import { describe, expect, it } from 'vitest';
import { colunaDoCartao, colunasPadrao, etapaAoMover, etapasDaColuna, type FunilColuna } from '@wa/lib/stages';

const padrao: FunilColuna[] = colunasPadrao(true).map((c, i) => ({ ...c, id: `sys-${c.systemKey}`, position: i }));
const negociando: FunilColuna = { id: 'neg', name: 'Negociando', color: 'azul', position: 9, systemKey: null, type: 'open' };
const outraLoja: FunilColuna = { id: 'outra', name: 'Comprou em outra loja', color: 'cinza', position: 10, systemKey: null, type: 'lost' };
const colunas = [...padrao, negociando, outraLoja];

describe('colunas padrão da loja', () => {
    it('uma coluna automática por etapa, com o nome da loja', () => {
        expect(colunasPadrao(true).map((c) => c.name)).toEqual([
            'Abordado', 'Em atendimento', 'Visita / test drive', 'Proposta', 'Vendido', 'Perdido',
        ]);
        expect(colunasPadrao(true).find((c) => c.systemKey === 'ganho')?.type).toBe('won');
    });
});

describe('qual coluna mostra o cartão', () => {
    it('sem coluna escolhida, vai para a coluna da etapa', () => {
        expect(colunaDoCartao({ stage: 'cadastro' }, colunas)?.id).toBe('sys-cadastro');
    });

    it('a coluna posta à mão vale enquanto combina com a etapa', () => {
        expect(colunaDoCartao({ stage: 'pagamento', stageId: 'neg' }, colunas)?.id).toBe('neg');
    });

    it('se a IA encerra (perdido), sai da coluna em andamento', () => {
        expect(colunaDoCartao({ stage: 'perdido', stageId: 'neg' }, colunas)?.id).toBe('sys-perdido');
    });

    it('a IA avança o cartão que estava numa coluna automática', () => {
        expect(colunaDoCartao({ stage: 'pagamento', stageId: 'sys-conversa' }, colunas)?.id).toBe('sys-pagamento');
    });

    it('coluna apagada: cai na da etapa; sem ela, fica sem etapa', () => {
        expect(colunaDoCartao({ stage: 'conversa', stageId: 'apagada' }, colunas)?.id).toBe('sys-conversa');
        const semPerdido = colunas.filter((c) => c.systemKey !== 'perdido');
        expect(colunaDoCartao({ stage: 'perdido' }, semPerdido)).toBeNull();
        expect(colunaDoCartao({ stage: 'perdido', stageId: 'outra' }, semPerdido)?.id).toBe('outra');
    });
});

describe('etapa ao mover', () => {
    it('coluna automática dá a etapa dela', () => {
        expect(etapaAoMover(padrao.find((c) => c.systemKey === 'ganho')!, 'conversa')).toBe('ganho');
    });

    it('coluna em andamento mantém a etapa aberta e reabre quem estava fechado', () => {
        expect(etapaAoMover(negociando, 'cadastro')).toBe('cadastro');
        expect(etapaAoMover(negociando, 'perdido')).toBe('conversa');
        expect(etapasDaColuna(negociando)).not.toContain('ganho');
    });

    it('coluna de perdido própria marca perdido', () => {
        expect(etapaAoMover(outraLoja, 'pagamento')).toBe('perdido');
    });
});
