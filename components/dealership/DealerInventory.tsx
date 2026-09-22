'use client';

import { useState } from 'react';
import { PricingCatalog } from './PricingCatalog';
import { RepasseCatalog } from './RepasseCatalog';
import base from './PricingCatalog.module.css';
import styles from './RepasseCatalog.module.css';

type Aba = 'novos' | 'repasse';

/**
 * Estoque da concessionária: 0KM (preço sobre o catálogo mestre) e Repasse
 * (usados cadastrados um a um). Mesma tela para a concessionária e para a
 * equipe interna, que passa `concessionariaId`.
 */
export function DealerInventory({ concessionariaId }: { concessionariaId?: string }) {
    const [aba, setAba] = useState<Aba>('novos');

    return (
        <div>
            <div className={`${base.segmented} ${styles.tabs}`} role="tablist" aria-label="Tipo de estoque">
                {([['novos', 'Veículos 0KM'], ['repasse', 'Repasse']] as Array<[Aba, string]>).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={aba === value}
                        className={`${base.segment} ${aba === value ? base.segmentActive : ''}`}
                        onClick={() => setAba(value)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {aba === 'novos'
                ? <PricingCatalog concessionariaId={concessionariaId} />
                : <RepasseCatalog concessionariaId={concessionariaId} />}
        </div>
    );
}
