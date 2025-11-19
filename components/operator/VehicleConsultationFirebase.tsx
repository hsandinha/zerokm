'use client';

import { useState } from 'react';
import { useConfig } from '../../lib/contexts/ConfigContext';
import { useVehicleDatabase } from '../../lib/hooks/useVehicleDatabase';
import { Vehicle } from '../../lib/services/vehicleService';
import styles from './VehicleConsultation.module.css';

interface VehicleConsultationProps {
    onClose?: () => void;
}

export function VehicleConsultation({ onClose }: VehicleConsultationProps) {
    const { margem } = useConfig();
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

    // Usar o hook do banco Firebase
    const { vehicles, loading, error } = useVehicleDatabase();

    // Função para calcular preço com margem
    const calculatePriceWithMargin = (basePrice: number) => {
        return basePrice * (1 + margem / 100);
    };

    // Filtrar veículos baseado na busca
    const filteredVehicles = vehicles.filter(vehicle => {
        if (searchTerm.length === 0) return true;
        if (searchTerm.length < 3) return true;

        const searchFields = [
            vehicle.marca,
            vehicle.modelo,
            vehicle.cor,
            vehicle.status,
            vehicle.categoria,
            vehicle.combustivel,
            vehicle.transmissao,
            vehicle.ano?.toString(),
            vehicle.preco?.toString()
        ];

        return searchFields.some(field =>
            field?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const clearFilters = () => {
        setSearchTerm('');
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(price);
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingContainer}>
                    <div className={styles.spinner}></div>
                    <p>Carregando veículos...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.errorContainer}>
                    <h3>Erro ao carregar veículos</h3>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Consulta de Veículos</h2>
                <div className={styles.headerActions}>
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.viewButton} ${viewMode === 'table' ? styles.active : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            📋 Tabela
                        </button>
                        <button
                            className={`${styles.viewButton} ${viewMode === 'grid' ? styles.active : ''}`}
                            onClick={() => setViewMode('grid')}
                        >
                            🔲 Cards
                        </button>
                    </div>
                </div>
            </div>

            <div className={styles.searchSection}>
                <div className={styles.searchControls}>
                    <div className={styles.searchBox}>
                        <input
                            type="text"
                            placeholder="Digite pelo menos 3 caracteres para buscar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />
                        <button onClick={clearFilters} className={styles.clearButton}>
                            Limpar
                        </button>
                    </div>

                    {margem > 0 && (
                        <div className={styles.marginInfo}>
                            <span className={styles.marginLabel}>Margem Aplicada:</span>
                            <span className={styles.marginValue}>{margem.toFixed(1)}%</span>
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.resultsSection}>
                <h3>Resultados ({filteredVehicles.length})</h3>

                {viewMode === 'table' ? (
                    <div className={styles.tableContainer}>
                        <table className={styles.vehicleTable}>
                            <thead>
                                <tr>
                                    <th>Marca</th>
                                    <th>Modelo</th>
                                    <th>Ano</th>
                                    <th>Cor</th>
                                    <th>Categoria</th>
                                    <th>Combustível</th>
                                    <th>Preço Original</th>
                                    <th>Preço c/ Margem</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredVehicles.map((vehicle) => (
                                    <tr key={vehicle.id}>
                                        <td>{vehicle.marca}</td>
                                        <td>{vehicle.modelo}</td>
                                        <td>{vehicle.ano}</td>
                                        <td>{vehicle.cor}</td>
                                        <td>{vehicle.categoria}</td>
                                        <td>{vehicle.combustivel}</td>
                                        <td>{formatPrice(vehicle.preco)}</td>
                                        <td className={styles.priceWithMargin}>
                                            {formatPrice(calculatePriceWithMargin(vehicle.preco))}
                                        </td>
                                        <td>
                                            <span className={`${styles.status} ${styles[vehicle.status.toLowerCase().replace('í', 'i')]}`}>
                                                {vehicle.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={styles.gridContainer}>
                        {filteredVehicles.map((vehicle) => (
                            <div key={vehicle.id} className={styles.vehicleCard}>
                                <div className={styles.cardHeader}>
                                    <h4>{vehicle.marca} {vehicle.modelo}</h4>
                                    <span className={`${styles.status} ${styles[vehicle.status.toLowerCase().replace('í', 'i')]}`}>
                                        {vehicle.status}
                                    </span>
                                </div>
                                <div className={styles.cardContent}>
                                    <div className={styles.vehicleInfo}>
                                        <div className={styles.infoRow}>
                                            <span>Ano:</span> <strong>{vehicle.ano}</strong>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span>Cor:</span> <strong>{vehicle.cor}</strong>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span>Categoria:</span> <strong>{vehicle.categoria}</strong>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span>Combustível:</span> <strong>{vehicle.combustivel}</strong>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span>Transmissão:</span> <strong>{vehicle.transmissao}</strong>
                                        </div>
                                        {vehicle.quilometragem !== undefined && (
                                            <div className={styles.infoRow}>
                                                <span>KM:</span> <strong>{vehicle.quilometragem.toLocaleString()}</strong>
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.priceSection}>
                                        <div className={styles.originalPrice}>
                                            Preço: {formatPrice(vehicle.preco)}
                                        </div>
                                        {margem > 0 && (
                                            <div className={styles.priceWithMarginCard}>
                                                Com margem ({margem}%): <strong>{formatPrice(calculatePriceWithMargin(vehicle.preco))}</strong>
                                            </div>
                                        )}
                                    </div>
                                    {vehicle.descricao && (
                                        <div className={styles.description}>
                                            {vehicle.descricao}
                                        </div>
                                    )}
                                    {vehicle.opcionais && (
                                        <div className={styles.opcionais}>
                                            <strong>Opcionais:</strong>
                                            <div className={styles.opcionaisList}>
                                                {vehicle.opcionais.split(',').map((opcional, index) => (
                                                    <span key={index} className={styles.opcional}>{opcional.trim()}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {filteredVehicles.length === 0 && (
                    <div className={styles.noResults}>
                        <h4>Nenhum veículo encontrado</h4>
                        <p>Tente ajustar os termos da busca ou limpar os filtros.</p>
                    </div>
                )}
            </div>
        </div>
    );
}