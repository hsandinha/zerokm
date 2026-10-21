import React, { useState } from 'react';
import { Bike, Car, ChevronRight, FileText, Heart, Images, MapPin, Truck } from 'lucide-react';
import { Vehicle } from '../../lib/services/vehicleService';
import { calculateDaysSinceUpdate, formatDate, getUpdateStatusColor } from '../../lib/utils/formatters';
import { FaWhatsapp } from 'react-icons/fa';
import { EditableCurrencyCell, EditableTextCell, EditableNumberCell } from './EditableCells';
import { formatKm } from '../../lib/utils/repasse';
import { abrirCotacaoDoVeiculo } from '../../lib/utils/cotacaoVeiculo';
import { TRANSPORTADORA_PARCEIRA, whatsappTransportadora } from '../../lib/utils/transportadora';
import styles from './VehicleConsultation.module.css';

export function getStatusColor(status: string | undefined) {
    switch (status?.toLowerCase()) {
        case 'a faturar':
            return styles.statusAvailable;
        case 'refaturamento':
            return styles.statusBlue;
        case 'licenciado':
            return styles.statusSold;
        case 'pedido de fábrica':
            return styles.statusReserved;
        // Repasse (lib/utils/repasse.ts)
        case 'disponível':
            return styles.statusAvailable;
        case 'reservado':
            return styles.statusReserved;
        default:
            return styles.statusDefault;
    }
}

interface VehiclePhotoProps {
    vehicle: Pick<Vehicle, 'modelo' | 'imagemUrl' | 'tipoVeiculo'>;
    className?: string;
}

/** Foto da variação (Catálogo). Sem foto, ou se ela não carregar, mostra um quadro neutro com ícone. */
export function VehiclePhoto({ vehicle, className = '' }: VehiclePhotoProps) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const url = vehicle.imagemUrl;
    const hasPhoto = Boolean(url) && failedUrl !== url;
    const Icon = vehicle.tipoVeiculo === 'moto' ? Bike : Car;

    if (!hasPhoto) {
        return (
            <div className={`${styles.photoPlaceholder} ${className}`} role="img" aria-label={`Sem foto do ${vehicle.modelo || 'veículo'}`}>
                <Icon size={22} aria-hidden="true" />
            </div>
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={url}
            alt={`Foto do ${vehicle.modelo || 'veículo'}`}
            loading="lazy"
            decoding="async"
            className={`${styles.photo} ${className}`}
            onError={() => setFailedUrl(url || null)}
        />
    );
}

interface FavoriteButtonProps {
    active: boolean;
    onToggle: () => void;
    className?: string;
}

/**
 * Coração de favoritos do cliente: favorita o veículo específico (esta oferta),
 * não o modelo. Não propaga o clique para a linha ou o card.
 */
export function FavoriteButton({ active, onToggle, className = '' }: FavoriteButtonProps) {
    const label = active ? 'Tirar este veículo dos favoritos' : 'Favoritar este veículo';
    return (
        <button
            type="button"
            className={`${styles.favButton} ${active ? styles.favButtonActive : ''} ${className}`}
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
        >
            <Heart size={18} aria-hidden="true" fill={active ? 'currentColor' : 'none'} />
        </button>
    );
}

interface VehicleCardProps {
    vehicle: Vehicle;
    margem: number;
    fixedMargin: number;
    marginMode: 'percent' | 'fixed';
    onWhatsApp: (vehicle: Vehicle) => void;
    /** Criar banner a partir do cartão. Só chega preenchido para quem administra. */
    onCreateBanner?: (vehicle: Vehicle) => void;
    onLocationClick: (vehicle: Vehicle) => void;
    role?: string;
    canViewLocation?: boolean;
    onUpdatePreco?: (vehicle: Vehicle, preco: number | undefined) => void;
    onUpdateObservacoes?: (vehicle: Vehicle, obs: string) => void;
    onUpdateQuantidade?: (vehicle: Vehicle, qtd: number | undefined) => void;
    isFavorite?: boolean;
    onToggleFavorite?: (vehicle: Vehicle) => void;
    /** Nome que sai no cabeçalho da cotação em PDF. */
    nomeCliente?: string;
    /** Frete da tabela por estado (mesma regra da tabela). */
    getFreteTabela?: (estado?: string) => { min: number; count: number } | null;
    onFreteTabelaClick?: (estado?: string) => void;
}

const brl = (valor: number) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function VehicleCard({ vehicle, margem, fixedMargin, marginMode, onWhatsApp, onCreateBanner, onLocationClick, role = 'operator', canViewLocation = false, onUpdatePreco, onUpdateObservacoes, onUpdateQuantidade, isFavorite = false, onToggleFavorite, nomeCliente, getFreteTabela, onFreteTabelaClick }: VehicleCardProps) {
    const isRepasse = vehicle.origem === 'repasse';
    // Usado se edita no painel Repasse da concessionária, não aqui.
    const canEditPriceAndNotes = !isRepasse && ['admin', 'administrador', 'administrativo', 'operator', 'operador', 'gerente'].includes(role || '');
    // Mesma regra da tabela: UF e frete interessam a quem compra. Concessionária e
    // teste grátis não veem (o grátis não pode ver o estado do veículo).
    const showUfAndFrete = role !== 'dealership' && role !== 'gratis';
    
    const calculateClientPrice = () => {
        const basePrice = vehicle.preco || 0;
        if (marginMode === 'fixed') {
            return basePrice + (fixedMargin || 0);
        }
        return basePrice * (1 + margem / 100);
    };

    return (
        <div className={styles.vehicleCard}>
            <div className={styles.cardMedia}>
                <VehiclePhoto vehicle={vehicle} className={styles.cardPhoto} />
                {onToggleFavorite && vehicle.marca && vehicle.modelo && (
                    <FavoriteButton
                        active={isFavorite}
                        onToggle={() => onToggleFavorite(vehicle)}
                        className={styles.cardFavButton}
                    />
                )}
            </div>
            <div className={styles.cardHeader}>
                <h4 className={styles.cardTitle}>
                    {vehicle.marca && <span className={styles.cardMarca}>{vehicle.marca}</span>}
                    {vehicle.novoFavorito && <span className={styles.novoFavoritoTag} title="Oferta nova desde a sua última visita">NOVO</span>}
                    {vehicle.favoritoAtualizado && <span className={styles.novoFavoritoTag} title="Preço, quantidade ou status mudou desde a sua última visita">ATUALIZADO</span>}
                    {isRepasse && <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em', padding: '1px 6px', borderRadius: 4, marginRight: 6, background: 'var(--color-highlight)', color: 'var(--color-text)', verticalAlign: 'middle' }}>REPASSE</span>}
                    {vehicle.modelo}
                </h4>
                <span className={`${styles.statusBadge} ${getStatusColor(vehicle.status)}`}>
                    {vehicle.status}
                </span>
            </div>

            {/* Preço e frete logo abaixo do título: é o que o lojista procura primeiro. */}
            <div className={styles.cardPriceTop}>
                <span className={styles.priceLabel}>Preço</span>
                <span className={styles.priceValue}>
                    {canEditPriceAndNotes && onUpdatePreco ? (
                        <EditableCurrencyCell
                            value={vehicle.preco}
                            onSave={(val) => onUpdatePreco(vehicle, val)}
                        />
                    ) : (
                        `R$ ${brl(role === 'client' ? calculateClientPrice() : (vehicle.preco || 0))}`
                    )}
                </span>
                {showUfAndFrete && (
                    <span className={styles.cardFrete}>
                        {vehicle.frete ? (
                            <>Frete R$ {brl(vehicle.frete)}</>
                        ) : (() => {
                            const tabela = getFreteTabela?.(vehicle.estado);
                            if (!tabela) return <span className={styles.freteVazio}>Frete sem tabela</span>;
                            return (
                                <button
                                    type="button"
                                    onClick={() => onFreteTabelaClick?.(vehicle.estado)}
                                    className={styles.freteTabela}
                                    title={`Ver as ${tabela.count} faixas de frete para ${vehicle.estado}`}
                                >
                                    Frete a partir de <span className={styles.freteTabelaValor}>R$ {brl(tabela.min)}</span>
                                    <ChevronRight size={12} aria-hidden="true" />
                                </button>
                            );
                        })()}
                    </span>
                )}
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
                {isRepasse && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>KM:</span>
                        <span className={styles.cardValue}>{formatKm(vehicle.km)}</span>
                    </div>
                )}
                {showUfAndFrete && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>UF:</span>
                        <span className={styles.cardValue}>{vehicle.estado}</span>
                    </div>
                )}
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
                {vehicle.opcionais && (
                    <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Opcionais:</span>
                        <span className={`${styles.cardValue} ${styles.cardOpcionais}`} title={vehicle.opcionais}>{vehicle.opcionais}</span>
                    </div>
                )}
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
                                <MapPin size={15} aria-hidden="true" /> Ver detalhes
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
                    <span className={styles.cardLabel}>Quantidade:</span>
                    <span className={styles.cardValue}>
                        {canEditPriceAndNotes && onUpdateQuantidade ? (
                            <EditableNumberCell
                                value={vehicle.quantidade ?? 0}
                                onSave={(val) => onUpdateQuantidade(vehicle, val)}
                            />
                        ) : (
                            vehicle.quantidade || 0
                        )}
                    </span>
                </div>
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
                {/* Observações sempre visíveis, como na tabela (vazio vira "-"). */}
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Observações:</span>
                    <span className={styles.cardValue}>
                        {canEditPriceAndNotes && onUpdateObservacoes ? (
                            <EditableTextCell
                                value={vehicle.observacoes}
                                onSave={(val) => onUpdateObservacoes(vehicle, val)}
                                placeholder="Observações"
                            />
                        ) : (
                            vehicle.observacoes || '-'
                        )}
                    </span>
                </div>
            </div>

            <div className={styles.cardFooter}>
                <div className={styles.cardActions}>
                    {/* Orçamento do frete com a transportadora parceira: recurso dos planos pagos. */}
                    {showUfAndFrete && (
                        <a
                            href={whatsappTransportadora(
                                [vehicle.marca, vehicle.modelo, vehicle.cor, vehicle.estado && `para ${vehicle.estado}`]
                                    .filter(Boolean).join(' ')
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.cardPdfButton}
                            title={`Orçamento de frete com a ${TRANSPORTADORA_PARCEIRA.nome} no WhatsApp`}
                        >
                            <Truck size={16} aria-hidden="true" /> Frete
                        </a>
                    )}
                    {onCreateBanner && (
                        <button
                            type="button"
                            className={styles.cardPdfButton}
                            title="Criar banner deste veículo"
                            aria-label="Criar banner deste veículo"
                            onClick={() => onCreateBanner(vehicle)}
                        >
                            <Images size={16} aria-hidden="true" /> Banner
                        </button>
                    )}
                    {role !== 'gratis' && (
                        <button
                            type="button"
                            className={styles.cardPdfButton}
                            title="Gerar cotação em PDF"
                            aria-label="Gerar cotação em PDF"
                            onClick={() => abrirCotacaoDoVeiculo(vehicle, calculateClientPrice(), nomeCliente)}
                        >
                            <FileText size={16} aria-hidden="true" /> PDF
                        </button>
                    )}
                    {role !== 'gratis' && (
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
                    )}
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
    /** Criar banner a partir do cartão. Só chega preenchido para quem administra. */
    onCreateBanner?: (vehicle: Vehicle) => void;
    onLocationClick: (vehicle: Vehicle) => void;
    role?: string;
    canViewLocation?: boolean;
    onUpdatePreco?: (vehicle: Vehicle, preco: number | undefined) => void;
    onUpdateObservacoes?: (vehicle: Vehicle, obs: string) => void;
    onUpdateQuantidade?: (vehicle: Vehicle, qtd: number | undefined) => void;
    isFavorite?: (vehicle: Vehicle) => boolean;
    onToggleFavorite?: (vehicle: Vehicle) => void;
    nomeCliente?: string;
    getFreteTabela?: (estado?: string) => { min: number; count: number } | null;
    onFreteTabelaClick?: (estado?: string) => void;
}

export function VehicleGrid({ vehicles, margem, fixedMargin, marginMode, onWhatsApp, onCreateBanner, onLocationClick, role, canViewLocation, onUpdatePreco, onUpdateObservacoes, onUpdateQuantidade, isFavorite, onToggleFavorite, nomeCliente, getFreteTabela, onFreteTabelaClick }: VehicleGridProps) {
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
                        onCreateBanner={onCreateBanner}
                        onLocationClick={onLocationClick}
                        role={role}
                        canViewLocation={canViewLocation}
                        onUpdatePreco={onUpdatePreco}
                        onUpdateObservacoes={onUpdateObservacoes}
                        onUpdateQuantidade={onUpdateQuantidade}
                        isFavorite={Boolean(isFavorite?.(vehicle))}
                        onToggleFavorite={onToggleFavorite}
                        nomeCliente={nomeCliente}
                        getFreteTabela={getFreteTabela}
                        onFreteTabelaClick={onFreteTabelaClick}
                    />
                ))
            )}
        </div>
    );
}
