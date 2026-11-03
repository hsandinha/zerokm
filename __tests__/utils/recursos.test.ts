import { describe, expect, it } from 'vitest';
import { diferencaDoPadrao, lerRecursos, recursoAplica } from '@/lib/recursos';

describe('funcionalidades por conta (lib/recursos)', () => {
    it('quem já usa continua com o painel de sempre; atendimento e Messenger nascem desligados', () => {
        const c = lerRecursos(undefined, 'concessionaria');
        expect(c.crm).toBe(true);
        expect(c.anuncios).toBe(true);
        expect(c.atendimento).toBe(false);
        expect(c.messenger).toBe(false);
    });

    it('item de outro tipo de conta fica desligado', () => {
        const c = lerRecursos({ favoritos: true, estoque_local: true, atendimento: true }, 'concessionaria');
        expect(c.favoritos).toBe(false);
        expect(c.estoque_local).toBe(false);
        const l = lerRecursos({ crm: true }, 'lojista');
        expect(l.crm).toBe(false);
        expect(recursoAplica('vende_rede', 'concessionaria')).toBe(false);
    });

    it('dependência desligada derruba quem depende dela', () => {
        const semAtendimento = lerRecursos({ ia: true, simulador: true }, 'lojista');
        expect(semAtendimento.ia).toBe(false);
        expect(semAtendimento.simulador).toBe(false);

        const semIa = lerRecursos({ atendimento: true, ia: false, simulador: true, vende_rede: true }, 'lojista');
        expect(semIa.funil).toBe(true);
        expect(semIa.simulador).toBe(false);
        expect(semIa.vende_rede).toBe(false);
    });

    it('grava só a diferença do padrão', () => {
        const tudo = lerRecursos({ atendimento: true }, 'concessionaria');
        expect(diferencaDoPadrao({ ...tudo, crm: false }, 'concessionaria')).toEqual({ atendimento: true, crm: false });
        expect(diferencaDoPadrao(lerRecursos(undefined, 'lojista'), 'lojista')).toEqual({});
    });
});
