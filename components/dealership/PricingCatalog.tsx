'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './PricingCatalog.module.css';

type PricingStatus = 'todos' | 'ativo' | 'inativo';

interface PricingRow {
    variationId: string;
    marca: string;
    modelo: string;
    versao?: string;
    codigoFipe?: string;
    anoModelo?: number;
    combustivel?: string;
    cor?: string;
    transmissao?: string;
    motor?: string;
    preco: number | null;
    frete: number | null;
    ativo: boolean;
    status: 'ativo' | 'inativo';
    updatedAt?: string;
}

interface PricingResponse {
    data: PricingRow[];
    total: number;
    concessionaria?: {
        nome?: string;
        marca?: string | null;
    };
    error?: string;
    code?: string;
}

function formatCurrency(value: number | null | undefined) {
    if (!value) return '';
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function parseCurrency(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed
        .replace(/\s/g, '')
        .replace(/R\$/gi, '')
        .replace(/\./g, '')
        .replace(',', '.');

    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function PricingCatalog() {
    const [rows, setRows] = useState<PricingRow[]>([]);
    const [total, setTotal] = useState(0);
    const [brandName, setBrandName] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<PricingStatus>('todos');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    const queryStatus = status === 'todos' ? '' : status;

    const loadCatalog = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ limit: '500' });
            if (search.trim()) params.set('search', search.trim());
            if (queryStatus) params.set('status', queryStatus);

            const res = await fetch(`/api/dealership/pricing-catalog?${params.toString()}`);
            const data: PricingResponse = await res.json();

            if (!res.ok) {
                if (data.code === 'BRAND_NOT_LINKED') {
                    setRows([]);
                    setTotal(0);
                    setBrandName(null);
                    setError('Nenhuma marca foi vinculada a esta concessionária. Solicite ao operador a associação da marca.');
                    return;
                }
                throw new Error(data.error || 'Erro ao carregar catálogo de preços');
            }

            setRows(data.data || []);
            setTotal(data.total || 0);
            setBrandName(data.concessionaria?.marca || null);
            setDraftPrices({});
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar catálogo');
        } finally {
            setLoading(false);
        }
    }, [queryStatus, search]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadCatalog();
        }, 250);

        return () => clearTimeout(timer);
    }, [loadCatalog]);

    const activeCount = useMemo(() => rows.filter(row => row.ativo).length, [rows]);
    const inactiveCount = rows.length - activeCount;

    const updateRowPrice = async (row: PricingRow, rawValue: string) => {
        const rawTrimmed = rawValue.trim();
        const preco = parseCurrency(rawValue);

        if (rawTrimmed && preco === null && rawTrimmed !== '0' && rawTrimmed !== '0,00') {
            setError('Preço inválido. Use apenas números, vírgula e ponto.');
            return;
        }

        setSaving(prev => ({ ...prev, [row.variationId]: true }));
        setError(null);

        try {
            const res = await fetch('/api/dealership/pricing-catalog', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    variationId: row.variationId,
                    preco,
                    frete: row.frete,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar preço');

            setRows(prev => prev.map(item => item.variationId === row.variationId
                ? {
                    ...item,
                    preco: data.preco ?? null,
                    frete: data.frete ?? item.frete,
                    ativo: data.ativo,
                    status: data.status,
                }
                : item
            ));
            setDraftPrices(prev => {
                const next = { ...prev };
                delete next[row.variationId];
                return next;
            });
        } catch (err: any) {
            setError(err?.message || 'Erro ao salvar preço');
        } finally {
            setSaving(prev => ({ ...prev, [row.variationId]: false }));
        }
    };

    const moveToNextInput = (index: number) => {
        const next = document.querySelector<HTMLInputElement>(`[data-price-index="${index + 1}"]`);
        next?.focus();
        next?.select();
    };

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                <div>
                    <h2 className={styles.title}>Catálogo e Preços</h2>
                    <p className={styles.subtitle}>
                        {brandName ? `Marca vinculada: ${brandName}` : 'Preencha preços para ativar os veículos no catálogo do cliente.'}
                    </p>
                </div>

                <div className={styles.summary}>
                    <span>{total} variações</span>
                    <span>{activeCount} ativas</span>
                    <span>{inactiveCount} sem preço</span>
                </div>
            </div>

            <div className={styles.filters}>
                <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Buscar modelo, versão, cor, FIPE..."
                    className={styles.search}
                />

                <div className={styles.segmented}>
                    {([
                        ['todos', 'Todos'],
                        ['inativo', 'Sem preço'],
                        ['ativo', 'Ativos'],
                    ] as Array<[PricingStatus, string]>).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            className={`${styles.segment} ${status === value ? styles.segmentActive : ''}`}
                            onClick={() => setStatus(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.tableShell}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Modelo</th>
                            <th>Versão</th>
                            <th>Ano</th>
                            <th>Combustível</th>
                            <th>Cor</th>
                            <th>Câmbio</th>
                            <th>FIPE</th>
                            <th>Preço</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} className={styles.empty}>Carregando catálogo...</td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={9} className={styles.empty}>Nenhuma variação encontrada.</td>
                            </tr>
                        ) : rows.map((row, index) => {
                            const inputValue = draftPrices[row.variationId] ?? formatCurrency(row.preco);
                            const isSaving = saving[row.variationId];

                            return (
                                <tr key={row.variationId}>
                                    <td>
                                        <strong>{row.modelo}</strong>
                                        {row.motor && <span className={styles.muted}>{row.motor}</span>}
                                    </td>
                                    <td>{row.versao || '-'}</td>
                                    <td>{row.anoModelo || '-'}</td>
                                    <td>{row.combustivel || '-'}</td>
                                    <td>{row.cor || '-'}</td>
                                    <td>{row.transmissao || '-'}</td>
                                    <td>{row.codigoFipe || '-'}</td>
                                    <td>
                                        <div className={styles.priceCell}>
                                            <span>R$</span>
                                            <input
                                                data-price-index={index}
                                                value={inputValue}
                                                inputMode="decimal"
                                                disabled={isSaving}
                                                className={styles.priceInput}
                                                placeholder="0,00"
                                                onChange={event => setDraftPrices(prev => ({
                                                    ...prev,
                                                    [row.variationId]: event.target.value,
                                                }))}
                                                onBlur={event => updateRowPrice(row, event.target.value)}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        updateRowPrice(row, event.currentTarget.value).then(() => moveToNextInput(index));
                                                    }
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`${styles.status} ${row.ativo ? styles.active : styles.inactive}`}>
                                            {isSaving ? 'Salvando...' : row.ativo ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
