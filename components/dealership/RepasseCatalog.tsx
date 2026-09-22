'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaPlus } from 'react-icons/fa';
import { Pagination } from '../Pagination';
import { PlanoRepasseCard } from './PlanoRepasseCard';
import {
    REPASSE_COMBUSTIVEIS,
    REPASSE_STATUS,
    REPASSE_TRANSMISSOES,
    formatKm,
    type RepasseStatus,
} from '../../lib/utils/repasse';
import base from './PricingCatalog.module.css';
import styles from './RepasseCatalog.module.css';

interface RepasseRow {
    id: string;
    tipoVeiculo: 'carro' | 'moto';
    marca: string;
    modelo: string;
    ano: string;
    anoModelo: number;
    km: number;
    cor: string;
    combustivel: string;
    transmissao: string;
    opcionais: string;
    preco: number;
    observacoes: string;
    status: RepasseStatus;
    updatedAt: string;
}

type FormState = {
    tipoVeiculo: 'carro' | 'moto';
    marca: string;
    modelo: string;
    ano: string;
    km: string;
    cor: string;
    combustivel: string;
    transmissao: string;
    opcionais: string;
    preco: string;
    observacoes: string;
    status: RepasseStatus;
};

const EMPTY_FORM: FormState = {
    tipoVeiculo: 'carro',
    marca: '',
    modelo: '',
    ano: '',
    km: '',
    cor: '',
    combustivel: 'Flex',
    transmissao: 'Manual',
    opcionais: '',
    preco: '',
    observacoes: '',
    status: 'Disponível',
};

const PAGE_SIZE = 50;

function formatCurrency(value: number | null | undefined) {
    if (!value) return '-';
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusClass(status: RepasseStatus) {
    if (status === 'Disponível') return styles.statusDisponivel;
    if (status === 'Reservado') return styles.statusReservado;
    return styles.statusVendido;
}

export interface RepasseCatalogProps {
    /** Equipe interna escolhendo a concessionária. Ausente = a do usuário logado. */
    concessionariaId?: string;
}

export function RepasseCatalog({ concessionariaId }: RepasseCatalogProps) {
    const [rows, setRows] = useState<RepasseRow[]>([]);
    const [total, setTotal] = useState(0);
    const [contagem, setContagem] = useState<Record<string, number>>({ 'Disponível': 0, 'Reservado': 0, 'Vendido': 0 });
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | RepasseStatus>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});
    const [marcas, setMarcas] = useState<string[]>([]);
    // null = ainda carregando. Sem plano ativo a loja não cadastra repasse novo.
    const [planoAtivo, setPlanoAtivo] = useState<boolean | null>(null);

    const scopeQuery = concessionariaId ? `concessionariaId=${encodeURIComponent(concessionariaId)}` : '';
    const withScope = useCallback((path: string) => {
        if (!scopeQuery) return path;
        return path + (path.includes('?') ? '&' : '?') + scopeQuery;
    }, [scopeQuery]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
            if (search.trim()) params.set('search', search.trim());
            if (statusFilter) params.set('status', statusFilter);
            const res = await fetch(withScope(`/api/dealership/repasse?${params.toString()}`));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao carregar repasse');
            setRows(data.data || []);
            setTotal(data.total || 0);
            setHasNextPage(Boolean(data.hasNextPage));
            setContagem(data.contagem || {});
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar repasse');
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter, withScope]);

    useEffect(() => {
        const timer = setTimeout(load, 250);
        return () => clearTimeout(timer);
    }, [load]);

    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, concessionariaId]);

    // Sugestão de marca: nomes do catálogo sem os sufixos operacionais ("- IPVA").
    useEffect(() => {
        fetch('/api/catalog/brands')
            .then(res => (res.ok ? res.json() : []))
            .then((list: Array<{ nome: string }>) => {
                const nomes = new Set<string>();
                for (const m of list || []) {
                    const nome = String(m.nome || '').split(' - ')[0].trim().toUpperCase();
                    if (nome && !/^\d/.test(nome)) nomes.add(nome);
                }
                setMarcas(Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR')));
            })
            .catch(() => setMarcas([]));
    }, []);

    const openNew = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    };

    const openEdit = (row: RepasseRow) => {
        setEditingId(row.id);
        setForm({
            tipoVeiculo: row.tipoVeiculo || 'carro',
            marca: row.marca || '',
            modelo: row.modelo || '',
            ano: row.ano || String(row.anoModelo || ''),
            km: row.km != null ? String(row.km) : '',
            cor: row.cor || '',
            combustivel: row.combustivel || '',
            transmissao: row.transmissao || '',
            opcionais: row.opcionais || '',
            preco: row.preco ? row.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
            observacoes: row.observacoes || '',
            status: row.status,
        });
        setFormError(null);
        setFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditingId(null);
        setFormError(null);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            const url = editingId ? `/api/dealership/repasse/${editingId}` : '/api/dealership/repasse';
            const res = await fetch(withScope(url), {
                method: editingId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
            closeForm();
            await load();
        } catch (err: any) {
            setFormError(err?.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const changeStatus = async (row: RepasseRow, status: RepasseStatus) => {
        if (status === row.status) return;
        setRowSaving(prev => ({ ...prev, [row.id]: true }));
        try {
            const res = await fetch(withScope(`/api/dealership/repasse/${row.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao alterar status');
            await load();
        } catch (err: any) {
            setError(err?.message || 'Erro ao alterar status');
        } finally {
            setRowSaving(prev => ({ ...prev, [row.id]: false }));
        }
    };

    const remove = async (row: RepasseRow) => {
        if (!window.confirm(`Excluir ${row.marca} ${row.modelo} do repasse?\n\nSe o carro foi vendido, prefira mudar o status para Vendido.`)) return;
        setRowSaving(prev => ({ ...prev, [row.id]: true }));
        try {
            const res = await fetch(withScope(`/api/dealership/repasse/${row.id}`), { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao excluir');
            await load();
        } catch (err: any) {
            setError(err?.message || 'Erro ao excluir');
        } finally {
            setRowSaving(prev => ({ ...prev, [row.id]: false }));
        }
    };

    const naVitrine = (contagem['Disponível'] || 0) + (contagem['Reservado'] || 0);
    const set = <K extends keyof FormState>(key: K) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [key]: event.target.value as FormState[K] }));

    const statusTabs = useMemo(() => ([['', 'Todos'], ...REPASSE_STATUS.map(s => [s, s])] as Array<['' | RepasseStatus, string]>), []);

    return (
        <div className={base.container}>
            <div className={base.toolbar}>
                <div>
                    <h2 className={base.title}>Repasse</h2>
                    <p className={base.subtitle}>
                        Usados recebidos na troca. Aparecem para os lojistas enquanto estiverem Disponíveis ou Reservados e o plano estiver em dia. Fotos e placa o lojista pede pelo WhatsApp.
                    </p>
                </div>
                <div className={base.summary}>
                    <span>{naVitrine} na vitrine</span>
                    <span>{contagem['Reservado'] || 0} reservados</span>
                    <span>{contagem['Vendido'] || 0} vendidos</span>
                </div>
            </div>

            <PlanoRepasseCard key={concessionariaId || 'loja'} concessionariaId={concessionariaId} onChange={setPlanoAtivo} />

            {!formOpen && (
                <div className={base.bulkActionsRow}>
                    <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={openNew}
                        disabled={planoAtivo !== true}
                        title={planoAtivo === false ? 'Contrate um plano de repasse para anunciar' : undefined}
                    >
                        <FaPlus /> Adicionar repasse
                    </button>
                </div>
            )}

            {formOpen && (
                <form className={styles.formPanel} onSubmit={submit}>
                    <div className={styles.formHeader}>
                        <h3>{editingId ? 'Editar repasse' : 'Novo repasse'}</h3>
                    </div>
                    <div className={styles.formGrid}>
                        <label>
                            Tipo
                            <select value={form.tipoVeiculo} onChange={set('tipoVeiculo')}>
                                <option value="carro">Carro</option>
                                <option value="moto">Moto</option>
                            </select>
                        </label>
                        <label>
                            <span className={styles.required}>Marca</span>
                            <input value={form.marca} onChange={set('marca')} list="repasse-marcas" placeholder="Ex.: CHEVROLET" required />
                            <datalist id="repasse-marcas">
                                {marcas.map(m => <option key={m} value={m} />)}
                            </datalist>
                        </label>
                        <label>
                            <span className={styles.required}>Modelo</span>
                            <input value={form.modelo} onChange={set('modelo')} placeholder="Ex.: ONIX LT 1.0 TURBO" required />
                        </label>
                        <label>
                            <span className={styles.required}>Ano</span>
                            <input value={form.ano} onChange={set('ano')} placeholder="19/20" required />
                        </label>
                        <label>
                            <span className={styles.required}>Quilometragem</span>
                            <input value={form.km} onChange={set('km')} inputMode="numeric" placeholder="Ex.: 48.500" required />
                        </label>
                        <label>
                            <span className={styles.required}>Preço</span>
                            <input value={form.preco} onChange={set('preco')} inputMode="decimal" placeholder="Ex.: 72.900,00" required />
                        </label>
                        <label>
                            Cor
                            <input value={form.cor} onChange={set('cor')} placeholder="Ex.: PRATA" />
                        </label>
                        <label>
                            Combustível
                            <select value={form.combustivel} onChange={set('combustivel')}>
                                <option value="">—</option>
                                {REPASSE_COMBUSTIVEIS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </label>
                        <label>
                            Câmbio
                            <select value={form.transmissao} onChange={set('transmissao')}>
                                <option value="">—</option>
                                {REPASSE_TRANSMISSOES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </label>
                        <label>
                            Status
                            <select value={form.status} onChange={set('status')}>
                                {REPASSE_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                        <label className={styles.wide}>
                            Opcionais
                            <input value={form.opcionais} onChange={set('opcionais')} placeholder="Ex.: multimídia, câmera de ré, rodas de liga" />
                        </label>
                        <label className={styles.wide}>
                            Observações
                            <input value={form.observacoes} onChange={set('observacoes')} placeholder="Ex.: único dono, revisões na concessionária, pneus novos" />
                        </label>
                    </div>

                    {formError && <div className={base.error} style={{ marginTop: '0.85rem' }}>{formError}</div>}

                    <div className={styles.formActions}>
                        <button type="button" className={styles.ghostBtn} onClick={closeForm} disabled={saving}>Cancelar</button>
                        <button type="submit" className={styles.primaryBtn} disabled={saving}>
                            {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar repasse'}
                        </button>
                    </div>
                </form>
            )}

            <div className={base.filters}>
                <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Buscar marca, modelo, cor..."
                    className={base.search}
                />
                <div className={base.segmented}>
                    {statusTabs.map(([value, label]) => (
                        <button
                            key={label}
                            type="button"
                            className={`${base.segment} ${statusFilter === value ? base.segmentActive : ''}`}
                            onClick={() => setStatusFilter(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className={base.error}>{error}</div>}

            <div className={base.tableShell}>
                <table className={base.table}>
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Marca</th>
                            <th>Modelo</th>
                            <th>Ano</th>
                            <th>KM</th>
                            <th>Cor</th>
                            <th>Combustível</th>
                            <th>Câmbio</th>
                            <th>Preço</th>
                            <th style={{ minWidth: '150px' }}>Observações</th>
                            <th style={{ minWidth: '130px' }}>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 ? (
                            <tr><td colSpan={12} className={base.empty}>Carregando...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={12} className={base.empty}>
                                    {search || statusFilter ? 'Nenhum repasse encontrado com esses filtros.' : 'Nenhum repasse cadastrado. Clique em "Adicionar repasse" para começar.'}
                                </td>
                            </tr>
                        ) : rows.map(row => (
                            <tr key={row.id} className={row.status === 'Vendido' ? styles.soldRow : ''}>
                                <td><span className={styles.tipoTag}>{row.tipoVeiculo === 'moto' ? 'MOTO' : 'CARRO'}</span></td>
                                <td>{row.marca}</td>
                                <td><strong>{row.modelo}</strong></td>
                                <td>{row.ano || row.anoModelo}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{formatKm(row.km)}</td>
                                <td>{row.cor || '-'}</td>
                                <td>{row.combustivel || '-'}</td>
                                <td>{row.transmissao || '-'}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{formatCurrency(row.preco)}</td>
                                <td title={row.observacoes}>{row.observacoes || '-'}</td>
                                <td>
                                    <select
                                        value={row.status}
                                        disabled={rowSaving[row.id]}
                                        onChange={event => changeStatus(row, event.target.value as RepasseStatus)}
                                        className={`${base.statusSelect} ${statusClass(row.status)}`}
                                    >
                                        {REPASSE_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <div className={styles.rowActions}>
                                        <button type="button" className={styles.iconBtn} title="Editar" onClick={() => openEdit(row)} disabled={rowSaving[row.id]}>✏️</button>
                                        <button type="button" className={styles.iconBtn} title="Excluir" onClick={() => remove(row)} disabled={rowSaving[row.id]}>🗑️</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {total > PAGE_SIZE && (
                <Pagination
                    currentPage={page}
                    totalItems={total}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={setPage}
                    loading={loading}
                    hasNextPage={hasNextPage}
                />
            )}
        </div>
    );
}
