// @vitest-environment node
// Soma das fontes do público da loja (wa/lib/audience/publico.ts): a tela e a
// API usam a mesma regra, então a contagem da revisão é a da campanha.
import { describe, expect, it } from 'vitest';
import { juntarPublico, lerListaColada } from '@wa/lib/audience/publico';

describe('lista colada', () => {
    it('aceita nome antes ou depois e descarta fixo e lixo', () => {
        const r = lerListaColada('Ana Souza; (31) 99999-0000\n31988887777 Carlos\n\n(31) 3333-4444\nsem número');
        expect(r.pessoas).toEqual([
            { phone: '+5531999990000', name: 'Ana Souza', origem: 'colar' },
            { phone: '+5531988887777', name: 'Carlos', origem: 'colar' },
        ]);
        expect(r.invalidas).toEqual(['(31) 3333-4444', 'sem número']);
    });
});

describe('soma das fontes', () => {
    it('telefone repetido entra uma vez, com a origem mais rica e o nome de quem tinha', () => {
        const r = juntarPublico([
            [{ phone: '+5531999990000', name: 'Ana (contato)', company: 'Auto Ana', origem: 'contatos' }],
            [{ phone: '+5531999990000', name: null, var1: 'Nivus', origem: 'csv' }],
            [{ phone: '+5531988887777', name: 'Carlos', origem: 'colar' }],
        ]);
        expect(r.duplicados).toBe(1);
        expect(r.pessoas).toEqual([
            { phone: '+5531999990000', name: 'Ana (contato)', company: 'Auto Ana', var1: 'Nivus', origem: 'csv' },
            { phone: '+5531988887777', name: 'Carlos', origem: 'colar' },
        ]);
    });

    it('desmarcado sai e é contado', () => {
        const r = juntarPublico([[{ phone: '+5531999990000', origem: 'contatos' }, { phone: '+5531988887777', origem: 'contatos' }]], ['+5531999990000']);
        expect(r.pessoas.map((p) => p.phone)).toEqual(['+5531988887777']);
        expect(r.excluidos).toBe(1);
    });
});
