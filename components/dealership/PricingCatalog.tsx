'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { FaFileExport, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { BookOpen, CarFront, Download, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { Button, Panel, PanelToolbar, SearchField, Segmented, StatCard, StatGrid, pageStyles } from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import { Pagination } from '../Pagination';
import styles from './PricingCatalog.module.css';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';

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
    quantidade: number;
    prazo?: number | null;
    ativo: boolean;
    status: 'ativo' | 'inativo';
    statusVeiculo?: string;
    observacoes?: string;
    updatedAt?: string;
}

interface PricingResponse {
    data: PricingRow[];
    total: number;
    activeCount?: number;
    totalQuantidade?: number;
    page?: number;
    totalPages?: number;
    hasNextPage?: boolean;
    concessionaria?: {
        nome?: string;
        marca?: string | null;
        cidade?: string | null;
        uf?: string | null;
        telefone?: string | null;
        contato?: string | null;
        nomeResponsavel?: string | null;
        operadorId?: string | null;
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

/**
 * "Pronta Entrega" e 0 significam a mesma coisa; qualquer outro número é a
 * quantidade de dias. Usado na digitação da tela e na importação do CSV, para
 * as duas entradas entenderem o campo do mesmo jeito.
 */
function parsePrazo(value: string | undefined | null): number | null {
    const norm = (value ?? '').trim().toLowerCase();
    if (norm === '') return null;
    if (norm === 'pronta entrega' || norm === 'pronta' || norm === '0') return 0;
    const dias = parseInt(norm, 10);
    return Number.isFinite(dias) && dias >= 0 ? dias : null;
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

const PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 500;

export interface PricingCatalogProps {
    concessionariaId?: string;
}

export function PricingCatalog({ concessionariaId }: PricingCatalogProps = {}) {
    const { confirm, feedback } = useFeedback();
    const [rows, setRows] = useState<PricingRow[]>([]);
    const [total, setTotal] = useState(0);
    const [backendActiveCount, setBackendActiveCount] = useState<number | null>(null);
    const [totalQuantidade, setTotalQuantidade] = useState(0);
    const [concessionariaInfo, setConcessionariaInfo] = useState<PricingResponse['concessionaria'] | null>(null);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<PricingStatus>('todos');
    const [tipo, setTipo] = useState<'todos' | 'carro' | 'moto'>('todos');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
    const [draftStatuses, setDraftStatuses] = useState<Record<string, string>>({});
    const [draftQuantities, setDraftQuantities] = useState<Record<string, string>>({});
    const [draftPrazos, setDraftPrazos] = useState<Record<string, string>>({});
    const [draftObs, setDraftObs] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [importReport, setImportReport] = useState<{ successes: any[]; errors: any[] } | null>(null);
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [exporting, setExporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const queryStatus = status === 'todos' ? '' : status;

    const buildCatalogUrl = useCallback((targetPage: number, limit: number) => {
        const params = new URLSearchParams({ limit: String(limit), page: String(targetPage) });
        if (search.trim()) params.set('search', search.trim());
        if (queryStatus) params.set('status', queryStatus);
        if (tipo !== 'todos') params.set('tipo', tipo);
        if (concessionariaId) params.set('concessionariaId', concessionariaId);
        return `/api/dealership/pricing-catalog?${params.toString()}`;
    }, [queryStatus, search, tipo, concessionariaId]);

    const loadCatalog = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(buildCatalogUrl(page, PAGE_SIZE));
            const data: PricingResponse = await res.json();

            if (!res.ok) {
                if (data.code === 'BRAND_NOT_LINKED') {
                    setRows([]);
                    setTotal(0);
                    setHasNextPage(false);
                    setConcessionariaInfo(null);
                    setError('Nenhuma marca foi vinculada a esta concessionária. Solicite ao operador a associação da marca.');
                    return;
                }
                throw new Error(data.error || 'Erro ao carregar catálogo de preços');
            }

            setRows(data.data || []);
            setTotal(data.total || 0);
            setHasNextPage(Boolean(data.hasNextPage));
            setBackendActiveCount(typeof data.activeCount === 'number' ? data.activeCount : null);
            setTotalQuantidade(typeof data.totalQuantidade === 'number' ? data.totalQuantidade : 0);
            setConcessionariaInfo(data.concessionaria || null);
            setDraftPrices({});
            setDraftPrazos({});
            setDraftObs({});
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar catálogo');
        } finally {
            setLoading(false);
        }
    }, [buildCatalogUrl, page]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadCatalog();
        }, 250);

        return () => clearTimeout(timer);
    }, [loadCatalog]);

    // Filtros mudaram: a página atual pode não existir no novo resultado.
    useEffect(() => {
        setPage(1);
    }, [search, queryStatus, tipo, concessionariaId]);

    const handlePageChange = (nextPage: number) => {
        const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const target = Math.min(Math.max(1, nextPage), lastPage);
        if (target === page) return;
        setPage(target);
        tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const clientActiveCount = useMemo(() => rows.filter(row => row.ativo).length, [rows]);
    const activeCount = backendActiveCount ?? clientActiveCount;
    const inactiveCount = total - activeCount;

    const allPageRowsSelected = rows.length > 0 && rows.every(row => selectedIds.has(row.variationId));
    const somePageRowsSelected = rows.some(row => selectedIds.has(row.variationId));

    const updateRowFields = async (row: PricingRow, rawPriceValue: string, newStatusVeiculo?: string, rawQuantidadeValue?: string, rawPrazoValue?: string, rawObsValue?: string) => {
        const rawTrimmed = rawPriceValue.trim();
        const preco = parseCurrency(rawPriceValue);
        const statusVeiculo = newStatusVeiculo !== undefined ? newStatusVeiculo : (row.statusVeiculo || 'A faturar');
        const quantidadeRawStr = rawQuantidadeValue !== undefined ? rawQuantidadeValue : (draftQuantities[row.variationId] ?? String(row.quantidade || 0));
        let quantidade = parseInt(quantidadeRawStr, 10);
        if (isNaN(quantidade) || quantidade < 0) quantidade = 0;

        if (preco !== null && preco > 0 && quantidade === 0) {
            quantidade = 1;
            setDraftQuantities(prev => ({ ...prev, [row.variationId]: '1' }));
        } else if (preco === null || preco === 0) {
            if (quantidade !== 0) {
                quantidade = 0;
                setDraftQuantities(prev => ({ ...prev, [row.variationId]: '0' }));
            }
        }

        const prazoRawStr = rawPrazoValue !== undefined ? rawPrazoValue : (draftPrazos[row.variationId] ?? String(row.prazo ?? ''));
        let prazo = parsePrazo(prazoRawStr);

        if (preco === null || preco === 0) {
            prazo = null;
            setDraftPrazos(prev => ({ ...prev, [row.variationId]: '' }));
        }

        const observacoes = (rawObsValue !== undefined ? rawObsValue : (draftObs[row.variationId] ?? row.observacoes ?? '')).trim();

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
                    quantidade,
                    prazo,
                    observacoes,
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
                    quantidade: data.quantidade ?? item.quantidade,
                    prazo: data.prazo ?? item.prazo,
                    observacoes: data.observacoes ?? '',
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
            setDraftQuantities(prev => {
                const next = { ...prev };
                delete next[row.variationId];
                return next;
            });
            setDraftPrazos(prev => {
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

    const moveToNextField = (index: number, currentCol: 'preco' | 'qtd' | 'prazo' | 'obs' | 'status') => {
        let nextCol: 'preco' | 'qtd' | 'prazo' | 'obs' | 'status' | null = null;
        let targetIndex = index;

        if (currentCol === 'preco') nextCol = 'qtd';
        else if (currentCol === 'qtd') nextCol = 'prazo';
        else if (currentCol === 'prazo') nextCol = 'obs';
        else if (currentCol === 'obs') nextCol = 'status';
        else if (currentCol === 'status') {
            nextCol = 'preco';
            targetIndex = index + 1;
        }

        if (nextCol) {
            const selector = `[data-row-index="${targetIndex}"][data-col="${nextCol}"]`;
            const nextElem = document.querySelector<HTMLElement>(selector);
            nextElem?.focus();
            if (nextElem instanceof HTMLInputElement) {
                nextElem.select();
            }
        }
    };

    // Seleciona/desmarca apenas a página visível, preservando o que já foi
    // marcado em outras páginas.
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setSelectedIds(prev => {
            const next = new Set(prev);
            for (const row of rows) {
                if (checked) next.add(row.variationId);
                else next.delete(row.variationId);
            }
            return next;
        });
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        const next = new Set(selectedIds);
        if (checked) next.add(id);
        else next.delete(id);
        setSelectedIds(next);
    };

    // A tabela é paginada, então a planilha não pode sair apenas das linhas
    // visíveis: busca todas as páginas do filtro atual antes de gerar o CSV.
    const fetchAllRows = async () => {
        const all: PricingRow[] = [];
        let currentPage = 1;

        while (true) {
            const res = await fetch(buildCatalogUrl(currentPage, EXPORT_PAGE_SIZE));
            const data: PricingResponse = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao carregar catálogo para exportação');

            all.push(...(data.data || []));
            if (!data.hasNextPage || (data.data || []).length === 0) break;
            currentPage += 1;
        }

        return all;
    };

    const handleExportCSV = async () => {
        setExporting(true);
        setError(null);

        let exportRows: PricingRow[];
        try {
            exportRows = await fetchAllRows();
        } catch (err: any) {
            setError(err?.message || 'Erro ao exportar catálogo');
            return;
        } finally {
            setExporting(false);
        }

        const headers = [
            'dataEntrada', 'modelo', 'transmissao', 'combustivel', 'cor', 'ano', 'opcionais',
            'preco', 'prazo', 'status', 'observacoes', 'cidade', 'estado', 'frete', 'telefone',
            'concession', 'nome contato', 'operador'
        ];
        const csvRows = [headers.join(';')]; // Using semicolon to avoid issues in Brazil's Excel

        for (const row of exportRows) {
            const qtd = row.quantidade || 0;
            // If quantity is 0, we'll export 1 row as inactive template so the user can fill it.
            const iterations = qtd > 0 ? qtd : 1;
            
            const precoAtual = row.preco || 0;
            const dataEntradaStr = row.updatedAt ? new Date(row.updatedAt).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
            const anoFormatado = row.anoFabricacao && row.anoModelo 
                ? `${String(row.anoFabricacao).slice(-2)}/${String(row.anoModelo).slice(-2)}` 
                : (row.anoModelo?.toString() || '');
            
            const cols = [
                `"${dataEntradaStr}"`,
                `"${row.modelo || ''}"`,
                `"${row.transmissao || ''}"`,
                `"${row.combustivel || ''}"`,
                `"${row.cor || ''}"`,
                `"${anoFormatado}"`,
                `"${row.opcionais || ''}"`,
                precoAtual,
                `"${row.prazo === 0 ? 'Pronta Entrega' : (row.prazo ?? '')}"`,
                `"${row.statusVeiculo || 'A faturar'}"`,
                `"${row.observacoes || ''}"`,
                `"${concessionariaInfo?.cidade || ''}"`,
                `"${concessionariaInfo?.uf || ''}"`,
                row.frete || 0,
                `"${concessionariaInfo?.telefone || ''}"`,
                `"${concessionariaInfo?.nome || ''}"`,
                `"${concessionariaInfo?.contato || concessionariaInfo?.nomeResponsavel || ''}"`,
                `"${concessionariaInfo?.operadorId || ''}"`
            ];
            
            for (let i = 0; i < iterations; i++) {
                csvRows.push(cols.join(';'));
            }
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
        const itemsToProcess: any[] = [];
        
        const separator = lines[0].includes(';') ? ';' : ',';
        const headerLine = lines[0].split(separator).map(h => h.replace(/"/g, '').trim().toLowerCase());
        
        const idx = {
            modelo: headerLine.findIndex(h => h.includes('modelo')),
            transmissao: headerLine.findIndex(h => h.includes('transmissao') || h.includes('cambio') || h.includes('câmbio')),
            combustivel: headerLine.findIndex(h => h.includes('combustivel') || h.includes('combustível')),
            cor: headerLine.findIndex(h => h.includes('cor')),
            ano: headerLine.findIndex(h => h.includes('ano')),
            opcionais: headerLine.findIndex(h => h.includes('opcionais')),
            preco: headerLine.findIndex(h => h === 'preco' || h === 'preço' || h.includes('novo_preco') || h.includes('preco_atual')),
            status: headerLine.findIndex(h => h === 'status' || h.includes('novo_status')),
            obs: headerLine.findIndex(h => h.includes('observacoes') || h.includes('observações')),
            prazo: headerLine.findIndex(h => h.includes('prazo')),
            frete: headerLine.findIndex(h => h.includes('frete')),
        };
        
        if (idx.modelo === -1 || idx.preco === -1) {
            setError('CSV Inválido. O arquivo deve conter pelo menos as colunas "modelo" e "preco".');
            return;
        }
        
        for (let i = 1; i < lines.length; i++) {
            const rowStr = lines[i].trim();
            if (!rowStr) continue;
            
            const colsArray: string[] = [];
            let inQuotes = false;
            let currentStr = '';
            for (let char of rowStr) {
                if (char === '"') inQuotes = !inQuotes;
                else if (char === separator && !inQuotes) {
                    colsArray.push(currentStr);
                    currentStr = '';
                } else {
                    currentStr += char;
                }
            }
            colsArray.push(currentStr);
            
            const getCol = (index: number) => index !== -1 ? colsArray[index]?.replace(/"/g, '').trim() : undefined;
            
            const modelo = getCol(idx.modelo);
            const rawPrice = getCol(idx.preco);
            
            if (modelo && rawPrice !== undefined && rawPrice !== '') {
                const parsed = parseCurrency(rawPrice);
                
                itemsToProcess.push({
                    modelo,
                    transmissao: getCol(idx.transmissao),
                    combustivel: getCol(idx.combustivel),
                    cor: getCol(idx.cor),
                    ano: getCol(idx.ano),
                    opcionais: getCol(idx.opcionais),
                    preco: parsed || 0,
                    statusVeiculo: getCol(idx.status),
                    prazo: parsePrazo(getCol(idx.prazo)),
                    observacoes: getCol(idx.obs),
                    frete: parseCurrency(getCol(idx.frete) || '') || 0,
                });
            }
        }
        
        if (itemsToProcess.length > 0) {
            setLoading(true);
            try {
                const patchUrl = concessionariaId 
                    ? `/api/dealership/pricing-catalog/bulk?concessionariaId=${concessionariaId}`
                    : '/api/dealership/pricing-catalog/bulk';

                const res = await fetch(patchUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: itemsToProcess }),
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erro ao processar importação');
                
                await loadCatalog();
                
                if (data.report) {
                    setImportReport({
                        successes: data.report.successes || [],
                        errors: data.report.errors || [],
                    });
                }
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
        const n = selectedIds.size;
        const ok = await confirm({ title: `Zerar preço de ${n} ${n === 1 ? 'veículo' : 'veículos'}`, description: 'Os veículos saem da consulta dos clientes até você informar um preço de novo.', confirmLabel: 'Zerar preço', danger: true });
        if (!ok) return;
        
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

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao processar inativação em massa');

            setSelectedIds(new Set());
            await loadCatalog();
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <StatGrid>
                <StatCard label="Variações no catálogo" icon={<BookOpen size={18} />} value={total.toLocaleString('pt-BR')} caption={concessionariaInfo?.marca ? `Marca vinculada: ${concessionariaInfo.marca}` : 'Catálogo 0KM da CNV'} />
                <StatCard label="Veículos disponíveis" icon={<CarFront size={18} />} value={totalQuantidade.toLocaleString('pt-BR')} caption="Soma das quantidades com preço" />
                <StatCard
                    label="Sem preço"
                    icon={<TriangleAlert size={18} />}
                    value={inactiveCount.toLocaleString('pt-BR')}
                    tone={inactiveCount > 0 ? 'warning' : 'default'}
                    progress={total ? ((total - inactiveCount) / total) * 100 : 0}
                    caption={inactiveCount > 0 ? `${(total - inactiveCount).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} já aparecem ao cliente` : 'Todas as versões já aparecem ao cliente'}
                />
            </StatGrid>

            <Panel className={pageStyles.panelVisible}>
                <PanelToolbar>
                    <div className={pageStyles.toolbarGroup}>
                        <SearchField value={search} onChange={setSearch} placeholder="Modelo, cor ou código FIPE" />
                        <Segmented<'todos' | 'carro' | 'moto'>
                            label="Tipo de veículo"
                            value={tipo}
                            onChange={setTipo}
                            options={[{ value: 'todos', label: 'Todos' }, { value: 'carro', label: 'Carros' }, { value: 'moto', label: 'Motos' }]}
                        />
                        <Segmented<PricingStatus>
                            label="Situação do preço"
                            value={status}
                            onChange={setStatus}
                            options={[{ value: 'todos', label: 'Todos' }, { value: 'inativo', label: 'Sem preço' }, { value: 'ativo', label: 'Com preço' }]}
                        />
                    </div>
                    {selectedIds.size > 0 ? (
                        <Button variant="danger" icon={<Trash2 size={16} aria-hidden="true" />} onClick={handleMassZerar}>
                            Zerar {selectedIds.size} {selectedIds.size === 1 ? 'selecionado' : 'selecionados'}
                        </Button>
                    ) : (
                        <div className={pageStyles.toolbarGroupEnd}>
                            <Button icon={<Download size={16} aria-hidden="true" />} onClick={handleExportCSV} disabled={exporting}>
                                {exporting ? 'Gerando planilha...' : 'Baixar planilha'}
                            </Button>
                            <Button icon={<Upload size={16} aria-hidden="true" />} onClick={() => fileInputRef.current?.click()}>Importar CSV</Button>
                            <input type="file" accept=".csv" hidden ref={fileInputRef} onChange={handleImportCSV} />
                        </div>
                    )}
                </PanelToolbar>
                {error && <div className={pageStyles.panelNotice}><InlineNotice>{error}</InlineNotice></div>}
            </Panel>

            <div className={styles.tableShell} ref={tableRef}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={allPageRowsSelected}
                                    ref={input => {
                                        if (input) input.indeterminate = !allPageRowsSelected && somePageRowsSelected;
                                    }}
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
                            <th style={{ width: '80px' }}>Qtd</th>
                            <th style={{ width: '80px' }}>Prazo</th>
                            <th style={{ minWidth: '150px' }}>Observações</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={12} className={styles.empty}>Carregando catálogo...</td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={12} className={styles.empty}>Nenhuma variação encontrada.</td>
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
                                                data-row-index={index}
                                                data-col="preco"
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
                                                        updateRowFields(row, event.currentTarget.value).then(() => moveToNextField(index, 'preco'));
                                                    }
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        <div className={styles.numberCell}>
                                            <input
                                                data-row-index={index}
                                                data-col="qtd"
                                                type="number"
                                                min="0"
                                                value={draftQuantities[row.variationId] ?? row.quantidade ?? 0}
                                                disabled={isSaving || !row.ativo}
                                                className={styles.priceInput}
                                                style={{ textAlign: 'center' }}
                                                onChange={event => setDraftQuantities(prev => ({
                                                    ...prev,
                                                    [row.variationId]: event.target.value,
                                                }))}
                                                onBlur={event => updateRowFields(row, draftPrices[row.variationId] ?? formatCurrency(row.preco), undefined, event.target.value)}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        updateRowFields(row, draftPrices[row.variationId] ?? formatCurrency(row.preco), undefined, event.currentTarget.value).then(() => moveToNextField(index, 'qtd'));
                                                    }
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        <div className={styles.prazoCell}>
                                            <input
                                                data-row-index={index}
                                                data-col="prazo"
                                                type="text"
                                                value={
                                                    draftPrazos[row.variationId] !== undefined 
                                                        ? draftPrazos[row.variationId] 
                                                        : (row.prazo === 0 ? 'Pronta Entrega' : (row.prazo ?? ''))
                                                }
                                                list={`prazo-options-${row.variationId}`}
                                                disabled={isSaving || !row.ativo}
                                                className={styles.priceInput}
                                                style={{ 
                                                    textAlign: 'center',
                                                    fontSize: String(draftPrazos[row.variationId] !== undefined ? draftPrazos[row.variationId] : (row.prazo === 0 ? 'Pronta Entrega' : (row.prazo ?? ''))).toLowerCase().includes('pronta') ? '0.65rem' : '0.95rem'
                                                }}
                                                onChange={event => setDraftPrazos(prev => ({
                                                    ...prev,
                                                    [row.variationId]: event.target.value,
                                                }))}
                                                onBlur={event => updateRowFields(row, draftPrices[row.variationId] ?? formatCurrency(row.preco), undefined, undefined, event.target.value)}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        updateRowFields(row, draftPrices[row.variationId] ?? formatCurrency(row.preco), undefined, undefined, event.currentTarget.value).then(() => moveToNextField(index, 'prazo'));
                                                    }
                                                }}
                                            />
                                        </div>
                                        <datalist id={`prazo-options-${row.variationId}`}>
                                            <option value="Pronta Entrega" />
                                        </datalist>
                                    </td>
                                    <td>
                                        <input
                                            data-row-index={index}
                                            data-col="obs"
                                            type="text"
                                            value={draftObs[row.variationId] ?? row.observacoes ?? ''}
                                            disabled={isSaving}
                                            className={`${styles.priceInput} ${styles.obsInput}`}
                                            placeholder="Ex.: pronta entrega, sem troca"
                                            title={row.observacoes || ''}
                                            onChange={event => setDraftObs(prev => ({
                                                ...prev,
                                                [row.variationId]: event.target.value,
                                            }))}
                                            onBlur={event => updateRowFields(row, draftPrices[row.variationId] ?? formatCurrency(row.preco), undefined, undefined, undefined, event.target.value)}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    updateRowFields(row, draftPrices[row.variationId] ?? formatCurrency(row.preco), undefined, undefined, undefined, event.currentTarget.value).then(() => moveToNextField(index, 'obs'));
                                                }
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <div className={styles.statusStack}>
                                            <select
                                                data-row-index={index}
                                                data-col="status"
                                                value={draftStatuses[row.variationId] ?? row.statusVeiculo ?? 'A faturar'}
                                                onChange={e => {
                                                    const newStatus = e.target.value;
                                                    setDraftStatuses(prev => ({ ...prev, [row.variationId]: newStatus }));
                                                    updateRowFields(row, draftPrices[row.variationId] ?? formatCurrency(row.preco), newStatus);
                                                }}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        moveToNextField(index, 'status');
                                                    }
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

            {total > 0 && (
                <Pagination
                    currentPage={page}
                    totalItems={total}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={handlePageChange}
                    loading={loading}
                    hasNextPage={hasNextPage}
                />
            )}

            {importReport && (
                <AdminModal
                    title="Relatório de importação"
                    onClose={() => setImportReport(null)}
                    size="md"
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setImportReport(null)}>
                            Fechar
                        </button>
                        <button type="button" className={modalStyles.primary} onClick={() => {
                            if (!importReport) return;
                            let txt = `RELATÓRIO DE IMPORTAÇÃO\nData: ${new Date().toLocaleString()}\n`;
                            txt += `Sucesso: ${importReport.successes.length} registros.\n`;
                            txt += `Erros: ${importReport.errors.length} não encontrados.\n\n`;
                            if (importReport.successes.length > 0) {
                                txt += `--- SUCESSOS ---\n`;
                                importReport.successes.forEach((s: any) => {
                                    txt += `[QTD: ${s.item.quantidade}] ${s.item.modelo} | ${s.item.cor} | ${s.item.ano} | ${s.item.opcionais} -> Preço: ${s.item.preco}\n`;
                                });
                                txt += `\n`;
                            }
                            if (importReport.errors.length > 0) {
                                txt += `--- ERROS ---\n`;
                                importReport.errors.forEach((e: any) => {
                                    txt += `[QTD: ${e.item.quantidade}] ${e.item.modelo} | ${e.item.cor} | ${e.item.ano} | ${e.item.opcionais} | ${e.item.combustivel} | ${e.item.transmissao} -> Motivo: ${e.message || 'Erro'}\n`;
                                });
                            }
                            const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'relatorio_importacao.txt';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        }}>
                            <FaFileExport /> Baixar relatório
                        </button>
                    </>}
                >
                    <div className={styles.modalSummary}>
                        <div className={styles.summaryCard + ' ' + styles.summarySuccess}>
                            <FaCheckCircle />
                            <div>
                                <strong>{importReport.successes.length}</strong>
                                <span>Atualizados</span>
                            </div>
                        </div>
                        <div className={styles.summaryCard + ' ' + styles.summaryError}>
                            <FaTimesCircle />
                            <div>
                                <strong>{importReport.errors.length}</strong>
                                <span>Não encontrados</span>
                            </div>
                        </div>
                    </div>

                    {importReport.successes.length > 0 && (
                        <details open>
                            <summary className={styles.sectionTitle + ' ' + styles.successTitle}>
                                Veículos atualizados ({importReport.successes.length})
                            </summary>
                            <ul className={styles.reportList}>
                                {importReport.successes.map((s: any, i: number) => (
                                    <li key={`s-${i}`} className={styles.reportItemSuccess}>
                                        <span className={styles.reportQtd}>QTD: {s.item.quantidade}</span>
                                        <span>{s.item.modelo}</span>
                                        {s.item.cor && <span className={styles.reportDetail}>{s.item.cor}</span>}
                                        {s.item.ano && <span className={styles.reportDetail}>{s.item.ano}</span>}
                                        <span className={styles.reportPrice}>R$ {formatCurrency(s.item.preco)}</span>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}

                    {importReport.errors.length > 0 && (
                        <details open>
                            <summary className={styles.sectionTitle + ' ' + styles.errorTitle}>
                                Não encontrados no catálogo ({importReport.errors.length})
                            </summary>
                            <ul className={styles.reportList}>
                                {importReport.errors.map((e: any, i: number) => (
                                    <li key={`e-${i}`} className={styles.reportItemError}>
                                        <span className={styles.reportQtd}>QTD: {e.item.quantidade}</span>
                                        <span>{e.item.modelo}</span>
                                        {e.item.cor && <span className={styles.reportDetail}>{e.item.cor}</span>}
                                        {e.item.ano && <span className={styles.reportDetail}>{e.item.ano}</span>}
                                        {e.item.combustivel && <span className={styles.reportDetail}>{e.item.combustivel}</span>}
                                        {e.item.transmissao && <span className={styles.reportDetail}>{e.item.transmissao}</span>}
                                        {e.message && <span className={`${styles.reportDetail} ${styles.reportMotivo}`}>{e.message}</span>}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </AdminModal>
            )}
            {feedback}
        </div>
    );
}
