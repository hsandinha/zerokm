import React from 'react';
import { Vehicle } from '../../lib/services/vehicleService';
import { calculateDaysSinceUpdate, formatDate, getUpdateStatusColor } from '../../lib/utils/formatters';
import { HighlightText } from '../HighlightText';
import { getStatusColor } from './VehicleGrid';
import { EditableTextCell, EditableSelectCell, EditableAutocompleteCell, EditableYearCell, EditableCurrencyCell } from './EditableCells';
import { FaWhatsapp } from 'react-icons/fa';
import styles from './VehicleConsultation.module.css';

interface VehicleTableProps {
    vehicles: Vehicle[];
    selectedIds: string[];
    selectedModel: string | null;
    isClientReadOnly: boolean;
    sortConfig: { key: keyof Vehicle | 'updatedAt'; direction: 'asc' | 'desc' };
    pendingSearchTerm: string;
    modeloOptions: string[];
    transmissaoOptions: string[];
    combustivelOptions: string[];
    statusOptions: string[];
    brazilStates: string[];
    role?: string;
    localCredits: number;
    margem: number;
    fixedMargin: number;
    marginMode: 'percent' | 'fixed';

    handleSelectAll: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleSort: (key: keyof Vehicle | 'updatedAt') => void;
    handleSelectOne: (id: string) => void;
    handleUpdateVehicleField: (vehicle: Vehicle, field: keyof Vehicle, newValue: any) => void;
    handleUpdateOpcionais: (vehicle: Vehicle, newValue: string) => void;
    handleUpdatePreco: (vehicle: Vehicle, newValue: number | undefined) => void;
    handleLocationClick: (vehicle: Vehicle) => void;
    onWhatsApp: (vehicle: Vehicle) => void;
}

export function VehicleTable({
    vehicles,
    selectedIds,
    selectedModel,
    isClientReadOnly,
    sortConfig,
    pendingSearchTerm,
    modeloOptions,
    transmissaoOptions,
    combustivelOptions,
    statusOptions,
    brazilStates,
    role,
    localCredits,
    margem,
    fixedMargin,
    marginMode,
    handleSelectAll,
    handleSort,
    handleSelectOne,
    handleUpdateVehicleField,
    handleUpdateOpcionais,
    handleUpdatePreco,
    handleLocationClick,
    onWhatsApp,
}: VehicleTableProps) {
    
    const calculateClientPrice = (vehicle: Vehicle) => {
        const basePrice = vehicle.preco || 0;
        if (marginMode === 'fixed') {
            return basePrice + (fixedMargin || 0);
        }
        return basePrice * (1 + margem / 100);
    };

    return (
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.tableHeader}>
                            <input
                                type="checkbox"
                                onChange={(e) => {
                                    if (!isClientReadOnly) {
                                        handleSelectAll(e);
                                    }
                                }}
                                checked={vehicles.length > 0 && selectedIds.length === vehicles.length}
                                disabled={isClientReadOnly}
                            />
                        </th>
                        {!selectedModel && (
                            <th className={styles.tableHeader} onClick={() => handleSort('modelo')} style={{ cursor: 'pointer' }}>
                                MODELO {sortConfig.key === 'modelo' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                        )}
                        <th className={styles.tableHeader} onClick={() => handleSort('transmissao')} style={{ cursor: 'pointer' }}>
                            TRANSMISSÃO {sortConfig.key === 'transmissao' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className={styles.tableHeader} onClick={() => handleSort('combustivel')} style={{ cursor: 'pointer' }}>
                            COMBUSTÍVEL {sortConfig.key === 'combustivel' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className={styles.tableHeader} onClick={() => handleSort('cor')} style={{ cursor: 'pointer' }}>
                            COR {sortConfig.key === 'cor' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className={styles.tableHeader} onClick={() => handleSort('ano')} style={{ cursor: 'pointer' }}>
                            ANO {sortConfig.key === 'ano' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className={`${styles.tableHeader} ${styles.colOpcionais}`} onClick={() => handleSort('opcionais')} style={{ cursor: 'pointer' }}>
                            OPCIONAIS {sortConfig.key === 'opcionais' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className={styles.tableHeader} onClick={() => handleSort('preco')} style={{ cursor: 'pointer' }}>
                            PREÇO (R$) {sortConfig.key === 'preco' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className={styles.tableHeader} onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                            STATUS {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        {role !== 'dealership' && role !== 'gratis' && (
                            <th className={styles.tableHeader} onClick={() => handleSort('estado')} style={{ cursor: 'pointer' }}>
                                UF {sortConfig.key === 'estado' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                        )}
                        <th className={styles.tableHeader} onClick={() => handleSort('observacoes')} style={{ cursor: 'pointer' }}>
                            OBSERVAÇÕES {sortConfig.key === 'observacoes' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        {!['dealership', 'client', 'gratis'].includes(role || '') && (
                            <th className={styles.tableHeader} onClick={() => handleSort('frete')} style={{ cursor: 'pointer' }}>
                                FRETE {sortConfig.key === 'frete' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                        )}
                        {role !== 'client' && role !== 'gratis' && (
                            <th className={styles.tableHeader} onClick={() => handleSort('operador')} style={{ cursor: 'pointer' }}>
                                OPERADOR {sortConfig.key === 'operador' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                        )}
                        
                        <th className={styles.tableHeader} onClick={() => handleSort('updatedAt')} style={{ cursor: 'pointer' }}>
                            DATAS {sortConfig.key === 'updatedAt' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        {['admin', 'administrador', 'administrativo', 'gerente', 'operator', 'operador', 'dealership', 'client', 'gratis', 'vendedor'].includes(role || '') && (
                            <th className={styles.tableHeader}>AÇÕES</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {vehicles.map((vehicle) => (
                        <tr key={vehicle.id} className={styles.tableRow}>
                            <td className={styles.tableCell}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(vehicle.id || '')}
                                    onChange={() => {
                                        if (!isClientReadOnly) {
                                            handleSelectOne(vehicle.id || '');
                                        }
                                    }}
                                    disabled={isClientReadOnly}
                                />
                            </td>
                            {!selectedModel && (
                                <td className={styles.tableCell}>
                                    {isClientReadOnly ? (
                                        <HighlightText text={vehicle.modelo} searchTerm={pendingSearchTerm} />
                                    ) : (
                                        <EditableAutocompleteCell
                                            value={vehicle.modelo}
                                            options={modeloOptions}
                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'modelo', newValue)}
                                            placeholder="Digite para buscar modelo..."
                                        />
                                    )}
                                </td>
                            )}
                            <td className={styles.tableCell}>
                                {isClientReadOnly ? (
                                    <HighlightText text={vehicle.transmissao} searchTerm={pendingSearchTerm} />
                                ) : (
                                    <EditableSelectCell
                                        value={vehicle.transmissao}
                                        options={transmissaoOptions}
                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'transmissao', newValue)}
                                        placeholder="Selecione"
                                    />
                                )}
                            </td>
                            <td className={styles.tableCell}>
                                {isClientReadOnly ? (
                                    <HighlightText text={vehicle.combustivel} searchTerm={pendingSearchTerm} />
                                ) : (
                                    <EditableSelectCell
                                        value={vehicle.combustivel}
                                        options={combustivelOptions}
                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'combustivel', newValue)}
                                        placeholder="Selecione"
                                    />
                                )}
                            </td>
                            <td className={styles.tableCell}>
                                {isClientReadOnly ? (
                                    <HighlightText text={vehicle.cor} searchTerm={pendingSearchTerm} />
                                ) : (
                                    <EditableTextCell
                                        value={vehicle.cor}
                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'cor', newValue)}
                                        placeholder="Cor"
                                    />
                                )}
                            </td>
                            <td className={styles.tableCell}>
                                {isClientReadOnly ? (
                                    <HighlightText text={vehicle.ano} searchTerm={pendingSearchTerm} />
                                ) : (
                                    <EditableYearCell
                                        value={vehicle.ano}
                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'ano', newValue)}
                                    />
                                )}
                            </td>
                            <td className={`${styles.tableCell} ${styles.colOpcionais}`}>
                                {isClientReadOnly ? (
                                    <HighlightText text={vehicle.opcionais} searchTerm={pendingSearchTerm} />
                                ) : (
                                    <EditableTextCell
                                        value={vehicle.opcionais}
                                        onSave={(newValue) => handleUpdateOpcionais(vehicle, newValue)}
                                        placeholder="Opcionais"
                                    />
                                )}
                            </td>
                            <td className={styles.tableCell}>
                                {isClientReadOnly ? (
                                    `R$ ${calculateClientPrice(vehicle).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                ) : (
                                    <EditableCurrencyCell
                                        value={vehicle.preco}
                                        onSave={(newValue) => handleUpdatePreco(vehicle, newValue)}
                                    />
                                )}
                            </td>
                            <td className={styles.tableCell}>
                                {isClientReadOnly ? (
                                    <span className={`${styles.statusBadge} ${getStatusColor(vehicle.status)}`}>
                                        {vehicle.status}
                                    </span>
                                ) : (
                                    <EditableSelectCell
                                        value={vehicle.status}
                                        options={statusOptions}
                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'status', newValue)}
                                        placeholder="Selecione"
                                    />
                                )}
                            </td>
                            {role !== 'dealership' && role !== 'gratis' && (
                                <td className={styles.tableCell}>
                                    {isClientReadOnly ? (
                                        <HighlightText text={vehicle.estado} searchTerm={pendingSearchTerm} />
                                    ) : (
                                        <EditableAutocompleteCell
                                            value={vehicle.estado}
                                            options={brazilStates}
                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'estado', newValue)}
                                            placeholder="Digite UF..."
                                        />
                                    )}
                                </td>
                            )}
                            <td className={styles.tableCell}>
                                {isClientReadOnly ? (
                                    <HighlightText text={vehicle.observacoes} searchTerm={pendingSearchTerm} />
                                ) : (
                                    <EditableTextCell
                                        value={vehicle.observacoes}
                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'observacoes', newValue)}
                                        placeholder="Observações"
                                    />
                                )}
                            </td>
                            {!['dealership', 'client', 'gratis'].includes(role || '') && (
                                <td className={styles.tableCell}>
                                    <EditableCurrencyCell
                                        value={vehicle.frete}
                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'frete', newValue ?? 0)}
                                    />
                                </td>
                            )}
                            {role !== 'client' && role !== 'gratis' && (
                                <td className={styles.tableCell}>
                                    {isClientReadOnly ? (
                                        <HighlightText text={vehicle.operador} searchTerm={pendingSearchTerm} />
                                    ) : (
                                        vehicle.operador || '-'
                                    )}
                                </td>
                            )}
                            
                            <td className={styles.tableCell} style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {vehicle.createdAt && (
                                        <span style={{ color: 'var(--color-text-muted)' }}>📅 {formatDate(vehicle.createdAt)}</span>
                                    )}
                                    {vehicle.updatedAt ? (() => {
                                        const days = calculateDaysSinceUpdate(vehicle.updatedAt);
                                        const color = getUpdateStatusColor(days);
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                                                <span>{formatDate(vehicle.updatedAt)}</span>
                                            </div>
                                        );
                                    })() : '—'}
                                </div>
                            </td>
                            {['admin', 'administrador', 'administrativo', 'gerente', 'operator', 'operador', 'dealership', 'client', 'gratis', 'vendedor'].includes(role || '') && (
                                <td className={styles.tableCell}>
                                    <div className={styles.actionButtons}>
                                        <span
                                            className={styles.locationButton}
                                            onClick={() => handleLocationClick(vehicle)}
                                            title={role === 'gratis' && localCredits === 0 ? 'Assine um plano para desbloquear' : 'Ver localização e contato'}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            📍
                                        </span>
                                        <span
                                            className={styles.whatsappButton}
                                            title="Contatar via WhatsApp"
                                            onClick={() => onWhatsApp(vehicle)}
                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#25D366' }}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <FaWhatsapp size={20} />
                                        </span>
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
