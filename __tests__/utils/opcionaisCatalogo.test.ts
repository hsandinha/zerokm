import { describe, expect, it } from 'vitest';
import { acrescentarOpcionais } from '@/lib/utils/opcionaisCatalogo';

describe('acrescentarOpcionais', () => {
    it('acrescenta no fim sem repetir', () => {
        const r = acrescentarOpcionais({ opcionais: 'Ar, Direção' }, 'Taxa zero');
        expect(r.opcionais).toBe('Ar, Direção, Taxa zero');
        expect(r.mudou).toBe(true);
    });

    it('compara item a item, não por pedaço de texto', () => {
        const r = acrescentarOpcionais({ opcionais: 'Carregador sem fio' }, 'Ar');
        expect(r.opcionais).toBe('Carregador sem fio, Ar');
    });

    it('não muda quando o item já existe, ignorando acento e caixa', () => {
        const r = acrescentarOpcionais({ opcionais: 'Ar, Direção elétrica' }, 'direcao eletrica');
        expect(r.mudou).toBe(false);
        expect(r.opcionais).toBe('Ar, Direção elétrica');
    });

    it('parte da lista padrão quando o texto está vazio', () => {
        const r = acrescentarOpcionais({ opcionais: '', opcionaisPadrao: ['Ar', 'Vidros'] }, 'Taxa zero');
        expect(r.opcionais).toBe('Ar, Vidros, Taxa zero');
        expect(r.padrao).toEqual(['Ar', 'Vidros', 'Taxa zero']);
    });

    it('aceita vários itens de uma vez', () => {
        const r = acrescentarOpcionais({}, 'Ar; Vidros | Ar');
        expect(r.opcionais).toBe('Ar, Vidros');
    });
});
