'use client';

import { createContext, useContext } from 'react';

// Contexto para configurações globais
interface ConfigContextType {
    margem: number; // percent margin value
    marginMode: 'percent' | 'fixed';
    fixedMargin: number; // absolute value to add when mode is fixed
    setMargem: (margem: number) => void;
    setMarginConfig?: (config: { margem: number; marginMode: 'percent' | 'fixed'; fixedMargin: number }) => void;
}

export const ConfigContext = createContext<ConfigContextType>({
    margem: 0,
    marginMode: 'percent',
    fixedMargin: 0,
    setMargem: () => { },
    setMarginConfig: () => { }
});

export const useConfig = () => useContext(ConfigContext);