'use client';

import { createContext, useContext } from 'react';
import type { FaixaDeMargem } from '@/lib/utils/margem';

export type MarginConfigInput = {
    margem: number;
    marginMode: 'percent' | 'fixed';
    fixedMargin: number;
    /** Faixas de preço com margem própria. Ausente = mantém as que já existem. */
    faixas?: FaixaDeMargem[];
};

// Contexto para configurações globais
interface ConfigContextType {
    margem: number; // percent margin value
    marginMode: 'percent' | 'fixed';
    fixedMargin: number; // absolute value to add when mode is fixed
    /** Margem por faixa de preço; fora das faixas vale a margem geral acima. */
    faixas?: FaixaDeMargem[];
    setMargem: (margem: number) => void;
    setMarginConfig?: (config: MarginConfigInput) => void;
}

export const ConfigContext = createContext<ConfigContextType>({
    margem: 0,
    marginMode: 'percent',
    fixedMargin: 0,
    faixas: [],
    setMargem: () => { },
    setMarginConfig: () => { }
});

export const useConfig = () => useContext(ConfigContext);
