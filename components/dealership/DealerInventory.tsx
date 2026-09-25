'use client';

import { useState } from 'react';
import { PricingCatalog } from './PricingCatalog';
import { RepasseCatalog } from './RepasseCatalog';
import { Tabs } from '@/components/ui/Page';

type Aba = 'novos' | 'repasse';

/**
 * Estoque da concessionária: 0KM (preço sobre o catálogo mestre) e Repasse
 * (usados cadastrados um a um). Mesma tela para a concessionária e para a
 * equipe interna, que passa `concessionariaId`.
 */
export function DealerInventory({ concessionariaId }: { concessionariaId?: string }) {
    const [aba, setAba] = useState<Aba>('novos');

    return (
        <>
            <Tabs<Aba>
                label="Tipo de estoque"
                value={aba}
                onChange={setAba}
                tabs={[{ value: 'novos', label: 'Veículos 0KM' }, { value: 'repasse', label: 'Repasse' }]}
            />
            {aba === 'novos'
                ? <PricingCatalog concessionariaId={concessionariaId} />
                : <RepasseCatalog concessionariaId={concessionariaId} />}
        </>
    );
}
