'use client';

import { createContext, useContext } from 'react';

// Contexto para configurações globais
interface ConfigContextType {
    margem: number;
    setMargem: (margem: number) => void;
}

export const ConfigContext = createContext<ConfigContextType>({
    margem: 0,
    setMargem: () => { }
});

export const useConfig = () => useContext(ConfigContext);