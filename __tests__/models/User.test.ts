import { describe, expect, it } from 'vitest';
import User from '../../models/User';

describe('User subscription schema', () => {
    it('persists the recurring payment method', () => {
        const paymentMethod = User.schema.path('subscription.paymentMethod') as any;

        expect(paymentMethod).toBeDefined();
        expect(paymentMethod.enumValues).toEqual(['pix', 'boleto', 'card']);
    });
});
