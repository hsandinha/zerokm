'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig } from '@/lib/contexts/ConfigContext';
import styles from './ActiveVehicleCatalog.module.css';

interface ActiveVehicle {
    id: string;
    marca: string;
    modelo: string;
    versao?: string;
    anoModelo?: number;
    combustivel?: string;
    transmissao?: string;
    preco: number;
    frete?: number | null;
    concessionaria: string;
    cidade?: string;
    estado?: string;
    telefone?: string;
    nomeContato?: string;
}

interface ActiveVehiclesResponse {
    data: ActiveVehicle[];
    total: number;
    error?: string;
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    });
}

export function ActiveVehicleCatalog() {
    const { margem, fixedMargin, marginMode } = useConfig();
    const [vehicles, setVehicles] = useState<ActiveVehicle[]>([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [estado, setEstado] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadVehicles = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ limit: '100' });
            if (search.trim()) params.set('search', search.trim());
            if (estado.trim()) params.set('estado', estado.trim().toUpperCase());

            const res = await fetch(`/api/catalog/active-vehicles?${params.toString()}`);
            const data: ActiveVehiclesResponse = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao carregar veículos');

            setVehicles(data.data || []);
            setTotal(data.total || 0);
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar catálogo');
        } finally {
            setLoading(false);
        }
    }, [estado, search]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadVehicles();
        }, 250);

        return () => clearTimeout(timer);
    }, [loadVehicles]);

    const estados = useMemo(() => {
        return [...new Set(vehicles.map(vehicle => vehicle.estado).filter(Boolean) as string[])].sort();
    }, [vehicles]);

    const applyMargin = (price: number) => {
        if (marginMode === 'fixed') return price + fixedMargin;
        return price * (1 + margem / 100);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>Veículos Disponíveis</h2>
                    <p className={styles.subtitle}>{total} ofertas com preço ativo pelas concessionárias.</p>
                </div>

                <div className={styles.filters}>
                    <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar marca, modelo, versão..."
                        className={styles.search}
                    />
                    <select
                        value={estado}
                        onChange={event => setEstado(event.target.value)}
                        className={styles.select}
                    >
                        <option value="">Todos os estados</option>
                        {estados.map(uf => (
                            <option key={uf} value={uf}>{uf}</option>
                        ))}
                    </select>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.grid}>
                {loading ? (
                    <div className={styles.empty}>Carregando catálogo...</div>
                ) : vehicles.length === 0 ? (
                    <div className={styles.empty}>Nenhum veículo ativo encontrado.</div>
                ) : vehicles.map(vehicle => {
                    const finalPrice = applyMargin(vehicle.preco);

                    return (
                        <article key={vehicle.id} className={styles.card}>
                            <div className={styles.cardTop}>
                                <div>
                                    <h3>{vehicle.marca} {vehicle.modelo}</h3>
                                    <p>{vehicle.versao || 'Versão não informada'}</p>
                                </div>
                                <span>{vehicle.estado || '-'}</span>
                            </div>

                            <div className={styles.specs}>
                                <span>{vehicle.anoModelo || '-'}</span>
                                <span>{vehicle.combustivel || '-'}</span>
                                <span>{vehicle.transmissao || '-'}</span>
                            </div>

                            <div className={styles.priceBlock}>
                                <span>Preço</span>
                                <strong>{formatCurrency(finalPrice)}</strong>
                                {vehicle.frete ? <small>Frete: {formatCurrency(vehicle.frete)}</small> : null}
                            </div>

                            <div className={styles.dealer}>
                                <strong>{vehicle.concessionaria}</strong>
                                <span>{[vehicle.cidade, vehicle.estado].filter(Boolean).join(' - ') || 'Local não informado'}</span>
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
