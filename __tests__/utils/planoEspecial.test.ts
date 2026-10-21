import { describe, expect, it } from 'vitest';
import { isPlanoEspecial, podeContratarPlano } from '@/lib/utils/planoEspecial';

describe('plano especial', () => {
    it('plano comum qualquer um contrata', () => {
        expect(podeContratarPlano({ _id: 'p1' }, null)).toBe(true);
        expect(isPlanoEspecial({ especial: false })).toBe(false);
    });

    it('plano especial só renova quem já está nele', () => {
        const especial = { _id: 'p9', especial: true };
        expect(podeContratarPlano(especial, { subscription: { planId: 'p9' } })).toBe(true);
        expect(podeContratarPlano(especial, { subscription: { planId: 'p1' } })).toBe(false);
        expect(podeContratarPlano(especial, { subscription: null })).toBe(false);
    });
});
