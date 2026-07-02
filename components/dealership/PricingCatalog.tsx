'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { FaFileExport, FaFileImport, FaTrash } from 'react-icons/fa';
import styles from './PricingCatalog.module.css';

type PricingStatus = 'todos' | 'ativo' | 'inativo';

interface PricingRow {
    variationId: string;
    marca: string;
    modelo: string;
    codigoFipe?: string;
    opcionais?: string;
    opcionaisPadrao?: string[];
    anoModelo?: number;
    anoFabricacao?: number;
    combustivel?: string;
    cor?: string;
    transmissao?: string;
    motor?: string;
    preco: number | null;
    frete: number | null;
    ativo: boolean;
    status: 'ativo' | 'inativo';
    statusVeiculo?: string;
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

export interface PricingCatalogProps {
    concessionariaId?: string;
}

export function PricingCatalog({ concessionariaId }: PricingCatalogProps = {}) {
    const [rows, setRows] = useState<PricingRow[]>([]);
    const [total, setTotal] = useState(0);
    const [brandName, setBrandName] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<PricingStatus>('todos');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
    const [draftStatuses, setDraftStatuses] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const queryStatus = status === 'todos' ? '' : status;

    const loadCatalog = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ limit: '500' });
            if (search.trim()) params.set('search', search.trim());
            if (queryStatus) params.set('status', queryStatus);
            if (concessionariaId) params.set('concessionariaId', concessionariaId);

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

    const updateRowFields = async (row: PricingRow, rawPriceValue: string, newStatusVeiculo?: string) => {
        const rawTrimmed = rawPriceValue.trim();
        const preco = parseCurrency(rawPriceValue);
        const statusVeiculo = newStatusVeiculo !== undefined ? newStatusVeiculo : (row.statusVeiculo || 'A faturar');

        if (rawTrimmed && preco === null && rawTrimmed !== '0' && rawTrimmed !== '0,00') {
            setError('Preço inválido. Use apenas números, vírgula e ponto.');
            return;
        }

        setSaving(prev => ({ ...prev, [row.variationId]: true }));
        setError(null);

        try {
            const patchUrl = concessionariaId 
                ? `/api/dealership/pricing-catalog?concessionariaId=${concessionariaId}`
                : '/api/dealership/pricing-catalog';

            const res = await fetch(patchUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    variationId: row.variationId,
                    preco,
                    frete: row.frete,
                    statusVeiculo
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar informações');

            setRows(prev => prev.map(item => item.variationId === row.variationId
                ? {
                    ...item,
                    preco: data.preco ?? null,
                    frete: data.frete ?? item.frete,
                    statusVeiculo: data.statusVeiculo,
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
            setDraftStatuses(prev => {
                const next = { ...prev };
                delete next[row.variationId];
                return next;
            });
        } catch (err: any) {
            setError(err?.message || 'Erro ao salvar informações');
        } finally {
            setSaving(prev => ({ ...prev, [row.variationId]: false }));
        }
    };

    const moveToNextInput = (index: number) => {
        const next = document.querySelector<HTMLInputElement>(`[data-price-index="${index + 1}"]`);
        next?.focus();
        next?.select();
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(rows.map(r => r.variationId)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        const next = new Set(selectedIds);
        if (checked) next.add(id);
        else next.delete(id);
        setSelectedIds(next);
    };

    const handleExportCSV = () => {
        const headers = ['ID_SISTEMA', 'MARCA', 'MODELO', 'ANO', 'COR', 'OPCIONAIS', 'STATUS_ATUAL', 'PRECO_ATUAL', 'NOVO_PRECO', 'NOVO_STATUS'];
        const csvRows = [headers.join(',')];
        
        for (const row of rows) {
            const precoAtual = row.preco || 0;
            const cols = [
                row.variationId,
                `"${row.marca || ''}"`,
                `"${row.modelo || ''}"`,
                `"${row.anoFabricacao && row.anoModelo ? `${String(row.anoFabricacao).slice(-2)}/${String(row.anoModelo).slice(-2)}` : row.anoModelo || ''}"`,
                `"${row.cor || ''}"`,
                `"${(row.opcionais || '').replace(/"/g, '""')}"`,
                `"${row.statusVeiculo || 'A faturar'}"`,
                precoAtual,
                '', // novo preco
                ''  // novo status
            ];
            csvRows.push(cols.join(','));
        }
        
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'catalogo_precos.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const text = await file.text();
        const lines = text.split('\n');
        const updates: { variationId: string; preco: number; statusVeiculo?: string }[] = [];
        
        const headerLine = lines[0].split(',');
        const idIndex = headerLine.findIndex(h => h.includes('ID_SISTEMA'));
        const priceIndex = headerLine.findIndex(h => h.includes('NOVO_PRECO'));
        const statusIndex = headerLine.findIndex(h => h.includes('NOVO_STATUS'));
        
        if (idIndex === -1 || priceIndex === -1) {
            setError('CSV Inválido. Baixe a planilha mestre novamente para ter as colunas corretas.');
            return;
        }
        
        for (let i = 1; i < lines.length; i++) {
            const rowStr = lines[i].trim();
            if (!rowStr) continue;
            
            const colsArray = [];
            let inQuotes = false;
            let currentStr = '';
            for (let char of rowStr) {
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) {
                    colsArray.push(currentStr);
                    currentStr = '';
                } else {
                    currentStr += char;
                }
            }
            colsArray.push(currentStr);
            
            const varId = colsArray[idIndex]?.replace(/"/g, '').trim();
            const rawPrice = colsArray[priceIndex]?.replace(/"/g, '').trim();
            const rawStatus = statusIndex !== -1 ? colsArray[statusIndex]?.replace(/"/g, '').trim() : undefined;
            
            if (varId && rawPrice !== undefined && rawPrice !== '') {
                const parsed = parseCurrency(rawPrice);
                // Assume 0 como inativar
                updates.push({ 
                    variationId: varId, 
                    preco: parsed || 0,
                    statusVeiculo: rawStatus || undefined
                });
            }
        }
        
        if (updates.length > 0) {
            setLoading(true);
            try {
                const patchUrl = concessionariaId 
                    ? `/api/dealership/pricing-catalog/bulk?concessionariaId=${concessionariaId}`
                    : '/api/dealership/pricing-catalog/bulk';

                const res = await fetch(patchUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates }),
                });

                if (!res.ok) throw new Error('Erro ao processar importação');
                await loadCatalog();
                alert(`Importação concluída. ${updates.length} itens processados.`);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        e.target.value = '';
    };

    const handleMassZerar = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Tem certeza que deseja inativar (zerar preço) de ${selectedIds.size} veículos?`)) return;
        
        const updates = Array.from(selectedIds).map(id => ({ variationId: id, preco: 0 }));
        setLoading(true);
        try {
            const patchUrl = concessionariaId 
                ? `/api/dealership/pricing-catalog/bulk?concessionariaId=${concessionariaId}`
                : '/api/dealership/pricing-catalog/bulk';

            const res = await fetch(patchUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates }),
            });

            if (!res.ok) throw new Error('Erro ao processar inativação em massa');
            
            setSelectedIds(new Set());
            await loadCatalog();
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
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

            <div className={styles.bulkActionsRow}>
                {selectedIds.size > 0 ? (
                    <div className={styles.selectedActions}>
                        <span>{selectedIds.size} item(s) selecionados</span>
                        <button onClick={handleMassZerar} className={styles.dangerButton}>
                            <FaTrash /> Zerar / Inativar Selecionados
                        </button>
                    </div>
                ) : (
                    <div className={styles.csvActions}>
                        <button onClick={handleExportCSV} className={styles.actionBtn}>
                            <FaFileExport /> Baixar Planilha Base
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className={styles.actionBtn}>
                            <FaFileImport /> Importar CSV
                        </button>
                        <input
                            type="file"
                            accept=".csv"
                            style={{ display: 'none' }}
                            ref={fileInputRef}
                            onChange={handleImportCSV}
                        />
                    </div>
                )}
            </div>

            <div className={styles.filters}>
                <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Buscar modelo, cor, FIPE..."
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
                            <th style={{ width: '40px', textAlign: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={rows.length > 0 && selectedIds.size === rows.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th>Marca</th>
                            <th>Modelo</th>
                            <th>Ano</th>
                            <th>Combustível</th>
                            <th>Cor</th>
                            <th>Câmbio</th>
                            <th>Opcionais</th>
                            <th>Preço</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className={styles.empty}>Carregando catálogo...</td>
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
                                    <td style={{ textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(row.variationId)}
                                            onChange={(e) => handleSelectRow(row.variationId, e.target.checked)}
                                        />
                                    </td>
                                    <td>{row.marca || '-'}</td>
                                    <td>
                                        <strong>{row.modelo}</strong>
                                        {row.motor && <span className={styles.muted}>{row.motor}</span>}
                                    </td>
                                    <td>
                                        {row.anoFabricacao && row.anoModelo
                                            ? `${String(row.anoFabricacao).slice(-2)}/${String(row.anoModelo).slice(-2)}`
                                            : row.anoModelo || '-'}
                                    </td>
                                    <td>{row.combustivel || '-'}</td>
                                    <td>{row.cor || '-'}</td>
                                    <td>{row.transmissao || '-'}</td>
                                    <td>{row.opcionais || '-'}</td>
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
                                                onBlur={event => updateRowFields(row, event.target.value)}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        updateRowFields(row, event.currentTarget.value).then(() => moveToNextInput(index));
                                                    }
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                                            <select
                                                value={draftStatuses[row.variationId] ?? row.statusVeiculo ?? 'A faturar'}
                                                onChange={e => {
                                                    const newStatus = e.target.value;
                                                    setDraftStatuses(prev => ({ ...prev, [row.variationId]: newStatus }));
                                                    updateRowFields(row, draftPrices[row.variationId] ?? formatCurrency(row.preco), newStatus);
                                                }}
                                                disabled={isSaving}
                                                className={styles.statusSelect}
                                            >
                                                <option value="A faturar">A faturar</option>
                                                <option value="Pedido de fábrica">Pedido de fábrica</option>
                                                <option value="Refaturamento">Refaturamento</option>
                                                <option value="Licenciado">Licenciado</option>
                                            </select>
                                            <span className={`${styles.status} ${row.ativo ? styles.active : styles.inactive}`}>
                                                {isSaving ? 'Salvando...' : row.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </div>
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
