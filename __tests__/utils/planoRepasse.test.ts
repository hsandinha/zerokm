import { describe, expect, it } from 'vitest';
import { calcularValidadeRepasse, isPlanoConcessionaria, isPlanoRepasseAtivo, precoPlano } from '@/lib/utils/planoRepasse';

const NOW = new Date('2026-09-22T12:00:00Z');
const dias = (n: number) => new Date(NOW.getTime() + n * 864e5);

describe('plano de repasse — regras', () => {
    it('ativo só com status active e validade no futuro', () => {
        expect(isPlanoRepasseAtivo({ status: 'active', expiresAt: dias(1) }, NOW)).toBe(true);
        expect(isPlanoRepasseAtivo({ status: 'active', expiresAt: dias(-1) }, NOW)).toBe(false);
        expect(isPlanoRepasseAtivo({ status: 'cancelled', expiresAt: dias(10) }, NOW)).toBe(false);
        expect(isPlanoRepasseAtivo({ status: 'active' }, NOW)).toBe(false);
        expect(isPlanoRepasseAtivo(undefined, NOW)).toBe(false);
    });

    it('renovar em dia soma ao fim do período: a loja não perde dias pagos', () => {
        expect(calcularValidadeRepasse(dias(10), 'monthly', NOW).getTime()).toBe(dias(40).getTime());
    });

    it('renovar vencido conta de agora', () => {
        expect(calcularValidadeRepasse(dias(-5), 'monthly', NOW).getTime()).toBe(dias(30).getTime());
        expect(calcularValidadeRepasse(null, 'monthly', NOW).getTime()).toBe(dias(30).getTime());
    });

    it('anual soma um ano', () => {
        expect(calcularValidadeRepasse(null, 'annual', NOW).toISOString()).toBe('2027-09-22T12:00:00.000Z');
    });

    it('preço anual só quando o plano tem', () => {
        expect(precoPlano({ price: 199, annualPrice: 1990 }, 'annual')).toBe(1990);
        expect(precoPlano({ price: 199, annualPrice: null }, 'annual')).toBe(199);
        expect(precoPlano({ price: 199, annualPrice: 1990 }, 'monthly')).toBe(199);
    });

    it('plano sem público é do lojista', () => {
        expect(isPlanoConcessionaria({ publico: 'concessionaria' })).toBe(true);
        expect(isPlanoConcessionaria({})).toBe(false);
        expect(isPlanoConcessionaria(null)).toBe(false);
    });
});
