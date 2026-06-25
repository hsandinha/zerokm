import { describe, expect, it } from 'vitest';
import VehicleVariation from '../../models/VehicleVariation';

describe('VehicleVariation schema', () => {
    it('uses the model field without a separate version field', () => {
        expect(VehicleVariation.schema.path('modelo')).toBeDefined();
        expect(VehicleVariation.schema.path('versao')).toBeUndefined();

        const indexes = VehicleVariation.schema.indexes() as Array<[Record<string, unknown>, { unique?: boolean }]>;
        const uniqueIndex = indexes.find(([, options]) => options.unique);
        expect(uniqueIndex?.[0]).not.toHaveProperty('versao');
    });
});
