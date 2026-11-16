'use client';

import { useCallback, useEffect, useState } from 'react';
import { faixasSalvas, type FaixaDeMargem } from '@/lib/utils/margem';
import type { MarginConfigInput } from '@/lib/contexts/ConfigContext';

type Modo = 'percent' | 'fixed';

/**
 * Margem da consulta de veículos (percentual ou valor fixo), carregada de
 * /api/config/margem e salva lá. Devolve o valor pronto para o ConfigContext.
 * `onErro` recebe a mensagem quando salvar falha.
 */
export function useMargemConfig(onErro?: (mensagem: string) => void) {
    const [margem, setMargem] = useState(0);
    const [fixedMargin, setFixedMargin] = useState(0);
    const [marginMode, setMarginMode] = useState<Modo>('percent');
    const [faixas, setFaixas] = useState<FaixaDeMargem[]>([]);

    useEffect(() => {
        fetch('/api/config/margem')
            .then(res => (res.ok ? res.json() : Promise.reject()))
            .then(data => {
                setMargem(data.margem || 0);
                setFixedMargin(data.fixedMargin || 0);
                setMarginMode(data.marginMode === 'fixed' ? 'fixed' : 'percent');
                setFaixas(faixasSalvas(data.faixas));
            })
            .catch(() => {
                try {
                    const salva = localStorage.getItem('vehicleMargem');
                    if (salva) setMargem(parseFloat(salva));
                } catch { /* sem armazenamento local */ }
            });
    }, []);

    const salvar = useCallback(async (nova: number, modo: Modo, fixa: number, novasFaixas?: FaixaDeMargem[]) => {
        try {
            const res = await fetch('/api/config/margem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: nova, marginMode: modo, fixedMargin: fixa, ...(novasFaixas ? { faixas: novasFaixas } : {}) }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                onErro?.(data?.error || 'Não foi possível salvar a margem. Tente de novo.');
                return;
            }
            setMargem(nova);
            setFixedMargin(fixa);
            setMarginMode(modo);
            if (novasFaixas) setFaixas(faixasSalvas(novasFaixas));
            try { localStorage.setItem('vehicleMargem', String(nova)); } catch { /* sem armazenamento local */ }
        } catch {
            onErro?.('Não foi possível salvar a margem. Tente de novo.');
        }
    }, [onErro]);

    return {
        margem,
        fixedMargin,
        marginMode,
        faixas,
        setMargem: (v: number) => salvar(v, marginMode, fixedMargin),
        setMarginConfig: ({ margem: v, marginMode: m, fixedMargin: f, faixas: fx }: MarginConfigInput) => salvar(v, m, f, fx),
    };
}
