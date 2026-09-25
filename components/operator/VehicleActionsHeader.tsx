import React from 'react';
import { CalendarDays, Trash2, Download, ChartNoAxesCombined, Table2, LayoutGrid, X } from 'lucide-react';
import styles from './VehicleConsultation.module.css';

interface VehicleActionsHeaderProps {
    role: string;
    selectedIds: string[];
    handleBulkUpdateDate: () => void;
    handleBulkDelete: () => void;
    showExportMenu: boolean;
    setShowExportMenu: (show: boolean) => void;
    isExporting: boolean;
    handleExport: (format: 'csv' | 'json') => void;
    setShowMargemModal: (show: boolean) => void;
    viewMode: 'table' | 'grid';
    setViewMode: (mode: 'table' | 'grid') => void;
    onClose?: () => void;
    setShowUpgradeModal: (show: boolean) => void;
    /** Banner no centro do cabeçalho, como no painel do cliente. */
    banner?: React.ReactNode;
    /** Título do cabeçalho. Padrão: "Consulta de Veículos"; a aba Favoritos do cliente usa "Favoritos". */
    title?: string;
    /** Linha abaixo do título (ex.: quantidade de veículos disponíveis). */
    subtitle?: React.ReactNode;
    /** Bloco ao lado do banner (ex.: transportadora parceira). */
    aside?: React.ReactNode;
}

export function VehicleActionsHeader({
    role,
    selectedIds,
    handleBulkUpdateDate,
    handleBulkDelete,
    showExportMenu,
    setShowExportMenu,
    isExporting,
    handleExport,
    setShowMargemModal,
    viewMode,
    setViewMode,
    onClose,
    setShowUpgradeModal,
    banner,
    title = 'Consulta de Veículos',
    subtitle,
    aside
}: VehicleActionsHeaderProps) {
    return (
        <div className={styles.header}>
            <div className={styles.headerTitleGroup}>
                <div className={styles.headerTitleRow}>
                    <h2>{title}</h2>
                    {subtitle && <span className={styles.headerCount}>{subtitle}</span>}
                </div>
            </div>
            {banner && <div className={styles.headerBanner}><div className={styles.headerBannerInner}>{banner}</div></div>}
            {aside}
            <div className={styles.headerActions}>
                <VehicleHeaderActions
                    role={role}
                    selectedIds={selectedIds}
                    handleBulkUpdateDate={handleBulkUpdateDate}
                    handleBulkDelete={handleBulkDelete}
                    showExportMenu={showExportMenu}
                    setShowExportMenu={setShowExportMenu}
                    isExporting={isExporting}
                    handleExport={handleExport}
                    setShowMargemModal={setShowMargemModal}
                    onClose={onClose}
                />
            </div>
        </div>
    );
}

interface VehicleHeaderActionsProps {
    role: string;
    selectedIds: string[];
    handleBulkUpdateDate: () => void;
    handleBulkDelete: () => void;
    showExportMenu: boolean;
    setShowExportMenu: (show: boolean) => void;
    isExporting: boolean;
    handleExport: (format: 'csv' | 'json') => void;
    setShowMargemModal: (show: boolean) => void;
    onClose?: () => void;
}

/**
 * Ações da consulta (lote, Exportar, Margem, fechar). No cabeçalho do cliente ou,
 * nos painéis da equipe (sem cabeçalho), na linha da busca ao lado de "Limpar filtros".
 */
export function VehicleHeaderActions({
    role,
    selectedIds,
    handleBulkUpdateDate,
    handleBulkDelete,
    showExportMenu,
    setShowExportMenu,
    isExporting,
    handleExport,
    setShowMargemModal,
    onClose,
}: VehicleHeaderActionsProps) {
    return (
        <>
        {role !== 'client' && selectedIds.length > 0 && (
            <>
                <button
                    className={styles.importButton}
                    onClick={handleBulkUpdateDate}
                    title="Atualizar Data de Atualização"
                >
                    <CalendarDays size={16} aria-hidden="true" /> Atualizar data ({selectedIds.length})
                </button>
                <button
                    className={styles.bulkDeleteButton}
                    onClick={handleBulkDelete}
                    title="Excluir Selecionados"
                >
                    <Trash2 size={16} aria-hidden="true" /> Excluir ({selectedIds.length})
                </button>
            </>
        )}
        {role !== 'client' && role !== 'gratis' && role !== 'dealership' && role !== 'vendedor' && (
            <div className={styles.exportWrapper}>
                <button
                    className={styles.importButton}
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    title="Exportar Veículos"
                    disabled={isExporting}
                >
                    <Download size={16} aria-hidden="true" /> {isExporting ? 'Exportando...' : 'Exportar'}
                </button>
                {showExportMenu && (
                    <div className={styles.exportMenu} role="menu">
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleExport('csv')}
                        >
                            CSV (.csv)
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleExport('json')}
                        >
                            JSON (.json)
                        </button>
                    </div>
                )}
            </div>
        )}

        {/* Margem: admin, gerente e client (plano pago) editam */}
        {['admin', 'administrador', 'gerente', 'client'].includes(role) && (
            <button
                className={styles.importButton}
                onClick={() => setShowMargemModal(true)}
                title="Configurar Margem"
            >
                <ChartNoAxesCombined size={16} aria-hidden="true" /> Margem
            </button>
        )}

        {onClose && (
            <button className={styles.closeButton} onClick={onClose} aria-label="Fechar consulta">
                <X size={16} aria-hidden="true" />
            </button>
        )}
        </>
    );
}

/** Alternância entre tabela e cards. Fica na linha da busca, junto de "Limpar filtros". */
export function ViewToggle({ viewMode, setViewMode }: { viewMode: 'table' | 'grid'; setViewMode: (mode: 'table' | 'grid') => void }) {
    return (
        <div className={styles.viewToggle} role="group" aria-label="Forma de exibição">
            <button
                type="button"
                className={`${styles.viewButton} ${viewMode === 'table' ? styles.active : ''}`}
                onClick={() => setViewMode('table')}
                title="Ver em tabela"
                aria-label="Ver em tabela"
                aria-pressed={viewMode === 'table'}
            >
                <Table2 size={17} aria-hidden="true" />
            </button>
            <button
                type="button"
                className={`${styles.viewButton} ${viewMode === 'grid' ? styles.active : ''}`}
                onClick={() => setViewMode('grid')}
                title="Ver em cards"
                aria-label="Ver em cards"
                aria-pressed={viewMode === 'grid'}
            >
                <LayoutGrid size={17} aria-hidden="true" />
            </button>
        </div>
    );
}
