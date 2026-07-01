import React, { RefObject } from 'react';
import styles from './VehicleConsultation.module.css';

interface VehicleSidebarProps {
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
