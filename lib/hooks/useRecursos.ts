'use client';
import { useEffect, useState } from 'react';
import type { Recurso, Recursos } from '@/lib/recursos';

/**
 * Funcionalidades que o CNV liberou para a conta de quem está logado
 * (lib/recursos.ts), para o painel esconder as abas desligadas. Enquanto
 * carrega, nada condicionado aparece — melhor a aba surgir um instante depois
 * do que aparecer e sumir. As rotas recusam de qualquer jeito.
 */
export function useRecursos(): { carregado: boolean; pode: (recurso: Recurso) => boolean } {
    const [estado, setEstado] = useState<{ carregado: boolean; recursos: Recursos | null }>({ carregado: false, recursos: null });

    useEffect(() => {
        let vivo = true;
        fetch('/api/user/recursos')
            .then(res => (res.ok ? res.json() : { recursos: null }))
            .catch(() => ({ recursos: null }))
            .then(data => { if (vivo) setEstado({ carregado: true, recursos: data.recursos ?? null }); });
        return () => { vivo = false; };
    }, []);

    return {
        carregado: estado.carregado,
        pode: recurso => estado.carregado && (!estado.recursos || estado.recursos[recurso]),
    };
}
