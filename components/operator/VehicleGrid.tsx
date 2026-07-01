import React from 'react';
import { Vehicle } from '../../lib/services/vehicleService';
import { calculateDaysSinceUpdate, formatDate, getUpdateStatusColor } from '../../lib/utils/formatters';
import { FaWhatsapp } from 'react-icons/fa';
import styles from './VehicleConsultation.module.css';

export function getStatusColor(status: string | undefined) {
    switch (status?.toLowerCase()) {
        case 'a faturar':
            return styles.statusAvailable;
        case 'refaturamento':
            return styles.statusReserved;
        case 'licenciado':
            return styles.statusSold;
        case 'pedido de fábrica':
            return styles.statusReserved;
        default:
            return styles.statusDefault;
    }
}

interface VehicleCardProps {
    vehicle: Vehicle;
    margem: number;
    fixedMargin: number;
    marginMode: 'percent' | 'fixed';
    onWhatsApp: (vehicle: Vehicle) => void;
    onLocationClick: (vehicle: Vehicle) => void;
    role?: string;
    canViewLocation?: boolean;
}

export function VehicleCard({ vehicle, margem, fixedMargin, marginMode, onWhatsApp, onLocationClick, role = 'operator', canViewLocation = false }: VehicleCardProps) {
    const calculateClientPrice = () => {
        const basePrice = vehicle.preco || 0;
        if (marginMode === 'fixed') {
            return basePrice + (fixedMargin || 0);
        }
        return basePrice * (1 + margem / 100);
    };

    return (
        <div className={styles.vehicleCard}>
            <div className={styles.cardHeader}>
                <h4 className={styles.cardTitle}>{vehicle.modelo}</h4>
                <span className={`${styles.statusBadge} ${getStatusColor(vehicle.status)}`}>
                    {vehicle.status}
                </span>
            </div>

            <div className={styles.cardBody}>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Data Entrada:</span>
                    <span className={styles.cardValue}>{formatDate(vehicle.dataEntrada)}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Ano:</span>
                    <span className={styles.cardValue}>{vehicle.ano}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>UF:</span>
                    <span className={styles.cardValue}>{vehicle.estado}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Cor:</span>
                    <span className={styles.cardValue}>{vehicle.cor}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Combustível:</span>
                    <span className={styles.cardValue}>{vehicle.combustivel}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Transmissão:</span>
                    <span className={styles.cardValue}>{vehicle.transmissao}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Localização:</span>
                    <span className={styles.cardValue}>
                        {(['admin', 'administrador', 'administrativo', 'gerente', 'operator', 'operador', 'dealership', 'gratis', 'vendedor'].includes(role) || canViewLocation) ? (
                            <button
                                onClick={() => onLocationClick(vehicle)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#2563eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: 0,
                                    fontSize: '0.9rem'
                                }}
                            >
                                📍 Ver detalhes
                            </button>
                        ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Restrito</span>
                        )}
                    </span>
                </div>
                {role !== 'client' && vehicle.operador && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Operador:</span>
                        <span className={styles.cardValue}>{vehicle.operador}</span>
                    </div>
                )}
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Última Atualização:</span>
                    <span className={styles.cardValue}>
                        {(() => {
                            const days = calculateDaysSinceUpdate(vehicle.updatedAt);
                            const color = getUpdateStatusColor(days);
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: color
                                        }}
                                    />
                                    <span>{formatDate(vehicle.updatedAt)}</span>
                                    <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>({days}d)</span>
                                </div>
                            );
                        })()}
                    </span>
                </div>
                {vehicle.observacoes && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Observações:</span>
                        <span className={styles.cardValue}>{vehicle.observacoes}</span>
                    </div>
                )}
            </div>

            <div className={styles.cardFooter}>
                <div className={styles.priceSection}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <span className={styles.priceLabel} style={{ fontSize: '0.8rem' }}>Preço:</span>
                        <span className={styles.priceValue} style={{ fontSize: '0.9rem' }}>
                            R$ {(role === 'client' ? calculateClientPrice() : (vehicle.preco || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
                <div className={styles.cardActions}>
                    <span
                        className={styles.whatsappButton}
                        title="Contatar via WhatsApp"
                        onClick={() => onWhatsApp(vehicle)}
                        style={{ backgroundColor: '#25D366', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem' }}
                        role="button"
                        tabIndex={0}
                    >
                        <FaWhatsapp size={18} /> WhatsApp
                    </span>
                </div>
            </div>
        </div>
    );
}

interface VehicleGridProps {
    vehicles: Vehicle[];
    margem: number;
    fixedMargin: number;
    marginMode: 'percent' | 'fixed';
    onWhatsApp: (vehicle: Vehicle) => void;
    onLocationClick: (vehicle: Vehicle) => void;
    role?: string;
    canViewLocation?: boolean;
}

export function VehicleGrid({ vehicles, margem, fixedMargin, marginMode, onWhatsApp, onLocationClick, role, canViewLocation }: VehicleGridProps) {
    return (
        <div className={styles.gridContainer}>
            {vehicles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', gridColumn: '1 / -1' }}>
                    Nenhum veículo encontrado para os filtros atuais.
                </div>
            ) : (
                vehicles.map((vehicle) => (
                    <VehicleCard
                        key={vehicle.id}
                        vehicle={vehicle}
                        margem={margem}
                        fixedMargin={fixedMargin}
                        marginMode={marginMode}
                        onWhatsApp={onWhatsApp}
                        onLocationClick={onLocationClick}
                        role={role}
                        canViewLocation={canViewLocation}
                    />
                ))
            )}
        </div>
    );
}
