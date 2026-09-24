'use client';

import { useCallback, useEffect, useState } from 'react';
import { FaPlus } from 'react-icons/fa';
import { Pagination } from '../Pagination';
import { AdminModal, modalStyles } from '../admin/AdminModal';
import { AutocompleteField, matchLocalBrand, useFipeCascade } from '../catalog/FipeLookup';
import type { FipeDetail } from '../../lib/services/fipeService';
import { PlanoRepasseCard } from './PlanoRepasseCard';
import { REPASSE_COMBUSTIVEIS, REPASSE_TRANSMISSOES, formatKm } from '../../lib/utils/repasse';
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
    updatedAt: string;
    foraDoCatalogo?: boolean;
    codigoFipe?: string;
    descricaoFipe?: string;
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
    /** Veículo que não aparece na FIPE: marca e modelo digitados à mão. */
    foraDoCatalogo: boolean;
    codigoFipe: string;
    descricaoFipe: string;
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
    foraDoCatalogo: false,
    codigoFipe: '',
    descricaoFipe: '',
};

/** Combustível da FIPE na grafia usada no repasse. */
function fipeFuel(fuel: string) {
    const map: Record<string, string> = { alcool: 'Etanol', 'álcool': 'Etanol', gasolina: 'Gasolina', diesel: 'Diesel', flex: 'Flex', 'elétrico': 'Elétrico', eletrico: 'Elétrico', 'híbrido': 'Híbrido', hibrido: 'Híbrido' };
    return map[fuel.trim().toLowerCase()] || fuel.trim();
}

const PAGE_SIZE = 50;

function formatCurrency(value: number | null | undefined) {
    if (!value) return '-';
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface RepasseCatalogProps {
    /** Equipe interna escolhendo a concessionária. Ausente = a do usuário logado. */
    concessionariaId?: string;
}

export function RepasseCatalog({ concessionariaId }: RepasseCatalogProps) {
    const [rows, setRows] = useState<RepasseRow[]>([]);
    const [total, setTotal] = useState(0);
    const [contagem, setContagem] = useState<Record<string, number>>({ 'Disponível': 0 });
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [search, setSearch] = useState('');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});
    const [marcas, setMarcas] = useState<string[]>([]);
    // Marca, modelo e ano vêm da FIPE: a loja encontra qualquer carro e a vitrine
    // recebe uma grafia única. Texto livre só marcando "não encontrei na FIPE".
    const fipe = useFipeCascade(form.tipoVeiculo);
    const [fipeRef, setFipeRef] = useState<{ price: string; month: string } | null>(null);
    const [originalModelo, setOriginalModelo] = useState('');
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
    }, [page, search, withScope]);

    useEffect(() => {
        const timer = setTimeout(load, 250);
        return () => clearTimeout(timer);
    }, [load]);

    useEffect(() => {
        setPage(1);
    }, [search, concessionariaId]);

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

    const { reset: resetFipe } = fipe;

    const openNew = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setOriginalModelo('');
        setFipeRef(null);
        resetFipe();
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
            foraDoCatalogo: Boolean(row.foraDoCatalogo),
            codigoFipe: row.codigoFipe || '',
            descricaoFipe: row.descricaoFipe || '',
        });
        setOriginalModelo(row.modelo || '');
        setFipeRef(null);
        resetFipe();
        setFormError(null);
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditingId(null);
        setFormError(null);
    };

    const applyFipeDetail = (detail: FipeDetail) => {
        setForm(prev => ({
            ...prev,
            codigoFipe: detail.codeFipe,
            descricaoFipe: detail.model,
            combustivel: fipeFuel(detail.fuel) || prev.combustivel,
            ano: detail.modelYear === 32000 ? prev.ano : (prev.ano.includes('/') ? `${prev.ano.split('/')[0]}/${String(detail.modelYear).slice(-2)}` : String(detail.modelYear)),
        }));
        setFipeRef(detail.price ? { price: detail.price, month: detail.referenceMonth } : null);
    };
    const brandList = marcas.map(nome => ({ nome }));
    const combustiveis = form.combustivel && !REPASSE_COMBUSTIVEIS.includes(form.combustivel) ? [...REPASSE_COMBUSTIVEIS, form.combustivel] : REPASSE_COMBUSTIVEIS;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        // Edição de cadastro antigo sem trocar o modelo continua valendo.
        const modeloMantido = Boolean(editingId) && form.modelo === originalModelo;
        if (!form.foraDoCatalogo && !form.codigoFipe && !modeloMantido) {
            setFormError('Escolha marca, modelo e ano-modelo na lista da FIPE. Se o veículo não aparece, marque "Não encontrei na FIPE".');
            return;
        }
        setSaving(true);
        setFormError(null);
        try {
            const url = editingId ? `/api/dealership/repasse/${editingId}` : '/api/dealership/repasse';
            const res = await fetch(withScope(url), {
                method: editingId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form.foraDoCatalogo ? { ...form, codigoFipe: '', descricaoFipe: '' } : form),
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

    const remove = async (row: RepasseRow) => {
        if (!window.confirm(`Remover ${row.marca} ${row.modelo} do repasse?\n\nUse quando o carro for vendido ou sair do anúncio. Ele some da vitrine na hora.`)) return;
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

    const naVitrine = contagem['Disponível'] || 0;
    const set = <K extends keyof FormState>(key: K) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [key]: event.target.value as FormState[K] }));

    return (
        <div className={base.container}>
            <div className={base.toolbar}>
                <div>
                    <h2 className={base.title}>Repasse</h2>
                    <p className={base.subtitle}>
                        Usados recebidos na troca. Ficam visíveis para os lojistas enquanto o plano estiver em dia. Vendeu, remova o anúncio. Fotos e placa o lojista pede pelo WhatsApp.
                    </p>
                </div>
                <div className={base.summary}>
                    <span>{naVitrine} na vitrine</span>
                </div>
            </div>

            <PlanoRepasseCard key={concessionariaId || 'loja'} concessionariaId={concessionariaId} onChange={setPlanoAtivo} />

            <div className={base.bulkActionsRow}>
                <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={openNew}
                    disabled={planoAtivo !== true}
                    title={planoAtivo === false ? 'Contrate um plano de repasse para anunciar' : undefined}
                >
                    <FaPlus /> Adicionar carro
                </button>
            </div>

            {formOpen && (
                <AdminModal
                    size="lg"
                    title={editingId ? 'Editar carro' : 'Adicionar carro'}
                    subtitle="Escolha marca, modelo e ano na lista da FIPE. Depois informe quilometragem, preço e detalhes."
                    onClose={closeForm}
                    busy={saving}
                    onSubmit={submit}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={closeForm} disabled={saving}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={saving}>
                            {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar carro'}
                        </button>
                    </>}
                >
                    <div className={styles.formGrid}>
                        <label>
                            Tipo
                            <select value={form.tipoVeiculo} onChange={event => {
                                fipe.clearBrand();
                                setFipeRef(null);
                                setForm(prev => ({ ...prev, tipoVeiculo: event.target.value as FormState['tipoVeiculo'], marca: '', modelo: '', codigoFipe: '', descricaoFipe: '' }));
                            }}>
                                <option value="carro">Carro</option>
                                <option value="moto">Moto</option>
                            </select>
                        </label>
                        <AutocompleteField
                            label="Marca *"
                            value={form.marca}
                            options={form.foraDoCatalogo ? [] : fipe.brands}
                            loading={!form.foraDoCatalogo && fipe.loading === 'brands'}
                            onOpen={() => { if (!form.foraDoCatalogo) void fipe.loadBrands(); }}
                            placeholder={form.foraDoCatalogo ? 'Ex.: CHEVROLET' : 'Digite para buscar na FIPE'}
                            onText={text => {
                                fipe.clearBrand();
                                if (!form.foraDoCatalogo && !fipe.brands.length) void fipe.loadBrands();
                                setFipeRef(null);
                                setForm(prev => ({ ...prev, marca: text, ...(prev.foraDoCatalogo ? {} : { modelo: '', codigoFipe: '', descricaoFipe: '' }) }));
                            }}
                            onPick={option => {
                                void fipe.pickBrand(option.code);
                                setFipeRef(null);
                                setForm(prev => ({ ...prev, marca: matchLocalBrand(option.name, brandList, prev.tipoVeiculo), modelo: '', codigoFipe: '', descricaoFipe: '' }));
                            }}
                        />
                        <AutocompleteField
                            className={styles.wideHalf}
                            label="Modelo / versão *"
                            value={form.modelo}
                            options={form.foraDoCatalogo ? [] : fipe.models}
                            loading={!form.foraDoCatalogo && fipe.loading === 'models'}
                            emptyText={form.foraDoCatalogo || fipe.brandCode ? undefined : 'Escolha a marca na lista para ver os modelos.'}
                            placeholder={form.foraDoCatalogo ? 'Digite o modelo' : 'Digite para filtrar os modelos da FIPE'}
                            onText={text => {
                                if (!form.foraDoCatalogo) { fipe.clearModel(); setFipeRef(null); }
                                setForm(prev => ({ ...prev, modelo: text, ...(prev.foraDoCatalogo ? {} : { codigoFipe: '', descricaoFipe: '' }) }));
                            }}
                            onPick={option => {
                                void fipe.pickModel(option.code);
                                setFipeRef(null);
                                setForm(prev => ({ ...prev, modelo: option.name, codigoFipe: '', descricaoFipe: '' }));
                            }}
                        />
                        {!form.foraDoCatalogo && fipe.years.length > 0 && (
                            <label>
                                <span className={styles.required}>Ano-modelo / combustível FIPE</span>
                                <select value={fipe.year} onChange={async event => { const detail = await fipe.pickYear(event.target.value); if (detail) applyFipeDetail(detail); }}>
                                    <option value="">Selecione…</option>
                                    {fipe.years.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
                                </select>
                            </label>
                        )}
                        <label className={`${styles.wide} ${styles.checkRow}`}>
                            <input
                                type="checkbox"
                                checked={form.foraDoCatalogo}
                                onChange={event => {
                                    const manual = event.target.checked;
                                    fipe.clearBrand();
                                    setFipeRef(null);
                                    setForm(prev => ({ ...prev, foraDoCatalogo: manual, codigoFipe: '', descricaoFipe: '' }));
                                }}
                            />
                            Não encontrei na FIPE: digitar marca e modelo manualmente
                        </label>
                        {!form.foraDoCatalogo && (fipe.error || ['years', 'detail', 'code'].includes(fipe.loading) || form.codigoFipe) && (
                            <p className={`${styles.wide} ${styles.fipeStatus}`} role={fipe.error ? 'alert' : 'status'}>
                                {fipe.error || (fipe.loading && fipe.loading !== 'brands' && fipe.loading !== 'models' ? 'Consultando FIPE…' : `FIPE ${form.codigoFipe}${form.descricaoFipe ? ` · ${form.descricaoFipe}` : ''}`)}
                            </p>
                        )}
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
                            {fipeRef && <span className={styles.hint}>FIPE: {fipeRef.price}{fipeRef.month ? ` (${fipeRef.month.trim()})` : ''}</span>}
                        </label>
                        <label>
                            Cor
                            <input value={form.cor} onChange={set('cor')} placeholder="Ex.: PRATA" />
                        </label>
                        <label>
                            Combustível
                            <select value={form.combustivel} onChange={set('combustivel')}>
                                <option value="">-</option>
                                {combustiveis.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </label>
                        <label>
                            Câmbio
                            <select value={form.transmissao} onChange={set('transmissao')}>
                                <option value="">-</option>
                                {REPASSE_TRANSMISSOES.map(t => <option key={t} value={t}>{t}</option>)}
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
                </AdminModal>
            )}

            <div className={base.filters}>
                <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Buscar marca, modelo, cor..."
                    className={base.search}
                />
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
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 ? (
                            <tr><td colSpan={11} className={base.empty}>Carregando...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={11} className={base.empty}>
                                    {search ? 'Nenhum repasse encontrado com essa busca.' : 'Nenhum carro cadastrado. Clique em "Adicionar carro" para começar.'}
                                </td>
                            </tr>
                        ) : rows.map(row => (
                            <tr key={row.id}>
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
                                    <div className={styles.rowActions}>
                                        <button type="button" className={styles.iconBtn} title="Editar" onClick={() => openEdit(row)} disabled={rowSaving[row.id]}>✏️</button>
                                        <button type="button" className={styles.iconBtn} title="Remover do repasse (vendido ou fora de anúncio)" onClick={() => remove(row)} disabled={rowSaving[row.id]}>🗑️</button>
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
