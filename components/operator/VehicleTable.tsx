import React from 'react';
import { CalendarDays, ChevronRight, FileText, MapPin, Truck, UserRound } from 'lucide-react';
import { Vehicle } from '../../lib/services/vehicleService';
import { calculateDaysSinceUpdate, formatDate, getUpdateStatusColor } from '../../lib/utils/formatters';
import { HighlightText } from '../HighlightText';
import { FavoriteButton, VehiclePhoto, getStatusColor } from './VehicleGrid';
import { EditableTextCell, EditableSelectCell, EditableAutocompleteCell, EditableYearCell, EditableCurrencyCell, EditableNumberCell, EditablePrazoCell } from './EditableCells';
import { formatPrazo } from '../../lib/utils/prazo';
import { formatKm } from '../../lib/utils/repasse';
import { FaWhatsapp } from 'react-icons/fa';
import { TRANSPORTADORA_PARCEIRA, whatsappTransportadora } from '../../lib/utils/transportadora';
import { abrirCotacaoDoVeiculo } from '../../lib/utils/cotacaoVeiculo';
import styles from './VehicleConsultation.module.css';

type SortKey = keyof Vehicle | 'updatedAt';

interface VehicleTableProps {
    vehicles: Vehicle[];
    selectedIds: string[];
    /** Mantido por compatibilidade: a coluna Veículo aparece mesmo com modelo selecionado (mostra a foto). */
    selectedModel: string | null;
    isClientReadOnly: boolean;
    sortConfig: { key: SortKey; direction: 'asc' | 'desc' };
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
    handleSort: (key: SortKey) => void;
    handleSelectOne: (id: string) => void;
    handleUpdateVehicleField: (vehicle: Vehicle, field: keyof Vehicle, newValue: any) => void;
    handleUpdateOpcionais: (vehicle: Vehicle, newValue: string) => void;
    handleUpdatePreco: (vehicle: Vehicle, newValue: number | undefined) => void;
    handleLocationClick: (vehicle: Vehicle) => void;
    onWhatsApp: (vehicle: Vehicle) => void;
    getFreteTabela?: (estado?: string) => { min: number; count: number } | null;
    onFreteTabelaClick?: (estado?: string) => void;
    nomeCliente?: string;
    /** Mostra "0 km" nos 0KM quando a lista mistura novos e repasse (segmentos Todos e Repasse). */
    showKm?: boolean;
    /** Favoritos do cliente: com `onToggleFavorite`, cada linha ganha o coração. */
    isFavorite?: (vehicle: Vehicle) => boolean;
    onToggleFavorite?: (vehicle: Vehicle) => void;
}

const ACTION_ROLES = ['admin', 'administrador', 'administrativo', 'gerente', 'operator', 'operador', 'dealership', 'client', 'gratis', 'vendedor'];
const EDIT_ROLES = ['admin', 'administrador', 'administrativo', 'operator', 'operador', 'gerente'];

const formatBRL = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export function VehicleTable({
    vehicles,
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
    handleSort,
    handleUpdateVehicleField,
    handleUpdateOpcionais,
    handleUpdatePreco,
    handleLocationClick,
    onWhatsApp,
    getFreteTabela,
    onFreteTabelaClick,
    nomeCliente,
    showKm = false,
    isFavorite,
    onToggleFavorite,
}: VehicleTableProps) {
    const canEditPriceAndNotes = EDIT_ROLES.includes(role || '');
    // UF e frete: interessam a quem compra. Concessionária e teste grátis não veem.
    const showUfAndFrete = role !== 'dealership' && role !== 'gratis';
    const showOperador = role !== 'client' && role !== 'gratis';
    const showRowActions = ACTION_ROLES.includes(role || '');

    const calculateClientPrice = (vehicle: Vehicle) => {
        const basePrice = vehicle.preco || 0;
        if (marginMode === 'fixed') {
            return basePrice + (fixedMargin || 0);
        }
        return basePrice * (1 + margem / 100);
    };

    const sortableHeader = (key: SortKey, label: string, extraClass = '') => (
        <th
            className={`${styles.tableHeader} ${extraClass}`}
            onClick={() => handleSort(key)}
            style={{ cursor: 'pointer' }}
            aria-sort={sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : undefined}
        >
            {label} {sortConfig.key === key && (sortConfig.direction === 'asc' ? '▲' : '▼')}
        </th>
    );

    return (
        <div className={styles.tableContainer}>
            <table className={`${styles.table} ${styles.vehicleTable}`}>
                <thead>
                    <tr>
                        {sortableHeader('modelo', 'Veículo', styles.colVeiculo)}
                        {sortableHeader('ano', 'Ano / cor')}
                        {sortableHeader('status', 'Disponibilidade')}
                        {sortableHeader('preco', 'Preço', styles.priceCell)}
                        {showUfAndFrete && sortableHeader('estado', 'UF')}
                        {sortableHeader('observacoes', 'Observações', styles.colObs)}
                        {sortableHeader('updatedAt', 'Atualização')}
                        <th className={`${styles.tableHeader} ${styles.colAcoes}`}>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {vehicles.map((vehicle) => {
                        // Usado se edita no painel Repasse da concessionária; a edição
                        // inline daqui grava na tabela de preços 0KM e não o acharia.
                        const isRepasse = vehicle.origem === 'repasse';
                        const rowReadOnly = isClientReadOnly || isRepasse;
                        const rowCanEdit = canEditPriceAndNotes && !isRepasse;
                        const numbersReadOnly = rowReadOnly && !rowCanEdit;
                        const favorito = Boolean(isFavorite?.(vehicle));

                        return (
                        <tr key={vehicle.id} className={styles.tableRow}>
                            {/* Veículo: foto, marca, modelo, transmissão · combustível e opcionais */}
                            <td className={`${styles.tableCell} ${styles.colVeiculo}`}>
                                <div className={styles.vehCell}>
                                    <VehiclePhoto vehicle={vehicle} className={styles.vehThumb} />
                                    <div className={styles.vehInfo}>
                                        <div className={styles.vehTitleLine}>
                                            {vehicle.novoFavorito && <span className={`${styles.tipoBadge} ${styles.tipoBadgeNovo}`} title="Oferta nova desde a sua última visita">NOVO</span>}
                                            {isRepasse && <span className={`${styles.tipoBadge} ${styles.tipoBadgeRepasse}`} title="Usado de repasse">REPASSE</span>}
                                            {vehicle.tipoVeiculo === 'moto' && <span className={styles.tipoBadge} title={isRepasse ? 'Moto' : 'Moto 0KM'}>MOTO</span>}
                                            {vehicle.marca && (
                                                <span className={styles.vehMarca}>
                                                    <HighlightText text={vehicle.marca} searchTerm={pendingSearchTerm} />
                                                </span>
                                            )}
                                        </div>
                                        <div className={styles.vehModelo}>
                                            {rowReadOnly ? (
                                                <HighlightText text={vehicle.modelo} searchTerm={pendingSearchTerm} />
                                            ) : (
                                                <EditableAutocompleteCell
                                                    value={vehicle.modelo}
                                                    options={modeloOptions}
                                                    onSave={(newValue) => handleUpdateVehicleField(vehicle, 'modelo', newValue)}
                                                    placeholder="Digite para buscar modelo..."
                                                />
                                            )}
                                        </div>
                                        <div className={`${styles.cellMuted} ${styles.inlineEdits}`}>
                                            {rowReadOnly ? (
                                                <>
                                                    <span title="Transmissão"><HighlightText text={vehicle.transmissao} searchTerm={pendingSearchTerm} /></span>
                                                    <span className={styles.cellSep} aria-hidden="true">·</span>
                                                    <span title="Combustível"><HighlightText text={vehicle.combustivel} searchTerm={pendingSearchTerm} /></span>
                                                </>
                                            ) : (
                                                <>
                                                    <EditableSelectCell
                                                        value={vehicle.transmissao}
                                                        options={transmissaoOptions}
                                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'transmissao', newValue)}
                                                        placeholder="Transmissão"
                                                    />
                                                    <span className={styles.cellSep} aria-hidden="true">·</span>
                                                    <EditableSelectCell
                                                        value={vehicle.combustivel}
                                                        options={combustivelOptions}
                                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'combustivel', newValue)}
                                                        placeholder="Combustível"
                                                    />
                                                </>
                                            )}
                                        </div>
                                        <div className={`${styles.cellMuted} ${styles.vehOpcionais}`} title={vehicle.opcionais || undefined}>
                                            {rowReadOnly ? (
                                                <HighlightText text={vehicle.opcionais} searchTerm={pendingSearchTerm} />
                                            ) : (
                                                <EditableTextCell
                                                    value={vehicle.opcionais}
                                                    onSave={(newValue) => handleUpdateOpcionais(vehicle, newValue)}
                                                    placeholder="Opcionais"
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </td>

                            {/* Ano / cor (+ km) */}
                            <td className={styles.tableCell}>
                                <div className={styles.cellStack}>
                                    <div className={styles.cellMain}>
                                        {rowReadOnly ? (
                                            <HighlightText text={vehicle.ano} searchTerm={pendingSearchTerm} />
                                        ) : (
                                            <EditableYearCell
                                                value={vehicle.ano}
                                                onSave={(newValue) => handleUpdateVehicleField(vehicle, 'ano', newValue)}
                                            />
                                        )}
                                    </div>
                                    <div className={styles.cellMuted}>
                                        {rowReadOnly ? (
                                            <HighlightText text={vehicle.cor} searchTerm={pendingSearchTerm} />
                                        ) : (
                                            <EditableTextCell
                                                value={vehicle.cor}
                                                onSave={(newValue) => handleUpdateVehicleField(vehicle, 'cor', newValue)}
                                                placeholder="Cor"
                                            />
                                        )}
                                    </div>
                                    {(isRepasse || showKm) && (
                                        <div className={styles.cellSmall}>{isRepasse ? formatKm(vehicle.km) : '0 km'}</div>
                                    )}
                                </div>
                            </td>

                            {/* Disponibilidade: status, prazo e quantidade */}
                            <td className={styles.tableCell}>
                                <div className={styles.cellStack}>
                                    <div>
                                        {rowReadOnly ? (
                                            <span className={`${styles.statusBadge} ${styles.statusBadgeInline} ${getStatusColor(vehicle.status)}`}>
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
                                    </div>
                                    <div className={`${styles.cellMuted} ${styles.inlineEdits}`}>
                                        {numbersReadOnly ? (
                                            <span>{vehicle.prazo === 0 ? formatPrazo(vehicle.prazo) : `Prazo ${formatPrazo(vehicle.prazo)}`}</span>
                                        ) : (
                                            <>
                                                <span className={styles.cellLabel}>Prazo</span>
                                                <EditablePrazoCell
                                                    value={vehicle.prazo}
                                                    onSave={(newValue) => handleUpdateVehicleField(vehicle, 'prazo', newValue)}
                                                />
                                            </>
                                        )}
                                        <span className={styles.cellSep} aria-hidden="true">·</span>
                                        <span className={styles.cellLabel}>Qtd</span>
                                        {numbersReadOnly ? (
                                            <span>{vehicle.quantidade || 0}</span>
                                        ) : (
                                            <EditableNumberCell
                                                value={vehicle.quantidade ?? 0}
                                                onSave={(newValue) => handleUpdateVehicleField(vehicle, 'quantidade', newValue ?? 0)}
                                            />
                                        )}
                                    </div>
                                </div>
                            </td>

                            {/* Preço (+ frete para quem vê frete) */}
                            <td className={`${styles.tableCell} ${styles.priceCell}`}>
                                <div className={`${styles.cellStack} ${styles.cellStackEnd}`}>
                                    <div className={styles.cellMain}>
                                        {numbersReadOnly ? (
                                            `R$ ${formatBRL(calculateClientPrice(vehicle))}`
                                        ) : (
                                            <EditableCurrencyCell
                                                value={vehicle.preco}
                                                onSave={(newValue) => handleUpdatePreco(vehicle, newValue)}
                                            />
                                        )}
                                    </div>
                                    {showUfAndFrete && (
                                        <div className={`${styles.cellMuted} ${styles.inlineEdits}`}>
                                            {/* Sem frete próprio no anúncio, mostra o valor da tabela do
                                                estado, nunca R$ 0,00 (sugeria frete grátis). É "a partir de"
                                                porque cada estado tem faixas (porte, capital/interior) e o
                                                veículo não guarda o porte; o clique abre todas as opções. */}
                                            {vehicle.frete ? (
                                                rowCanEdit ? (
                                                    <>
                                                        <span className={styles.cellLabel}>Frete</span>
                                                        <EditableCurrencyCell
                                                            value={vehicle.frete}
                                                            onSave={(newValue) => handleUpdateVehicleField(vehicle, 'frete', newValue ?? 0)}
                                                        />
                                                    </>
                                                ) : (
                                                    <span>Frete R$ {formatBRL(vehicle.frete)}</span>
                                                )
                                            ) : (() => {
                                                const tabela = getFreteTabela?.(vehicle.estado);
                                                if (!tabela) return <span className={styles.freteVazio}>Frete sem tabela</span>;
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); onFreteTabelaClick?.(vehicle.estado); }}
                                                        className={styles.freteTabela}
                                                        title={`Ver as ${tabela.count} faixas de frete para ${vehicle.estado}`}
                                                    >
                                                        Frete a partir de{' '}
                                                        <span className={styles.freteTabelaValor}>R$ {formatBRL(tabela.min)}</span>
                                                        <ChevronRight size={12} aria-hidden="true" />
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </td>

                            {/* UF (+ cidade) */}
                            {showUfAndFrete && (
                                <td className={styles.tableCell}>
                                    <div className={styles.cellStack}>
                                        <div className={styles.cellMain}>
                                            {rowReadOnly ? (
                                                <HighlightText text={vehicle.estado} searchTerm={pendingSearchTerm} />
                                            ) : (
                                                <EditableAutocompleteCell
                                                    value={vehicle.estado}
                                                    options={brazilStates}
                                                    onSave={(newValue) => handleUpdateVehicleField(vehicle, 'estado', newValue)}
                                                    placeholder="Digite UF..."
                                                />
                                            )}
                                        </div>
                                        {vehicle.cidade && (
                                            <div className={styles.cellMuted}>
                                                <HighlightText text={vehicle.cidade} searchTerm={pendingSearchTerm} />
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* Observações */}
                            <td className={`${styles.tableCell} ${styles.colObs}`}>
                                {numbersReadOnly ? (
                                    <div className={styles.obsText} title={vehicle.observacoes || undefined}>
                                        <HighlightText text={vehicle.observacoes} searchTerm={pendingSearchTerm} />
                                    </div>
                                ) : (
                                    <EditableTextCell
                                        value={vehicle.observacoes}
                                        onSave={(newValue) => handleUpdateVehicleField(vehicle, 'observacoes', newValue)}
                                        placeholder="Observações"
                                    />
                                )}
                            </td>

                            {/* Atualização: entrada, última atualização e operador */}
                            <td className={styles.tableCell}>
                                <div className={`${styles.cellStack} ${styles.cellSmall}`}>
                                    {vehicle.createdAt && (
                                        <span className={styles.dateLine} title="Data de entrada">
                                            <CalendarDays size={13} aria-hidden="true" />
                                            {formatDate(vehicle.createdAt)}
                                        </span>
                                    )}
                                    {vehicle.updatedAt ? (() => {
                                        const days = calculateDaysSinceUpdate(vehicle.updatedAt);
                                        const color = getUpdateStatusColor(days);
                                        return (
                                            <span className={styles.dateLine} title={`Atualizado há ${days} dia${days === 1 ? '' : 's'}`}>
                                                <span className={styles.freshDot} style={{ backgroundColor: color }} aria-hidden="true" />
                                                {formatDate(vehicle.updatedAt)}
                                            </span>
                                        );
                                    })() : <span>-</span>}
                                    {showOperador && (
                                        <span className={styles.dateLine} title="Operador">
                                            <UserRound size={13} aria-hidden="true" />
                                            {rowReadOnly ? (
                                                <HighlightText text={vehicle.operador || '-'} searchTerm={pendingSearchTerm} />
                                            ) : (
                                                vehicle.operador || '-'
                                            )}
                                        </span>
                                    )}
                                </div>
                            </td>

                            {/* Ações: fixa na borda direita, sempre visível mesmo com rolagem horizontal. */}
                            <td className={`${styles.tableCell} ${styles.colAcoes}`}>
                                <div className={styles.rowActions}>
                                    {showRowActions && (
                                        <button
                                            type="button"
                                            className={styles.rowActionButton}
                                            onClick={(e) => { e.stopPropagation(); handleLocationClick(vehicle); }}
                                            title={role === 'gratis' && localCredits === 0 ? 'Assine um plano para desbloquear' : 'Ver localização e contato'}
                                            aria-label={role === 'gratis' && localCredits === 0 ? 'Assine um plano para desbloquear' : 'Ver localização e contato'}
                                        >
                                            <MapPin size={18} aria-hidden="true" />
                                        </button>
                                    )}
                                    {showRowActions && role !== 'gratis' && (
                                        <button
                                            type="button"
                                            className={styles.rowActionButton}
                                            title="Gerar cotação em PDF"
                                            aria-label="Gerar cotação em PDF"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // Mesmo preço que este perfil enxerga na tela.
                                                abrirCotacaoDoVeiculo(vehicle, calculateClientPrice(vehicle), nomeCliente);
                                            }}
                                        >
                                            <FileText size={18} aria-hidden="true" />
                                        </button>
                                    )}
                                    {showRowActions && role !== 'gratis' && (
                                        <button
                                            type="button"
                                            className={`${styles.rowActionButton} ${styles.rowActionWhatsapp}`}
                                            title="Contatar via WhatsApp"
                                            aria-label="Contatar via WhatsApp"
                                            onClick={(e) => { e.stopPropagation(); onWhatsApp(vehicle); }}
                                        >
                                            <FaWhatsapp size={18} aria-hidden="true" />
                                        </button>
                                    )}
                                    {/* Cotação de frete com a transportadora: recurso dos planos pagos. */}
                                    {role !== 'gratis' && (
                                    <a
                                        href={whatsappTransportadora(
                                            [vehicle.marca, vehicle.modelo, vehicle.cor, vehicle.estado && `para ${vehicle.estado}`]
                                                .filter(Boolean).join(' ')
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`${styles.rowActionButton} ${styles.rowActionTransportadora}`}
                                        title={`Falar com a ${TRANSPORTADORA_PARCEIRA.nome} no WhatsApp`}
                                        aria-label={`Falar com a ${TRANSPORTADORA_PARCEIRA.nome} no WhatsApp`}
                                        onClick={event => event.stopPropagation()}
                                    >
                                        <Truck size={18} aria-hidden="true" />
                                    </a>
                                    )}
                                    {onToggleFavorite && vehicle.marca && vehicle.modelo && (
                                        <FavoriteButton
                                            active={favorito}
                                            onToggle={() => onToggleFavorite(vehicle)}
                                        />
                                    )}
                                </div>
                            </td>
                        </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
