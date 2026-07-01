import React from 'react';
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
    setShowUpgradeModal
}: VehicleActionsHeaderProps) {
    return (
        <div className={styles.header}>
            <h2>Consulta de Veículos</h2>
            {role === 'gratis' && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: '#1e3a5f',
                    border: '1px solid #3b82f6',
                    borderRadius: '8px', padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600,
                }}>
                    <span>🔒</span>
                    <span style={{ color: '#93c5fd' }}>
                        Assine um plano para desbloquear localização e contato das concessionárias
                    </span>
                    <button
                        onClick={() => setShowUpgradeModal(true)}
                        style={{
                            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '5px',
                            padding: '3px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                        }}
                    >
                        Ver planos
                    </button>
                </div>
            )}
            <div className={styles.headerActions}>
                {role !== 'client' && selectedIds.length > 0 && (
                    <>
                        <button
                            className={styles.importButton}
                            onClick={handleBulkUpdateDate}
                            title="Atualizar Data de Atualização"
                            style={{ marginRight: '8px' }}
                        >
                            📅 Atualizar Data ({selectedIds.length})
                        </button>
                        <button
                            className={styles.bulkDeleteButton}
                            onClick={handleBulkDelete}
                            title="Excluir Selecionados"
                        >
                            🗑️ Excluir ({selectedIds.length})
                        </button>
                    </>
                )}
                {role !== 'client' && role !== 'gratis' && role !== 'dealership' && role !== 'vendedor' && (
                    <div className={styles.exportWrapper} style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                            className={styles.exportButton}
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            title="Exportar Veículos"
                            disabled={isExporting}
                            style={{ marginRight: '8px' }}
                        >
                            {isExporting ? 'Exportando...' : '📤 Exportar'}
                        </button>
                        {showExportMenu && (
                            <div className={styles.exportMenu} style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                zIndex: 10,
                                background: 'white',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                                display: 'flex',
                                flexDirection: 'column',
                                minWidth: '120px'
                            }}>
                                <button
                                    onClick={() => handleExport('csv')}
                                    style={{ padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#333' }}
                                >
                                    CSV (.csv)
                                </button>
                                <button
                                    onClick={() => handleExport('json')}
                                    style={{ padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: '#333' }}
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
                        style={{ marginRight: '8px' }}
                    >
                        💹 Margem
                    </button>
                )}

                <div className={styles.viewToggle}>
                    <button
                        className={`${styles.viewButton} ${viewMode === 'table' ? styles.active : ''}`}
                        onClick={() => setViewMode('table')}
                        title="Visualização em Tabela"
                    >
                        📊
                    </button>
                    <button
                        className={`${styles.viewButton} ${viewMode === 'grid' ? styles.active : ''}`}
                        onClick={() => setViewMode('grid')}
                        title="Visualização em Grade"
                    >
                        ⊞
                    </button>
                </div>
                {onClose && (
                    <button className={styles.closeButton} onClick={onClose}>
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}
