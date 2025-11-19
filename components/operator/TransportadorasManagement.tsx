'use client';

import { useState, useEffect } from 'react';
import { Transportadora, TransportadoraService } from '../../lib/services/transportadoraService';
import { AddTransportadoraModal } from './AddTransportadoraModal';
import styles from './VehicleConsultation.module.css';

export function TransportadorasManagement() {
    const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingTransportadora, setEditingTransportadora] = useState<Transportadora | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

    // Carregar transportadoras
    const loadTransportadoras = async () => {
        try {
            setLoading(true);
            const data = await TransportadoraService.getAllTransportadoras();
            setTransportadoras(data);
        } catch (error) {
            console.error('Erro ao carregar transportadoras:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTransportadoras();
    }, []);

    // Filtrar transportadoras
    const filteredTransportadoras = transportadoras.filter(transportadora => {
        if (searchTerm.length < 3) return true;

        const searchFields = [
            transportadora.nome,
            transportadora.razaoSocial,
            transportadora.cnpj,
            transportadora.telefone,
            transportadora.email,
            transportadora.cidade,
            transportadora.estado,
            transportadora.nomeResponsavel
        ];

        return searchFields.some(field =>
            field?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    // Handlers
    const handleAddTransportadora = () => {
        setEditingTransportadora(null);
        setIsEditing(false);
        setShowModal(true);
    };

    const handleEditTransportadora = (transportadora: Transportadora) => {
        setEditingTransportadora(transportadora);
        setIsEditing(true);
        setShowModal(true);
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
                    <p>Carregando transportadoras...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Gestão de Transportadoras</h2>
                <div className={styles.headerActions}>
                    <button className={styles.addButton} onClick={handleAddTransportadora}>
                        + Nova Transportadora
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

            <div className={styles.searchSection}>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Buscar por nome, CNPJ, cidade, responsável... (min. 3 caracteres)"
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
                    <h3>Resultados ({filteredTransportadoras.length})</h3>
                </div>

                {viewMode === 'table' ? (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.tableHeader}>NOME FANTASIA</th>
                                    <th className={styles.tableHeader}>RAZÃO SOCIAL</th>
                                    <th className={styles.tableHeader}>CNPJ</th>
                                    <th className={styles.tableHeader}>TELEFONE</th>
                                    <th className={styles.tableHeader}>CIDADE/UF</th>
                                    <th className={styles.tableHeader}>RESPONSÁVEL</th>
                                    <th className={styles.tableHeader}>STATUS</th>
                                    <th className={styles.tableHeader}>AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransportadoras.map((transportadora) => (
                                    <tr key={transportadora.id} className={styles.tableRow}>
                                        <td className={styles.tableCell}>{transportadora.nome}</td>
                                        <td className={styles.tableCell}>{transportadora.razaoSocial}</td>
                                        <td className={styles.tableCell}>{transportadora.cnpj}</td>
                                        <td className={styles.tableCell}>{transportadora.telefone}</td>
                                        <td className={styles.tableCell}>{transportadora.cidade} - {transportadora.estado}</td>
                                        <td className={styles.tableCell}>
                                            <div>
                                                <div>{transportadora.nomeResponsavel}</div>
                                                <small style={{ color: '#666' }}>{transportadora.telefoneResponsavel}</small>
                                            </div>
                                        </td>
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
                        {filteredTransportadoras.map((transportadora) => (
                            <div key={transportadora.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <h4 className={styles.cardTitle}>{transportadora.nome}</h4>
                                    <span className={`${styles.statusBadge} ${transportadora.ativo ? styles.statusActive : styles.statusInactive}`}>
                                        {transportadora.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>

                                <div className={styles.cardBody}>
                                    <div className={styles.cardRow}>
                                        <span className={styles.cardLabel}>Razão Social:</span>
                                        <span className={styles.cardValue}>{transportadora.razaoSocial}</span>
                                    </div>
                                    <div className={styles.cardRow}>
                                        <span className={styles.cardLabel}>CNPJ:</span>
                                        <span className={styles.cardValue}>{transportadora.cnpj}</span>
                                    </div>
                                    <div className={styles.cardRow}>
                                        <span className={styles.cardLabel}>Telefone:</span>
                                        <span className={styles.cardValue}>{transportadora.telefone}</span>
                                    </div>
                                    <div className={styles.cardRow}>
                                        <span className={styles.cardLabel}>E-mail:</span>
                                        <span className={styles.cardValue}>{transportadora.email}</span>
                                    </div>
                                    <div className={styles.cardRow}>
                                        <span className={styles.cardLabel}>Localização:</span>
                                        <span className={styles.cardValue}>{transportadora.cidade} - {transportadora.estado}</span>
                                    </div>
                                    <div className={styles.cardRow}>
                                        <span className={styles.cardLabel}>Responsável:</span>
                                        <span className={styles.cardValue}>
                                            {transportadora.nomeResponsavel} - {transportadora.telefoneResponsavel}
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
            </div>

            <AddTransportadoraModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onTransportadoraAdded={handleTransportadoraAdded}
                editingTransportadora={editingTransportadora}
                isEditing={isEditing}
            />
        </div>
    );
}