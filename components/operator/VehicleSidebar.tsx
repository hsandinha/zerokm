import React, { RefObject } from 'react';
import styles from './VehicleConsultation.module.css';

export type TipoSegmento = 'todos' | 'carro' | 'moto' | 'repasse';

/** Segmentos da vitrine. "Todos" junta 0KM e repasse na mesma lista. */
export const TIPO_SEGMENTOS: Array<{ value: TipoSegmento; label: string; disabled?: boolean; hint?: string }> = [
    { value: 'todos', label: 'Todos' },
    { value: 'carro', label: 'Carros 0KM' },
    { value: 'moto', label: 'Motos 0KM' },
    { value: 'repasse', label: 'Repasse' },
];

interface VehicleSidebarProps {
    tipoVeiculo: TipoSegmento;
    setTipoVeiculo: (value: TipoSegmento) => void;
    modelSearch: string;
    setModelSearch: (value: string) => void;
    handleModelSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    selectedModel: string | null;
    handleModelSelect: (model: string | null) => void;
    filteredModels: string[];
    focusedModelIndex: number;
    modelListRef: React.RefObject<HTMLDivElement | null>;
}

export function VehicleSidebar({
    tipoVeiculo,
    setTipoVeiculo,
    modelSearch,
    setModelSearch,
    handleModelSearchKeyDown,
    selectedModel,
    handleModelSelect,
    filteredModels,
    focusedModelIndex,
    modelListRef
}: VehicleSidebarProps) {
    return (
        <div className={styles.sidebar}>
            <div className={styles.tipoSegmento} role="tablist" aria-label="Segmento de veículos">
                {TIPO_SEGMENTOS.map(seg => (
                    <button
                        key={seg.value}
                        type="button"
                        role="tab"
                        aria-selected={tipoVeiculo === seg.value}
                        disabled={seg.disabled}
                        title={seg.hint}
                        className={`${styles.tipoSegmentoItem} ${tipoVeiculo === seg.value ? styles.tipoSegmentoActive : ''}`}
                        onClick={() => { if (!seg.disabled) setTipoVeiculo(seg.value); }}
                    >
                        {seg.label}
                        {seg.hint && <span className={styles.tipoSegmentoHint}>{seg.hint}</span>}
                    </button>
                ))}
            </div>
            <div className={styles.sidebarHeader}>
                <input
                    type="text"
                    placeholder="Filtrar modelos..."
                    className={styles.modelSearchInput}
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    onKeyDown={handleModelSearchKeyDown}
                />
            </div>
            <div className={styles.modelList} ref={modelListRef as any}>
                <div
                    className={`${styles.modelItem} ${selectedModel === null ? styles.active : ''} ${focusedModelIndex === 0 ? styles.focused : ''}`}
                    onClick={() => handleModelSelect(null)}
                >
                    Todos os Modelos
                </div>
                {filteredModels.map((model, index) => (
                    <div
                        key={model}
                        className={`${styles.modelItem} ${selectedModel === model ? styles.active : ''} ${focusedModelIndex === index + 1 ? styles.focused : ''}`}
                        onClick={() => handleModelSelect(model)}
                    >
                        {model}
                    </div>
                ))}
            </div>
        </div>
    );
}
