'use client';
import { AutocompleteField, matchLocalBrand, useFipeCascade } from '@/components/catalog/FipeLookup';
import fipeStyles from '@/components/catalog/FipeLookup.module.css';
import type { FipeDetail } from '@/lib/services/fipeService';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './CatalogVariationsManagement.module.css';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';

interface Marca {
    id: string;
    nome: string;
    tipoVeiculo?: 'carro' | 'moto' | 'caminhao' | 'utilitario';
}

interface VehicleVariation {
    id: string;
    marcaId?: string;
    marca: string;
    modelo: string;
    codigoFipe?: string;
    descricaoFipe?: string;
    tipoVeiculo: 'carro' | 'moto' | 'caminhao' | 'utilitario';
    ano?: string;
    anoModelo?: number;
    anoFabricacao?: number;
    combustivel?: string;
    cor?: string;
    transmissao?: string;
    motor?: string;
    carroceria?: string;
    portas?: number;
    cilindrada?: number;
    opcionais?: string;
    opcionaisPadrao?: string[];
    preco?: number;
    status?: string;
    observacoes?: string;
    cidade?: string;
    estado?: string;
    frete?: number;
    telefone?: string;
    concessionaria?: string;
    nomeContato?: string;
    operador?: string;
    imagemUrl?: string;
    ativo: boolean;
}

const TIPO_LABELS: Record<string, string> = {
    carro: 'Carro',
    moto: 'Moto',
    caminhao: 'Caminhão',
    utilitario: 'Utilitário',
};

type VariationForm = {
    codigoFipe: string;
    descricaoFipe: string;
    marca: string;
    modelo: string;
    /** '' = herdar da marca (o servidor decide). */
    tipoVeiculo: string;
    cilindrada: string;
    ano: string;
    combustivel: string;
    cor: string;
    transmissao: string;
    opcionais: string;
};

type ImportStatus = 'new' | 'existing' | 'duplicate' | 'invalid';

type ImportPreviewItem = {
    rowNumber: number;
    marca?: string;
    marcaId?: string;
    modelo?: string;
    codigoFipe?: string;
    descricaoFipe?: string;
    tipoVeiculo?: string;
    ano?: string;
    anoModelo?: number;
    anoFabricacao?: number;
    combustivel?: string;
    cor?: string;
    transmissao?: string;
    motor?: string;
    carroceria?: string;
    portas?: number;
    opcionais?: string;
    opcionaisPadrao?: string[];
    preco?: number;
    statusVeiculo?: string;
    observacoes?: string;
    cidade?: string;
    estado?: string;
    frete?: number;
    telefone?: string;
    concessionaria?: string;
    nomeContato?: string;
    operador?: string;
    status: ImportStatus;
    errors: string[];
    warnings: string[];
};

type ImportPreview = {
    rows: ImportPreviewItem[];
    summary: {
        total: number;
        new: number;
        existing: number;
        duplicate: number;
        invalid: number;
        importable: number;
    };
    sourceUrl?: string;
    truncated?: boolean;
};

const EMPTY_FORM: VariationForm = {
    codigoFipe: '', descricaoFipe: '',
    marca: '',
    modelo: '',
    tipoVeiculo: '',
    cilindrada: '',
    ano: '',
    combustivel: '',
    cor: '',
    transmissao: '',
    opcionais: '',
};

function parseOptionals(value: string) {
    if (!value.trim()) return [];
    return value
        .split(/[|;]/)
        .map(option => option.trim())
        .filter(Boolean);
}

function getAnoLabel(variation: Pick<VehicleVariation, 'ano' | 'anoModelo' | 'anoFabricacao'>) {
    if (variation.ano) return variation.ano;
    if (variation.anoFabricacao && variation.anoModelo) {
        return `${String(variation.anoFabricacao).slice(-2)}/${String(variation.anoModelo).slice(-2)}`;
    }
    return variation.anoModelo ? String(variation.anoModelo) : '-';
}

export function CatalogVariationsManagement() {
    const [fipeReset, setFipeReset] = useState(0);
    const [consultarFipe, setConsultarFipe] = useState(false);
    const [marcas, setMarcas] = useState<Marca[]>([]);
    const [variations, setVariations] = useState<VehicleVariation[]>([]);
    const [form, setForm] = useState<VariationForm>(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const [brandFilter, setBrandFilter] = useState('');
    const [tipoFilter, setTipoFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importSourceType, setImportSourceType] = useState<'googleSheets' | 'csv'>('googleSheets');
    const [importSheetUrl, setImportSheetUrl] = useState('');
    const [importCsvText, setImportCsvText] = useState('');
    const [importCsvFileName, setImportCsvFileName] = useState('');
    const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importCommitting, setImportCommitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const [selectedVariations, setSelectedVariations] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    const loadMarcas = useCallback(async () => {
        const res = await fetch('/api/tables/marcas');
        if (!res.ok) throw new Error('Erro ao carregar marcas');
        const data = await res.json();
        setMarcas(Array.isArray(data) ? data : []);
    }, []);

    const loadVariations = useCallback(async () => {
        const params = new URLSearchParams({ limit: '500' });
        if (search.trim()) params.set('search', search.trim());
        if (brandFilter) params.set('marcaId', brandFilter);
        if (tipoFilter) params.set('tipo', tipoFilter);

        const res = await fetch(`/api/catalog/variations?${params.toString()}`);
        if (!res.ok) throw new Error('Erro ao carregar catálogo');
        const data = await res.json();
        setVariations(Array.isArray(data.data) ? data.data : []);
    }, [brandFilter, tipoFilter, search]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setFeedback(null);

        try {
            await Promise.all([loadMarcas(), loadVariations()]);
        } catch (error: any) {
            setFeedback({ type: 'error', message: error?.message || 'Erro ao carregar dados' });
        } finally {
            setLoading(false);
        }
    }, [loadMarcas, loadVariations]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setFeedback(null);
    };

    const openNewVariation = () => {
        resetForm();
        setFipeReset(value => value + 1);
        setFormOpen(true);
    };

    const closeForm = () => {
        if (saving) return;
        resetForm();
        setFipeReset(value => value + 1);
        setFormOpen(false);
    };

    const openImport = () => {
        setFeedback(null);
        setImportOpen(true);
    };

    const closeImport = () => {
        if (importLoading) return;
        setFeedback(null);
        setImportOpen(false);
    };

    /**
     * A foto é guardada como URL, não como arquivo.
     *
     * O campo imagemUrl já existia no modelo e nunca foi usado. Base64 no banco
     * está descartado de propósito: os 958 banners guardados assim já ocupam
     * 115 MB dos 143 MB do banco, e as 27 mil variações passariam de 3 GB —
     * fora que o catálogo faz $lookup sobre a coleção inteira a cada consulta.
     */
    const [fotoModal, setFotoModal] = useState<{ variation: VehicleVariation; url: string } | null>(null);
    const [savingFoto, setSavingFoto] = useState(false);

    const handleSaveFoto = async () => {
        if (!fotoModal) return;
        const url = fotoModal.url.trim();
        if (url && !/^https?:\/\//i.test(url)) {
            setFeedback({ type: 'error', message: 'O link da foto precisa começar com http:// ou https://' });
            return;
        }

        setSavingFoto(true);
        setFeedback(null);
        try {
            const res = await fetch(`/api/catalog/variations/${fotoModal.variation.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagemUrl: url }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Não foi possível salvar a foto');
            }
            setVariations(prev => prev.map(v => v.id === fotoModal.variation.id ? { ...v, imagemUrl: url || undefined } : v));
            setFotoModal(null);
            setFeedback({ type: 'success', message: url ? 'Foto vinculada à variação.' : 'Foto removida da variação.' });
        } catch (err: any) {
            setFeedback({ type: 'error', message: err.message });
        } finally {
            setSavingFoto(false);
        }
    };

    const handleEdit = (variation: VehicleVariation) => {
        setForm({
            codigoFipe: variation.codigoFipe || '', descricaoFipe: variation.descricaoFipe || '',
            marca: variation.marca,
            modelo: variation.modelo,
            tipoVeiculo: variation.tipoVeiculo || 'carro',
            cilindrada: variation.cilindrada ? String(variation.cilindrada) : '',
            ano: variation.ano || variation.anoModelo?.toString() || '',
            combustivel: variation.combustivel || '',
            cor: variation.cor || '',
            transmissao: variation.transmissao || '',
            opcionais: variation.opcionais || variation.opcionaisPadrao?.join(', ') || '',
        });
        setEditingId(variation.id);
        setFeedback(null);
        setFipeReset(value => value + 1);
        setFormOpen(true);
    };

    const handleDeleteOne = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta variação?')) return;
        setDeletingId(id);
        setFeedback(null);
        try {
            const res = await fetch(`/api/catalog/variations/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erro ao excluir variação');
            }
            setFeedback({ type: 'success', message: 'Variação excluída com sucesso.' });
            setSelectedVariations(prev => prev.filter(v => v !== id));
            await loadVariations();
        } catch (error: any) {
            setFeedback({ type: 'error', message: error?.message || 'Erro ao excluir variação' });
        } finally {
            setDeletingId(null);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedVariations.length === 0) return;
        if (!window.confirm(`Tem certeza que deseja excluir as ${selectedVariations.length} variações selecionadas?`)) return;
        
        setBulkDeleting(true);
        setFeedback(null);
        try {
            const res = await fetch('/api/catalog/variations', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedVariations }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erro ao excluir variações em massa');
            }
            setFeedback({ type: 'success', message: `${selectedVariations.length} variações excluídas com sucesso.` });
            setSelectedVariations([]);
            await loadVariations();
        } catch (error: any) {
            setFeedback({ type: 'error', message: error?.message || 'Erro ao excluir variações em massa' });
        } finally {
            setBulkDeleting(false);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedVariations(variations.map(v => v.id));
        } else {
            setSelectedVariations([]);
        }
    };

    const handleSelectOne = (id: string) => {
        setSelectedVariations(prev => 
            prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]
        );
    };

    // Tipo que vai valer: o escolhido no form, senão o da marca digitada, senão carro.
    const effectiveTipo = useMemo(() => {
        if (form.tipoVeiculo) return form.tipoVeiculo;
        const nome = form.marca.trim().toLowerCase();
        return marcas.find(m => m.nome.toLowerCase() === nome)?.tipoVeiculo || 'carro';
    }, [form.tipoVeiculo, form.marca, marcas]);

    const fipe = useFipeCascade(effectiveTipo);
    const { reset: resetFipe } = fipe;
    useEffect(() => { resetFipe(); }, [fipeReset, editingId, resetFipe]);

    /** Usa o nome da marca já cadastrada (FIAT, VW, HONDA MOTOS…) para não duplicar marcas com a grafia da FIPE. */
    const toLocalMarca = (fipeName: string) => matchLocalBrand(fipeName, marcas, fipe.type === 'motorcycles' ? 'moto' : fipe.type === 'trucks' ? 'caminhao' : 'carro');

    const applyFipeDetail = (detail: FipeDetail) => setForm(prev => ({
        ...prev,
        codigoFipe: detail.codeFipe, descricaoFipe: detail.model, combustivel: detail.fuel,
        ano: detail.modelYear === 32000 ? prev.ano : (prev.ano.includes('/') ? `${prev.ano.split('/')[0]}/${detail.modelYear}` : String(detail.modelYear)),
    }));

    const handleFipeCode = async (value: string) => {
        setForm(prev => ({ ...prev, codigoFipe: value, descricaoFipe: '' }));
        const digits = value.replace(/\D/g, '');
        if (digits.length !== 7) { if (fipe.years.length && !fipe.brandCode) fipe.clearModel(); return; }
        const code = `${digits.slice(0, 6)}-${digits.slice(6)}`;
        const detail = await fipe.lookupCode(code);
        if (!detail) return;
        setForm(prev => ({
            ...prev,
            codigoFipe: code,
            descricaoFipe: detail.model,
            marca: toLocalMarca(detail.brand),
            // Não sobrescreve um nome de exibição que o usuário já digitou.
            modelo: !prev.modelo.trim() || prev.modelo === prev.descricaoFipe ? detail.model : prev.modelo,
        }));
    };

    const saveVariation = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setFeedback(null);

        try {
            if (!form.marca.trim()) {
                throw new Error('Marca é obrigatória.');
            }
            if (!form.modelo.trim()) {
                throw new Error('Modelo é obrigatório.');
            }

            const payload = {
                codigoFipe: form.codigoFipe, descricaoFipe: form.descricaoFipe,
                marca: form.marca,
                modelo: form.modelo,
                // '' = não manda: no POST o servidor herda da marca; no PUT mantém o atual.
                ...(form.tipoVeiculo ? { tipoVeiculo: form.tipoVeiculo } : {}),
                ...(effectiveTipo === 'moto' ? { cilindrada: form.cilindrada || undefined } : {}),
                ano: form.ano,
                anoModelo: (() => { const part = form.ano.split(/[/-]/).pop()?.trim(); if (!part || !/^\d{2}(\d{2})?$/.test(part)) return null; return part.length === 2 ? 2000 + Number(part) : Number(part); })(),
                anoFabricacao: (() => { const parts = form.ano.split(/[/-]/); const part = parts[0]?.trim(); if (parts.length < 2 || !/^\d{2}(\d{2})?$/.test(part)) return null; return part.length === 2 ? 2000 + Number(part) : Number(part); })(),
                combustivel: form.combustivel,
                cor: form.cor,
                transmissao: form.transmissao,
                opcionais: form.opcionais,
                opcionaisPadrao: parseOptionals(form.opcionais),
                ativo: true,
            };

            const res = await fetch(editingId ? `/api/catalog/variations/${editingId}` : '/api/catalog/variations', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Erro ao ${editingId ? 'atualizar' : 'salvar'} variação`);

            setFeedback({ type: 'success', message: `Variação ${editingId ? 'atualizada' : 'criada'} com sucesso.` });
            setForm(EMPTY_FORM);
            setEditingId(null);
            setFipeReset(value => value + 1);
            setFormOpen(false);
            await Promise.all([loadMarcas(), loadVariations()]);
        } catch (error: any) {
            setFeedback({ type: 'error', message: error?.message || `Erro ao ${editingId ? 'atualizar' : 'salvar'} variação` });
        } finally {
            setSaving(false);
        }
    };

    const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFeedback(null);
        setImportPreview(null);
        setImportCsvFileName(file.name);
        setImportCsvText(await file.text());
    };

    const previewImport = async () => {
        setImportLoading(true);
        setFeedback(null);

        try {
            const payload = {
                action: 'preview',
                consultarFipe,
                sourceType: importSourceType,
                sheetUrl: importSourceType === 'googleSheets' ? importSheetUrl : undefined,
                csvText: importSourceType === 'csv' ? importCsvText : undefined,
            };

            const res = await fetch('/api/catalog/variations/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao pré-visualizar importação');

            setImportPreview(data);
            setImportOpen(false);
        } catch (error: any) {
            setFeedback({ type: 'error', message: error?.message || 'Erro ao pré-visualizar importação' });
        } finally {
            setImportLoading(false);
        }
    };

    const confirmImport = async () => {
        if (!importPreview) return;

        const items = importPreview.rows.filter(row => row.status === 'new');
        if (items.length === 0) {
            setFeedback({ type: 'error', message: 'Não há linhas novas para importar.' });
            return;
        }

        setImportCommitting(true);
        setFeedback(null);

        try {
            const res = await fetch('/api/catalog/variations/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'commit', items }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao importar catálogo');

            if (data.skipped && data.skipped.length > 0) {
                console.warn('LINHAS IGNORADAS DETALHES:', data.skipped);
            }

            setFeedback({
                type: 'success',
                message: `${data.summary?.imported || 0} variações importadas. ${data.summary?.skipped || 0} linhas ignoradas.`,
            });
            setImportPreview(null);
            await Promise.all([loadMarcas(), loadVariations()]);
        } catch (error: any) {
            setFeedback({ type: 'error', message: error?.message || 'Erro ao importar catálogo' });
        } finally {
            setImportCommitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>Catálogo</h2>
                    <p className={styles.subtitle}>Cadastre variações por marca para disponibilizar às concessionárias.</p>
                </div>
                <div className={styles.headerActions}>
                    <button type="button" className={styles.secondaryButton} onClick={loadAll} disabled={loading || saving}>
                        Atualizar
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={openImport}>
                        Importar
                    </button>
                    <button type="button" className={styles.primaryButton} onClick={openNewVariation}>
                        Nova variação
                    </button>
                </div>
            </div>

            {feedback && !formOpen && !importOpen && !importPreview && (
                <div className={`${styles.feedback} ${feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess}`}>
                    {feedback.message}
                </div>
            )}

            <div className={styles.listPanel}>
                <div className={styles.listHeader}>
                    <div>
                        <h3>Variações cadastradas</h3>
                        <p>{variations.length} variações carregadas</p>
                    </div>
                    <div className={styles.filters}>
                        {selectedVariations.length > 0 && (
                            <button 
                                type="button" 
                                className={`${styles.secondaryButton} ${styles.dangerButton}`} 
                                onClick={handleDeleteSelected}
                                disabled={bulkDeleting}
                            >
                                {bulkDeleting ? 'Excluindo...' : `Excluir ${selectedVariations.length} selecionados`}
                            </button>
                        )}
                        <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="Buscar marca, modelo ou cor..."
                        />
                        <select value={brandFilter} onChange={event => setBrandFilter(event.target.value)}>
                            <option value="">Todas as marcas</option>
                            {marcas.map(marca => (
                                <option key={marca.id} value={marca.id}>{marca.nome}</option>
                            ))}
                        </select>
                        <select value={tipoFilter} onChange={event => setTipoFilter(event.target.value)}>
                            <option value="">Todos os tipos</option>
                            <option value="carro">Carros</option>
                            <option value="moto">Motos</option>
                            <option value="caminhao">Caminhões</option>
                            <option value="utilitario">Utilitários</option>
                        </select>
                    </div>
                </div>

                <div className={styles.tableShell}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>
                                    <input 
                                        type="checkbox" 
                                        checked={variations.length > 0 && selectedVariations.length === variations.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th>Marca</th>
                                <th>Tipo</th>
                                <th>Modelo</th>
                                <th>Ano</th>
                                <th>Combustível</th>
                                <th>Cor</th>
                                <th>Câmbio</th>
                                <th>Opcionais</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={10} className={styles.empty}>Carregando...</td>
                                </tr>
                            ) : variations.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className={styles.empty}>Nenhuma variação encontrada.</td>
                                </tr>
                            ) : variations.map(variation => (
                                <tr key={variation.id} className={selectedVariations.includes(variation.id) ? styles.selectedRow : ''}>
                                    <td>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedVariations.includes(variation.id)}
                                            onChange={() => handleSelectOne(variation.id)}
                                        />
                                    </td>
                                    <td>{variation.marca}</td>
                                    <td>
                                        {TIPO_LABELS[variation.tipoVeiculo] || variation.tipoVeiculo}
                                        {variation.tipoVeiculo === 'moto' && variation.cilindrada ? ` · ${variation.cilindrada}cc` : ''}
                                    </td>
                                    <td><strong>{variation.modelo}</strong></td>
                                    <td>{getAnoLabel(variation)}</td>
                                    <td>{variation.combustivel || '-'}</td>
                                    <td>{variation.cor || '-'}</td>
                                    <td>{variation.transmissao || '-'}</td>
                                    <td>{variation.opcionais || '-'}</td>
                                    <td>
                                        <div className={styles.rowActions}>
                                            <button
                                                className={styles.iconButton}
                                                onClick={() => setFotoModal({ variation, url: variation.imagemUrl || '' })}
                                                title={variation.imagemUrl ? 'Trocar foto do veículo' : 'Adicionar foto do veículo'}
                                            >
                                                {variation.imagemUrl ? '🖼️' : '📷'}
                                            </button>
                                            <button 
                                                className={styles.iconButton} 
                                                onClick={() => handleEdit(variation)}
                                                title="Editar"
                                            >
                                                ✏️
                                            </button>
                                            <button 
                                                className={`${styles.iconButton} ${styles.dangerText}`} 
                                                onClick={() => handleDeleteOne(variation.id)}
                                                disabled={deletingId === variation.id}
                                                title="Excluir"
                                            >
                                                {deletingId === variation.id ? '...' : '🗑️'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {formOpen && (
                <AdminModal
                    size="lg"
                    title={editingId ? 'Editar variação' : 'Nova variação'}
                    subtitle="Digite a marca e o modelo para escolher na lista da FIPE, ou informe o código FIPE. Se não encontrar, continue digitando para cadastrar manualmente."
                    onClose={closeForm}
                    busy={saving}
                    onSubmit={saveVariation}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={closeForm} disabled={saving}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={saving}>
                            {saving ? 'Salvando...' : editingId ? 'Atualizar variação' : 'Criar variação'}
                        </button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        {feedback?.type === 'error' && (
                            <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
                                {feedback.message}
                            </div>
                        )}
                        <div className={styles.formGrid}>
                            <label>Código FIPE (opcional)<input value={form.codigoFipe} onChange={event => { void handleFipeCode(event.target.value); }} placeholder="000000-0" inputMode="numeric" /></label>
                            <AutocompleteField
                                label="Marca"
                                value={form.marca}
                                options={fipe.brands}
                                loading={fipe.loading === 'brands'}
                                onOpen={() => { void fipe.loadBrands(); }}
                                placeholder="Digite para buscar na FIPE. Ex.: Fiat"
                                onText={text => { fipe.clearBrand(); if (!fipe.brands.length) void fipe.loadBrands(); setForm(prev => ({ ...prev, marca: text, codigoFipe: '', descricaoFipe: '' })); }}
                                onPick={option => {
                                    void fipe.pickBrand(option.code);
                                    setForm(prev => ({ ...prev, marca: toLocalMarca(option.name), codigoFipe: '', descricaoFipe: '',
                                        // Troca de marca invalida modelo e combustível que vieram da FIPE.
                                        ...(prev.descricaoFipe || prev.codigoFipe ? { modelo: '', combustivel: '' } : {}) }));
                                }}
                            />

                            <AutocompleteField
                                label="Modelo"
                                value={form.modelo}
                                options={fipe.models}
                                loading={fipe.loading === 'models'}
                                emptyText={fipe.brandCode ? undefined : 'Escolha a marca na lista da FIPE para ver os modelos.'}
                                placeholder={fipe.brandCode ? 'Digite para filtrar os modelos da FIPE' : 'Ex.: Corolla XEI 2.0 Hybrid'}
                                onText={text => setForm(prev => ({ ...prev, modelo: text }))}
                                onPick={option => {
                                    void fipe.pickModel(option.code);
                                    setForm(prev => ({ ...prev, modelo: option.name, descricaoFipe: option.name, codigoFipe: '' }));
                                }}
                            />

                            {fipe.years.length > 0 && (
                                <label>
                                    Ano-modelo / combustível FIPE
                                    <select value={fipe.year} onChange={async event => { const detail = await fipe.pickYear(event.target.value); if (detail) applyFipeDetail(detail); }}>
                                        <option value="">Selecione…</option>
                                        {fipe.years.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
                                    </select>
                                </label>
                            )}

                            <label>
                                Tipo
                                <select
                                    value={form.tipoVeiculo}
                                    onChange={event => { fipe.clearBrand(); setForm(prev => ({ ...prev, tipoVeiculo: event.target.value, codigoFipe: '', descricaoFipe: '' })); }}
                                >
                                    <option value="">Automático pela marca ({TIPO_LABELS[effectiveTipo] || effectiveTipo})</option>
                                    <option value="carro">Carro</option>
                                    <option value="moto">Moto</option>
                                    <option value="caminhao">Caminhão</option>
                                    <option value="utilitario">Utilitário</option>
                                </select>
                            </label>

                            {effectiveTipo === 'moto' && (
                                <label>
                                    Cilindrada (cc)
                                    <input
                                        type="number"
                                        min={50}
                                        step={1}
                                        value={form.cilindrada}
                                        onChange={event => setForm(prev => ({ ...prev, cilindrada: event.target.value }))}
                                        placeholder="Ex.: 160"
                                    />
                                </label>
                            )}

                            <label>
                                Ano
                                <input
                                    value={form.ano}
                                    onChange={event => setForm(prev => ({ ...prev, ano: event.target.value }))}
                                    placeholder="26/26"
                                />
                            </label>

                            <label>
                                Combustível
                                <input
                                    value={form.combustivel}
                                    onChange={event => setForm(prev => ({ ...prev, combustivel: event.target.value }))}
                                    placeholder="Flex, Diesel, Elétrico..."
                                />
                            </label>

                            <label>
                                Cor
                                <input
                                    value={form.cor}
                                    onChange={event => setForm(prev => ({ ...prev, cor: event.target.value }))}
                                    placeholder="Ex.: Branco, Preto..."
                                />
                            </label>

                            <label>
                                Câmbio
                                <input
                                    value={form.transmissao}
                                    onChange={event => setForm(prev => ({ ...prev, transmissao: event.target.value }))}
                                    placeholder="Automática, Manual, CVT..."
                                />
                            </label>

                            <label className={styles.wideField}>
                                Opcionais
                                <input
                                    value={form.opcionais}
                                    onChange={event => setForm(prev => ({ ...prev, opcionais: event.target.value }))}
                                    placeholder="Itens de série, taxa zero..."
                                />
                            </label>

                            {form.descricaoFipe && <p className={fipeStyles.status}>Descrição FIPE: {form.descricaoFipe}{form.codigoFipe ? ` · código ${form.codigoFipe}` : ''}</p>}
                            {['code', 'years', 'detail'].includes(fipe.loading) && <p className={fipeStyles.status} role="status">Consultando FIPE…</p>}
                            {fipe.error && <p className={fipeStyles.status} role="alert">{fipe.error}</p>}
                        </div>
                    </div>
                </AdminModal>
            )}

            {importOpen && (
                <AdminModal
                    size="md"
                    title="Importar catálogo"
                    subtitle="Use as colunas: Marca, Modelo, Ano, Combustível, Cor, Câmbio e Opcionais."
                    onClose={closeImport}
                    busy={importLoading}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={closeImport} disabled={importLoading}>Cancelar</button>
                        <button type="button" className={modalStyles.primary} onClick={previewImport} disabled={importLoading}>
                            {importLoading ? 'Lendo e consultando...' : 'Pré-visualizar importação'}
                        </button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        {feedback?.type === 'error' && (
                            <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
                                {feedback.message}
                            </div>
                        )}
                        <div className={modalStyles.field}>
                            <span>Origem</span>
                            <div className={styles.segmentedControl}>
                                <button
                                    type="button"
                                    className={importSourceType === 'googleSheets' ? styles.segmentActive : ''}
                                    onClick={() => { setImportSourceType('googleSheets'); setImportPreview(null); }}
                                >
                                    Google Sheets
                                </button>
                                <button
                                    type="button"
                                    className={importSourceType === 'csv' ? styles.segmentActive : ''}
                                    onClick={() => { setImportSourceType('csv'); setImportPreview(null); }}
                                >
                                    CSV
                                </button>
                            </div>
                        </div>

                        {importSourceType === 'googleSheets' ? (
                            <label className={modalStyles.field}>
                                Link do Google Sheets
                                <input
                                    value={importSheetUrl}
                                    onChange={event => { setImportSheetUrl(event.target.value); setImportPreview(null); }}
                                    placeholder="https://docs.google.com/spreadsheets/d/..."
                                />
                            </label>
                        ) : (
                            <label className={modalStyles.field}>
                                Arquivo CSV
                                <input type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} />
                                {importCsvFileName && <span className={styles.fileName}>{importCsvFileName}</span>}
                            </label>
                        )}

                        <label className={styles.checkboxField}>
                            <input type="checkbox" checked={consultarFipe} onChange={event => { setConsultarFipe(event.target.checked); setImportPreview(null); }} />
                            <span>
                                Consultar FIPE na prévia do CSV / planilha (código, tipo e ano-modelo)
                                <span className={modalStyles.hint}>Preenche apenas campos vazios. Divergências aparecem na prévia. Sem código, mantém o cadastro manual. Até 40 consultas por prévia; linhas restantes podem ser vinculadas depois.</span>
                            </span>
                        </label>
                    </div>
                </AdminModal>
            )}

            {importPreview && (
                <AdminModal
                    title="Prévia da importação"
                    subtitle="Confira as linhas novas antes de gravar no catálogo."
                    onClose={() => setImportPreview(null)}
                    size="xl"
                    busy={importCommitting}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setImportPreview(null)} disabled={importCommitting}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className={modalStyles.primary}
                            onClick={confirmImport}
                            disabled={importCommitting || importPreview.summary.importable === 0}
                        >
                            {importCommitting ? 'Importando...' : `Confirmar ${importPreview.summary.importable} novas`}
                        </button>
                    </>}
                >
                    {feedback?.type === 'error' && (
                        <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
                            {feedback.message}
                        </div>
                    )}
                    <div className={styles.summaryGrid}>
                        <div>
                            <strong>{importPreview.summary.total}</strong>
                            <span>Total</span>
                        </div>
                        <div>
                            <strong>{importPreview.summary.new}</strong>
                            <span>Novas</span>
                        </div>
                        <div>
                            <strong>{importPreview.summary.existing}</strong>
                            <span>Existentes</span>
                        </div>
                        <div>
                            <strong>{importPreview.summary.duplicate}</strong>
                            <span>Duplicadas</span>
                        </div>
                        <div>
                            <strong>{importPreview.summary.invalid}</strong>
                            <span>Com erro</span>
                        </div>
                    </div>

                    {importPreview.truncated && (
                        <div className={`${styles.feedback} ${styles.feedbackError}`}>
                            A prévia foi limitada às primeiras 2500 linhas.
                        </div>
                    )}

                    <div className={styles.modalTableShell}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>Linha / Situação</th>
                                    <th>Marca</th>
                                    <th>Modelo</th>
                                    <th>FIPE / Revisão</th>
                                    <th>Ano</th>
                                    <th>Combustível</th>
                                    <th>Cor</th>
                                    <th>Câmbio</th>
                                    <th>Opcionais</th>
                                </tr>
                            </thead>
                            <tbody>
                                {importPreview.rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className={styles.empty}>Nenhuma linha para importar.</td>
                                    </tr>
                                ) : importPreview.rows.map((row, index) => (
                                    <tr key={`${row.rowNumber}-${index}`}>
                                        <td>{row.rowNumber} · {{ new: 'Nova', existing: 'Existente', duplicate: 'Duplicada', invalid: 'Com erro' }[row.status]}</td>
                                        <td>{row.marca || '-'}</td>
                                        <td><strong>{row.modelo || '-'}</strong></td>
                                        <td style={{ minWidth: 230, whiteSpace: 'normal' }}>{row.codigoFipe || 'Sem vínculo'}{[...row.errors, ...row.warnings].map((message, i) => <p key={i}>{message}</p>)}</td>
                                        <td>{row.ano || row.anoModelo || '-'}</td>
                                        <td>{row.combustivel || '-'}</td>
                                        <td>{row.cor || '-'}</td>
                                        <td>{row.transmissao || '-'}</td>
                                        <td>{row.opcionais || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </AdminModal>
            )}
            {fotoModal && (
                <AdminModal
                    title="Foto do veículo"
                    subtitle={<>
                        {fotoModal.variation.marca} {fotoModal.variation.modelo}
                        {fotoModal.variation.cor ? ` · ${fotoModal.variation.cor}` : ''}
                    </>}
                    onClose={() => setFotoModal(null)}
                    size="sm"
                    busy={savingFoto}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setFotoModal(null)} disabled={savingFoto}>
                            Cancelar
                        </button>
                        <button type="button" className={modalStyles.primary} onClick={handleSaveFoto} disabled={savingFoto}>
                            {savingFoto ? 'Salvando...' : 'Salvar foto'}
                        </button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <label className={modalStyles.field}>
                            Link da foto
                            <input
                                type="url"
                                autoFocus
                                value={fotoModal.url}
                                onChange={e => setFotoModal({ ...fotoModal, url: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveFoto(); }}
                                placeholder="https://..."
                            />
                            <span className={modalStyles.hint}>
                                Cole o endereço de uma imagem já hospedada. Deixe em branco para remover a foto.
                            </span>
                        </label>

                        {fotoModal.url.trim() && (
                            <div className={styles.fotoPreview}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={fotoModal.url.trim()}
                                    alt={`Pré-visualização de ${fotoModal.variation.modelo}`}
                                    onError={e => { (e.currentTarget as HTMLImageElement).dataset.erro = '1'; }}
                                    onLoad={e => { delete (e.currentTarget as HTMLImageElement).dataset.erro; }}
                                />
                            </div>
                        )}
                    </div>
                </AdminModal>
            )}
        </div>
    );
}
