'use client';

import { useState, useEffect } from 'react';
import { Transportadora, TransportadoraService } from '../../lib/services/transportadoraService';
import { AddTransportadoraModal } from './AddTransportadoraModal';
import styles from './VehicleConsultation.module.css';

export function TransportadorasManagement() {
    const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingTransportadora, setEditingTransportadora] = useState<Transportadora | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [totalItems, setTotalItems] = useState(0);

    // Carregar transportadoras
    const loadTransportadoras = async () => {
        try {
            setLoading(true);
            const { data, total } = await TransportadoraService.getTransportadorasPaginated({
                page: currentPage,
                itemsPerPage: itemsPerPage === -1 ? 1000 : itemsPerPage,
                searchTerm
            });
            setTransportadoras(data);
            setTotalItems(total);
        } catch (error) {
            console.error('Erro ao carregar transportadoras:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            loadTransportadoras();
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [currentPage, itemsPerPage, searchTerm]);

    // Resetar página quando busca muda
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const closeForm = () => {
        setShowForm(false);
        setEditingTransportadora(null);
    };

    // Handlers
    const handleAddTransportadora = () => {
        if (showForm && !editingTransportadora) {
            closeForm();
            return;
        }
        setEditingTransportadora(null);
        setShowForm(true);
    };

    const handleEditTransportadora = (transportadora: Transportadora) => {
        setEditingTransportadora(transportadora);
        setShowForm(true);
    };

    const handleDeleteTransportadora = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir esta transportadora?')) {
            try {
                await TransportadoraService.deleteTransportadora(id);
                await loadTransportadoras();
            } catch (error) {
                console.error('Erro ao excluir transportadora:', error);
                alert('Erro ao excluir transportadora. Tente novamente.');
            }
        }
    };

    const handleToggleStatus = async (transportadora: Transportadora) => {
        try {
            await TransportadoraService.updateTransportadora(transportadora.id!, {
                ativo: !transportadora.ativo
            });
            await loadTransportadoras();
        } catch (error) {
            console.error('Erro ao alterar status:', error);
            alert('Erro ao alterar status. Tente novamente.');
        }
    };

    const handleTransportadoraAdded = () => {
        loadTransportadoras();
    };

    const clearSearch = () => {
        setSearchTerm('');
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingContainer}>
                    <div className={styles.spinner}></div>
                    <p>Carregando tabela de fretes...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Tabela de Fretes</h2>
                <div className={styles.headerActions}>
                    <button className={styles.addButton} onClick={handleAddTransportadora}>
                        {showForm ? 'Cancelar' : '+ Novo Frete'}
                    </button>
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.viewButton} ${viewMode === 'table' ? styles.active : ''}`}
                            onClick={() => setViewMode('table')}
                            title="Visualização em Tabela"
                        >
                            📊
                        </button>
                        <button
                            className={`${styles.viewButton} ${viewMode === 'cards' ? styles.active : ''}`}
                            onClick={() => setViewMode('cards')}
                            title="Visualização em Cards"
                        >
                            📋
                        </button>
                    </div>
                </div>
            </div>

            {showForm && (
                <div className={styles.inlineFormWrapper}>
                    <AddTransportadoraModal
                        isOpen={showForm}
                        onClose={closeForm}
                        onTransportadoraAdded={handleTransportadoraAdded}
                        editingTransportadora={editingTransportadora ?? undefined}
                        isEditing={Boolean(editingTransportadora)}
                    />
                </div>
            )}

            <div className={styles.searchSection}>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Buscar por estado..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                    {searchTerm && (
                        <button className={styles.clearButton} onClick={clearSearch}>
                            ✕
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.resultsSection}>
                <div className={styles.resultsHeader}>
                    <h3>Resultados ({totalItems})</h3>
                </div>

                {viewMode === 'table' ? (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.tableHeader}>ESTADO</th>
                                    <th className={styles.tableHeader}>VALOR DO FRETE</th>
                                    <th className={styles.tableHeader}>OBSERVAÇÃO</th>
                                    <th className={styles.tableHeader}>STATUS</th>
                                    <th className={styles.tableHeader}>AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transportadoras.map((transportadora) => (
                                    <tr key={transportadora.id} className={styles.tableRow}>
                                        <td className={styles.tableCell}>{transportadora.estado}</td>
                                        <td className={styles.tableCell}>
                                            {transportadora.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                        <td className={styles.tableCell}>{transportadora.observacao || '-'}</td>
                                        <td className={styles.tableCell}>
                                            <span className={`${styles.statusBadge} ${transportadora.ativo ? styles.statusActive : styles.statusInactive}`}>
                                                {transportadora.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                        <td className={styles.tableCell}>
                                            <div className={styles.actionButtons}>
                                                <button
                                                    className={styles.editButton}
                                                    onClick={() => handleEditTransportadora(transportadora)}
                                                    title="Editar"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className={styles.toggleButton}
                                                    onClick={() => handleToggleStatus(transportadora)}
                                                    title={transportadora.ativo ? 'Desativar' : 'Ativar'}
                                                >
                                                    {transportadora.ativo ? '⏸️' : '▶️'}
                                                </button>
                                                <button
                                                    className={styles.deleteButton}
                                                    onClick={() => handleDeleteTransportadora(transportadora.id!)}
                                                    title="Excluir"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={styles.cardsContainer}>
                        {transportadoras.map((transportadora) => (
                            <div key={transportadora.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <h4 className={styles.cardTitle}>{transportadora.estado}</h4>
                                    <span className={`${styles.statusBadge} ${transportadora.ativo ? styles.statusActive : styles.statusInactive}`}>
                                        {transportadora.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>

                                <div className={styles.cardBody}>
                                    <div className={styles.cardRow}>
                                        <span className={styles.cardLabel}>Valor do Frete:</span>
                                        <span className={styles.cardValue}>
                                            {transportadora.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                    </div>
                                </div>

                                <div className={styles.cardActions}>
                                    <button
                                        className={styles.editButton}
                                        onClick={() => handleEditTransportadora(transportadora)}
                                    >
                                        ✏️ Editar
                                    </button>
                                    <button
                                        className={styles.toggleButton}
                                        onClick={() => handleToggleStatus(transportadora)}
                                    >
                                        {transportadora.ativo ? '⏸️ Desativar' : '▶️ Ativar'}
                                    </button>
                                    <button
                                        className={styles.deleteButton}
                                        onClick={() => handleDeleteTransportadora(transportadora.id!)}
                                    >
                                        🗑️ Excluir
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.paginationContainer} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '10px', borderTop: '1px solid #eee' }}>
                    <div className={styles.itemsPerPage}>
                        <label htmlFor="itemsPerPage">Itens por página: </label>
                        <select
                            id="itemsPerPage"
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(parseInt(e.target.value));
                                setCurrentPage(1);
                            }}
                            style={{ marginLeft: '10px', padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={75}>75</option>
                            <option value={100}>100</option>
                            <option value={-1}>Todos</option>
                        </select>
                    </div>

                    <div className={styles.paginationControls} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            style={{
                                padding: '5px 10px',
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                opacity: currentPage === 1 ? 0.5 : 1,
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                background: '#fff'
                            }}
                        >
                            Anterior
                        </button>
                        <span>
                            Página {currentPage} de {itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage)}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage), p + 1))}
                            disabled={currentPage === (itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage))}
                            style={{
                                padding: '5px 10px',
                                cursor: currentPage === (itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage)) ? 'not-allowed' : 'pointer',
                                opacity: currentPage === (itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage)) ? 0.5 : 1,
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                background: '#fff'
                            }}
                        >
                            Próxima
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}