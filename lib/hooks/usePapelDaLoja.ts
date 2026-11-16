'use client';
import { useEffect, useState } from 'react';
import type { PapelLoja } from '@/lib/utils/atendentesLoja';

/**
 * Papel de quem está logado na concessionária (titular ou atendente), para o
 * menu esconder o que é só do titular. Enquanto carrega ninguém é titular:
 * melhor a aba surgir um instante depois do que aparecer e sumir. Quem barra o
 * atendente de verdade é cada rota, no servidor (lib/services/acessoLoja.ts).
 */
export function usePapelDaLoja(ativo = true): { carregado: boolean; papel: PapelLoja | null; ehTitular: boolean } {
    const [estado, setEstado] = useState<{ carregado: boolean; papel: PapelLoja | null }>({ carregado: false, papel: null });

    useEffect(() => {
        if (!ativo) return;
        let vivo = true;
        fetch('/api/dealership/papel')
            .then(res => (res.ok ? res.json() : { papel: null }))
            .catch(() => ({ papel: null }))
            .then(data => { if (vivo) setEstado({ carregado: true, papel: data.papel === 'titular' || data.papel === 'atendente' ? data.papel : null }); });
        return () => { vivo = false; };
    }, [ativo]);

    return { ...estado, ehTitular: estado.papel === 'titular' };
}
