'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './CatalogVariationsManagement.module.css';

interface Marca {
    id: string;
    nome: string;
}

interface VehicleVariation {
    id: string;
    marcaId?: string;
    marca: string;
    modelo: string;
    versao?: string;
    codigoFipe?: string;
    tipoVeiculo: 'carro' | 'moto' | 'caminhao' | 'utilitario';
    anoModelo?: number;
    anoFabricacao?: number;
    combustivel?: string;
    transmissao?: string;
    motor?: string;
    carroceria?: string;
    portas?: number;
    ativo: boolean;
}

type VariationForm = {
    id?: string;
    marcaId: string;
    marca: string;
    modelo: string;
    versao: string;
    codigoFipe: string;
    tipoVeiculo: 'carro' | 'moto' | 'caminhao' | 'utilitario';
    anoModelo: string;
    anoFabricacao: string;
    combustivel: string;
    transmissao: string;
    motor: string;
    carroceria: string;
    portas: string;
};

const EMPTY_FORM: VariationForm = {
    marcaId: '',
    marca: '',
    modelo: '',
    versao: '',
    codigoFipe: '',
    tipoVeiculo: 'carro',
    anoModelo: '',
    anoFabricacao: '',
    combustivel: '',
    transmissao: '',
    motor: '',
    carroceria: '',
    portas: '',
};

const tipoVeiculoOptions = [
    { value: 'carro', label: 'Carro' },
    { value: 'moto', label: 'Moto' },
    { value: 'caminhao', label: 'Caminhão' },
    { value: 'utilitario', label: 'Utilitário' },
] as const;

function toNumberOrUndefined(value: string) {
    const normalized = value.trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function variationToForm(variation: VehicleVariation): VariationForm {
    return {
        id: variation.id,
        marcaId: variation.marcaId || '',
        marca: variation.marca || '',
        modelo: variation.modelo || '',
        versao: variation.versao || '',
        codigoFipe: variation.codigoFipe || '',
        tipoVeiculo: variation.tipoVeiculo || 'carro',
        anoModelo: variation.anoModelo ? String(variation.anoModelo) : '',
        anoFabricacao: variation.anoFabricacao ? String(variation.anoFabricacao) : '',
        combustivel: variation.combustivel || '',
        transmissao: variation.transmissao || '',
        motor: variation.motor || '',
        carroceria: variation.carroceria || '',
        portas: variation.portas ? String(variation.portas) : '',
    };
}

export function CatalogVariationsManagement() {
    const [marcas, setMarcas] = useState<Marca[]>([]);
    const [variations, setVariations] = useState<VehicleVariation[]>([]);
    const [form, setForm] = useState<VariationForm>(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const [brandFilter, setBrandFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const selectedBrand = useMemo(() => {
        return marcas.find(marca => marca.id === form.marcaId);
    }, [form.marcaId, marcas]);

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

        const res = await fetch(`/api/catalog/variations?${params.toString()}`);
        if (!res.ok) throw new Error('Erro ao carregar catálogo');
        const data = await res.json();
        setVariations(Array.isArray(data.data) ? data.data : []);
    }, [brandFilter, search]);

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

    useEffect(() => {
        if (selectedBrand && form.marca !== selectedBrand.nome) {
            setForm(prev => ({ ...prev, marca: selectedBrand.nome }));
        }
    }, [form.marca, selectedBrand]);

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setFeedback(null);
    };

    const saveVariation = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setFeedback(null);

        try {
            if (!form.marcaId && !form.marca.trim()) {
                throw new Error('Selecione ou informe uma marca.');
            }
            if (!form.modelo.trim()) {
                throw new Error('Modelo é obrigatório.');
            }

            const payload = {
                marcaId: form.marcaId || undefined,
                marca: form.marca,
                modelo: form.modelo,
                versao: form.versao,
                codigoFipe: form.codigoFipe,
                tipoVeiculo: form.tipoVeiculo,
                anoModelo: toNumberOrUndefined(form.anoModelo),
                anoFabricacao: toNumberOrUndefined(form.anoFabricacao),
                combustivel: form.combustivel,
                transmissao: form.transmissao,
                motor: form.motor,
                carroceria: form.carroceria,
                portas: toNumberOrUndefined(form.portas),
                ativo: true,
            };

            const url = form.id ? `/api/catalog/variations/${form.id}` : '/api/catalog/variations';
            const method = form.id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar variação');

            setFeedback({ type: 'success', message: form.id ? 'Variação atualizada.' : 'Variação criada.' });
            setForm(EMPTY_FORM);
            await Promise.all([loadMarcas(), loadVariations()]);
        } catch (error: any) {
            setFeedback({ type: 'error', message: error?.message || 'Erro ao salvar variação' });
        } finally {
            setSaving(false);
        }
    };

    const deactivateVariation = async (variation: VehicleVariation) => {
        const confirmed = window.confirm(`Desativar ${variation.modelo} ${variation.versao || ''}?`);
        if (!confirmed) return;

        setSaving(true);
        setFeedback(null);

        try {
            const res = await fetch(`/api/catalog/variations/${variation.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao desativar variação');

            setFeedback({ type: 'success', message: 'Variação desativada.' });
            await loadVariations();
        } catch (error: any) {
            setFeedback({ type: 'error', message: error?.message || 'Erro ao desativar variação' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>Catálogo</h2>
                    <p className={styles.subtitle}>Cadastre variações por marca para disponibilizar às concessionárias.</p>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={loadAll} disabled={loading || saving}>
                    Atualizar
                </button>
            </div>

            {feedback && (
                <div className={`${styles.feedback} ${feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess}`}>
                    {feedback.message}
                </div>
            )}

            <div className={styles.layout}>
                <form className={styles.panel} onSubmit={saveVariation}>
                    <div className={styles.panelHeader}>
                        <h3>{form.id ? 'Editar variação' : 'Nova variação'}</h3>
                        {form.id && (
                            <button type="button" className={styles.linkButton} onClick={resetForm}>
                                Cancelar edição
                            </button>
                        )}
                    </div>

                    <div className={styles.formGrid}>
                        <label>
                            Marca cadastrada
                            <select
                                value={form.marcaId}
                                onChange={event => setForm(prev => ({ ...prev, marcaId: event.target.value }))}
                            >
                                <option value="">Selecionar marca</option>
                                {marcas.map(marca => (
                                    <option key={marca.id} value={marca.id}>{marca.nome}</option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Ou nova marca
                            <input
                                value={form.marca}
                                onChange={event => setForm(prev => ({ ...prev, marca: event.target.value, marcaId: '' }))}
                                placeholder="Ex.: Toyota"
                            />
                        </label>

                        <label>
                            Modelo
                            <input
                                value={form.modelo}
                                onChange={event => setForm(prev => ({ ...prev, modelo: event.target.value }))}
                                placeholder="Ex.: Corolla"
                            />
                        </label>

                        <label>
                            Versão
                            <input
                                value={form.versao}
                                onChange={event => setForm(prev => ({ ...prev, versao: event.target.value }))}
                                placeholder="Ex.: XEI 2.0 Hybrid"
                            />
                        </label>

                        <label>
                            Código FIPE
                            <input
                                value={form.codigoFipe}
                                onChange={event => setForm(prev => ({ ...prev, codigoFipe: event.target.value }))}
                                placeholder="Opcional"
                            />
                        </label>

                        <label>
                            Tipo
                            <select
                                value={form.tipoVeiculo}
                                onChange={event => setForm(prev => ({ ...prev, tipoVeiculo: event.target.value as VariationForm['tipoVeiculo'] }))}
                            >
                                {tipoVeiculoOptions.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Ano modelo
                            <input
                                value={form.anoModelo}
                                onChange={event => setForm(prev => ({ ...prev, anoModelo: event.target.value }))}
                                inputMode="numeric"
                                placeholder="2026"
                            />
                        </label>

                        <label>
                            Ano fabricação
                            <input
                                value={form.anoFabricacao}
                                onChange={event => setForm(prev => ({ ...prev, anoFabricacao: event.target.value }))}
                                inputMode="numeric"
                                placeholder="2025"
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
                            Transmissão
                            <input
                                value={form.transmissao}
                                onChange={event => setForm(prev => ({ ...prev, transmissao: event.target.value }))}
                                placeholder="Automática, Manual, CVT..."
                            />
                        </label>

                        <label>
                            Motor
                            <input
                                value={form.motor}
                                onChange={event => setForm(prev => ({ ...prev, motor: event.target.value }))}
                                placeholder="Ex.: 1.0 Turbo"
                            />
                        </label>

                        <label>
                            Carroceria
                            <input
                                value={form.carroceria}
                                onChange={event => setForm(prev => ({ ...prev, carroceria: event.target.value }))}
                                placeholder="SUV, hatch, sedan..."
                            />
                        </label>

                        <label>
                            Portas
                            <input
                                value={form.portas}
                                onChange={event => setForm(prev => ({ ...prev, portas: event.target.value }))}
                                inputMode="numeric"
                                placeholder="4"
                            />
                        </label>
                    </div>

                    <div className={styles.actions}>
                        <button type="submit" className={styles.primaryButton} disabled={saving}>
                            {saving ? 'Salvando...' : form.id ? 'Salvar variação' : 'Criar variação'}
                        </button>
                    </div>
                </form>
            </div>

            <div className={styles.listPanel}>
                <div className={styles.listHeader}>
                    <div>
                        <h3>Variações cadastradas</h3>
                        <p>{variations.length} variações carregadas</p>
                    </div>
                    <div className={styles.filters}>
                        <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="Buscar modelo, versão, FIPE..."
                        />
                        <select value={brandFilter} onChange={event => setBrandFilter(event.target.value)}>
                            <option value="">Todas as marcas</option>
                            {marcas.map(marca => (
                                <option key={marca.id} value={marca.id}>{marca.nome}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.tableShell}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Marca</th>
                                <th>Modelo</th>
                                <th>Versão</th>
                                <th>Ano</th>
                                <th>Combustível</th>
                                <th>Câmbio</th>
                                <th>FIPE</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className={styles.empty}>Carregando...</td>
                                </tr>
                            ) : variations.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className={styles.empty}>Nenhuma variação encontrada.</td>
                                </tr>
                            ) : variations.map(variation => (
                                <tr key={variation.id}>
                                    <td>{variation.marca}</td>
                                    <td><strong>{variation.modelo}</strong></td>
                                    <td>{variation.versao || '-'}</td>
                                    <td>{variation.anoModelo || '-'}</td>
                                    <td>{variation.combustivel || '-'}</td>
                                    <td>{variation.transmissao || '-'}</td>
                                    <td>{variation.codigoFipe || '-'}</td>
                                    <td>
                                        <div className={styles.rowActions}>
                                            <button type="button" onClick={() => setForm(variationToForm(variation))}>
                                                Editar
                                            </button>
                                            <button type="button" onClick={() => deactivateVariation(variation)} disabled={saving}>
                                                Desativar
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
