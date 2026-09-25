'use client';
import { AutocompleteField, matchLocalBrand, useFipeCascade } from '@/components/catalog/FipeLookup';
import fipeStyles from '@/components/catalog/FipeLookup.module.css';
import type { FipeDetail } from '@/lib/services/fipeService';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './CatalogVariationsManagement.module.css';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { BookOpen, CarFront, Image as ImageIcon, ImagePlus, Link2, Pencil, Plus, Search, Tags, Trash2, Upload } from 'lucide-react';
import {
    Button, EmptyState, FilterSelect, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, SkeletonRows, StatCard, StatGrid, pageStyles,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

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
    const [aviso, setAviso] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const { confirm, notify, feedback } = useFeedback();

    const [selectedVariations, setSelectedVariations] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [fotoModal, setFotoModal] = useState<{ variation: VehicleVariation; url: string } | null>(null);

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


    // Marcas uma vez; variações a cada filtro, com espera para não consultar a cada tecla.
    useEffect(() => {
        loadMarcas().catch((error: any) => setAviso({ type: 'error', message: error?.message || 'Erro ao carregar marcas' }));
    }, [loadMarcas]);

    useEffect(() => {
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                await loadVariations();
            } catch (error: any) {
                setAviso({ type: 'error', message: error?.message || 'Erro ao carregar catálogo' });
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [loadVariations]);

    // Avisos da lista (fora dos modais) viram aviso na tela.
    useEffect(() => {
        if (!aviso || formOpen || importOpen || importPreview || fotoModal) return;
        notify(aviso.message, aviso.type === 'success' ? 'positive' : 'negative');
        setAviso(null);
    }, [aviso, formOpen, importOpen, importPreview, fotoModal, notify]);

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setAviso(null);
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
        setAviso(null);
        setImportOpen(true);
    };

    const closeImport = () => {
        if (importLoading) return;
        setAviso(null);
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
    const [savingFoto, setSavingFoto] = useState(false);

    const handleSaveFoto = async () => {
        if (!fotoModal) return;
        const url = fotoModal.url.trim();
        if (url && !/^https?:\/\//i.test(url)) {
            setAviso({ type: 'error', message: 'O link da foto precisa começar com http:// ou https://' });
            return;
        }

        setSavingFoto(true);
        setAviso(null);
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
            setAviso({ type: 'success', message: url ? 'Foto vinculada à variação.' : 'Foto removida da variação.' });
        } catch (err: any) {
            setAviso({ type: 'error', message: err.message });
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
        setAviso(null);
        setFipeReset(value => value + 1);
        setFormOpen(true);
    };

    const handleDeleteOne = async (id: string) => {
        const alvo = variations.find(v => v.id === id);
        const ok = await confirm({ title: 'Excluir variação', description: <>A variação <strong>{alvo ? `${alvo.marca} ${alvo.modelo}` : ''}</strong> sai do catálogo. Veículos já cadastrados não são apagados.</>, confirmLabel: 'Excluir variação', danger: true });
        if (!ok) return;
        setDeletingId(id);
        setAviso(null);
        try {
            const res = await fetch(`/api/catalog/variations/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erro ao excluir variação');
            }
            setAviso({ type: 'success', message: 'Variação excluída com sucesso.' });
            setSelectedVariations(prev => prev.filter(v => v !== id));
            await loadVariations();
        } catch (error: any) {
            setAviso({ type: 'error', message: error?.message || 'Erro ao excluir variação' });
        } finally {
            setDeletingId(null);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedVariations.length === 0) return;
        const n = selectedVariations.length;
        const ok = await confirm({ title: `Excluir ${n} ${n === 1 ? 'variação' : 'variações'}`, description: 'As variações selecionadas saem do catálogo. Veículos já cadastrados não são apagados.', confirmLabel: `Excluir ${n}`, danger: true });
        if (!ok) return;
        
        setBulkDeleting(true);
        setAviso(null);
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
            setAviso({ type: 'success', message: `${selectedVariations.length} variações excluídas com sucesso.` });
            setSelectedVariations([]);
            await loadVariations();
        } catch (error: any) {
            setAviso({ type: 'error', message: error?.message || 'Erro ao excluir variações em massa' });
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
        setAviso(null);

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

            setAviso({ type: 'success', message: `Variação ${editingId ? 'atualizada' : 'criada'} com sucesso.` });
            setForm(EMPTY_FORM);
            setEditingId(null);
            setFipeReset(value => value + 1);
            setFormOpen(false);
            await Promise.all([loadMarcas(), loadVariations()]);
        } catch (error: any) {
            setAviso({ type: 'error', message: error?.message || `Erro ao ${editingId ? 'atualizar' : 'salvar'} variação` });
        } finally {
            setSaving(false);
        }
    };

    const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setAviso(null);
        setImportPreview(null);
        setImportCsvFileName(file.name);
        setImportCsvText(await file.text());
    };

    const previewImport = async () => {
        setImportLoading(true);
        setAviso(null);

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
            setAviso({ type: 'error', message: error?.message || 'Erro ao pré-visualizar importação' });
        } finally {
            setImportLoading(false);
        }
    };

    const confirmImport = async () => {
        if (!importPreview) return;

        const items = importPreview.rows.filter(row => row.status === 'new');
        if (items.length === 0) {
            setAviso({ type: 'error', message: 'Não há linhas novas para importar.' });
            return;
        }

        setImportCommitting(true);
        setAviso(null);

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

            setAviso({
                type: 'success',
                message: `${data.summary?.imported || 0} variações importadas. ${data.summary?.skipped || 0} linhas ignoradas.`,
            });
            setImportPreview(null);
            await Promise.all([loadMarcas(), loadVariations()]);
        } catch (error: any) {
            setAviso({ type: 'error', message: error?.message || 'Erro ao importar catálogo' });
        } finally {
            setImportCommitting(false);
        }
    };

    const todasSelecionadas = variations.length > 0 && selectedVariations.length === variations.length;
    const comFoto = variations.filter(v => v.imagemUrl).length;
    const comFipe = variations.filter(v => v.codigoFipe).length;
    const pct = (n: number) => (variations.length ? (n / variations.length) * 100 : 0);
    const carregando = loading && variations.length === 0;

    return (
        <Page wide>
            <PageHeader
                title="Catálogo"
                count={carregando ? null : variations.length}
                description="Variações por marca e modelo, com vínculo à Tabela FIPE, disponíveis para as concessionárias."
                actions={<>
                    <Button icon={<Upload size={16} aria-hidden="true" />} onClick={openImport}>Importar</Button>
                    <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openNewVariation}>Nova variação</Button>
                </>}
            />

            <StatGrid>
                <StatCard label="Variações" icon={<BookOpen size={18} />} value={carregando ? '-' : variations.length} caption={variations.length >= 500 ? 'Mostrando as 500 primeiras do filtro' : 'No filtro atual'} />
                <StatCard label="Marcas" icon={<Tags size={18} />} value={carregando ? '-' : new Set(variations.map(v => v.marca)).size} caption={`${marcas.length} no cadastro`} />
                <StatCard label="Vinculadas à FIPE" icon={<Link2 size={18} />} value={carregando ? '-' : comFipe} progress={pct(comFipe)} caption={`${Math.round(pct(comFipe))}% com código FIPE`} />
                <StatCard label="Com foto" icon={<ImageIcon size={18} />} value={carregando ? '-' : comFoto} progress={pct(comFoto)} caption="Aparecem com imagem na consulta" />
            </StatGrid>

            <Panel>
                <PanelToolbar>
                    <div className={pageStyles.toolbarGroup}>
                        <SearchField value={search} onChange={setSearch} placeholder="Marca, modelo ou cor" />
                        <FilterSelect
                            label="Filtrar por marca"
                            value={brandFilter}
                            onChange={setBrandFilter}
                            options={[{ value: '', label: 'Todas as marcas' }, ...marcas.map(m => ({ value: m.id, label: m.nome }))]}
                        />
                        <FilterSelect
                            label="Filtrar por tipo"
                            value={tipoFilter}
                            onChange={setTipoFilter}
                            options={[
                                { value: '', label: 'Todos os tipos' },
                                { value: 'carro', label: 'Carros' },
                                { value: 'moto', label: 'Motos' },
                                { value: 'caminhao', label: 'Caminhões' },
                                { value: 'utilitario', label: 'Utilitários' },
                            ]}
                        />
                    </div>
                    {selectedVariations.length > 0 && (
                        <Button variant="danger" icon={<Trash2 size={16} aria-hidden="true" />} onClick={handleDeleteSelected} disabled={bulkDeleting}>
                            {bulkDeleting ? 'Excluindo...' : `Excluir ${selectedVariations.length} ${selectedVariations.length === 1 ? 'selecionada' : 'selecionadas'}`}
                        </Button>
                    )}
                </PanelToolbar>

                <div className={pageStyles.tableWrap}>
                    <table className={`${pageStyles.table} ${pageStyles.tableDense}`}>
                        <thead>
                            <tr>
                                <th className={pageStyles.shrink}>
                                    <input type="checkbox" aria-label="Selecionar todas" checked={todasSelecionadas} onChange={handleSelectAll} />
                                </th>
                                <th>Modelo</th>
                                <th>Tipo</th>
                                <th>Ano</th>
                                <th>Combustível</th>
                                <th>Cor</th>
                                <th>Câmbio</th>
                                <th>Opcionais</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={6} columns={9} />}
                            {!carregando && variations.map(variation => (
                                <tr key={variation.id} data-selected={selectedVariations.includes(variation.id)}>
                                    <td>
                                        <input type="checkbox" aria-label={`Selecionar ${variation.modelo}`} checked={selectedVariations.includes(variation.id)} onChange={() => handleSelectOne(variation.id)} />
                                    </td>
                                    <td className={pageStyles.colMain}>
                                        <PrimaryCell
                                            leading={variation.imagemUrl
                                                ? <img src={variation.imagemUrl} alt="" className={pageStyles.thumb} />
                                                : <span className={pageStyles.thumbEmpty} aria-hidden="true"><CarFront size={16} /></span>}
                                            title={variation.modelo}
                                            subtitle={<>{variation.marca}{variation.codigoFipe ? ` · FIPE ${variation.codigoFipe}` : ''}</>}
                                        />
                                    </td>
                                    <td>
                                        <span className={pageStyles.nowrap}>
                                            {TIPO_LABELS[variation.tipoVeiculo] || variation.tipoVeiculo}
                                            {variation.tipoVeiculo === 'moto' && variation.cilindrada ? ` · ${variation.cilindrada}cc` : ''}
                                        </span>
                                    </td>
                                    <td><span className={pageStyles.nowrap}>{getAnoLabel(variation)}</span></td>
                                    <td>{variation.combustivel || <span className={pageStyles.muted}>-</span>}</td>
                                    <td>{variation.cor || <span className={pageStyles.muted}>-</span>}</td>
                                    <td>{variation.transmissao || <span className={pageStyles.muted}>-</span>}</td>
                                    <td>{variation.opcionais ? <span className={pageStyles.clamp2} title={variation.opcionais}>{variation.opcionais}</span> : <span className={pageStyles.muted}>-</span>}</td>
                                    <td>
                                        <RowActions>
                                            <IconAction label={variation.imagemUrl ? 'Trocar foto' : 'Adicionar foto'} onClick={() => setFotoModal({ variation, url: variation.imagemUrl || '' })}>
                                                <ImagePlus size={17} aria-hidden="true" />
                                            </IconAction>
                                            <IconAction label="Editar variação" onClick={() => handleEdit(variation)}>
                                                <Pencil size={17} aria-hidden="true" />
                                            </IconAction>
                                            <IconAction label="Excluir variação" tone="danger" onClick={() => handleDeleteOne(variation.id)}>
                                                <Trash2 size={17} aria-hidden="true" />
                                            </IconAction>
                                        </RowActions>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!carregando && variations.length === 0 && (
                    search || brandFilter || tipoFilter
                        ? <EmptyState icon={<Search size={20} />} title="Nenhuma variação encontrada" description="Ajuste a busca ou os filtros de marca e tipo." />
                        : <EmptyState icon={<BookOpen size={20} />} title="Catálogo vazio" description="Cadastre a primeira variação pela busca na FIPE ou importe uma planilha." action={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openNewVariation}>Nova variação</Button>} />
                )}

                {!carregando && variations.length > 0 && (
                    <PanelFooter aside={selectedVariations.length > 0 ? `${selectedVariations.length} ${selectedVariations.length === 1 ? 'selecionada' : 'selecionadas'}` : 'Até 500 por consulta'}>
                        Mostrando <strong>{variations.length}</strong> {variations.length === 1 ? 'variação' : 'variações'}
                    </PanelFooter>
                )}
            </Panel>

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
                        {aviso?.type === 'error' && (
                            <InlineNotice>{aviso.message}</InlineNotice>
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
                        {aviso?.type === 'error' && (
                            <InlineNotice>{aviso.message}</InlineNotice>
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
                    {aviso?.type === 'error' && (
                        <InlineNotice>{aviso.message}</InlineNotice>
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
                        <InlineNotice tone="warning">A prévia mostra só as primeiras 2.500 linhas.</InlineNotice>
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
                                        <td className={styles.previewFipeCell}>{row.codigoFipe || 'Sem vínculo'}{[...row.errors, ...row.warnings].map((message, i) => <p key={i}>{message}</p>)}</td>
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
            {feedback}
        </Page>
    );
}
