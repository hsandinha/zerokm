'use client';
import { useEffect, useState } from 'react';

const INTERVALO = 60_000;

/**
 * Número de veículos da landing, atualizado sozinho a cada minuto enquanto a
 * aba está aberta. Começa com o valor que veio do servidor, então funciona
 * mesmo sem JavaScript.
 */
export function VeiculosAoVivo({ inicial, className }: { inicial: number; className?: string }) {
    const [total, setTotal] = useState(inicial);

    useEffect(() => {
        let ativo = true;
        const atualizar = async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                const res = await fetch('/api/public/estoque');
                if (!res.ok) return;
                const data = await res.json();
                if (ativo && typeof data.totalVehicles === 'number' && data.totalVehicles > 0) setTotal(data.totalVehicles);
            } catch {
                // Sem rede: fica o último número.
            }
        };
        const timer = setInterval(atualizar, INTERVALO);
        document.addEventListener('visibilitychange', atualizar);
        return () => {
            ativo = false;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', atualizar);
        };
    }, []);

    return <span className={className} aria-live="polite">{total.toLocaleString('pt-BR')}</span>;
}
