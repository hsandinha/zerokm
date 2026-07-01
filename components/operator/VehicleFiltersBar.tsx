import React from 'react';
import styles from './VehicleConsultation.module.css';

interface VehicleFiltersBarProps {
    pendingSearchTerm: string;
    setPendingSearchTerm: (value: string) => void;
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    filters: any;
    setFilters: (filters: any) => void;
    clearFilters: () => void;
    prefixWarnings: string[];
    setPrefixWarnings: (warnings: string[]) => void;
    setCurrentPage: (page: number) => void;
    totalItems: number;
}

export function VehicleFiltersBar({
    pendingSearchTerm,
    setPendingSearchTerm,
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    clearFilters,
    prefixWarnings,
    setPrefixWarnings,
    setCurrentPage,
    totalItems
}: VehicleFiltersBarProps) {
    return (
        <div className={styles.searchSection}>
            <div className={styles.searchContainer}>
                <input
                    type="text"
                    placeholder="Digite para pesquisar (ex: argo, combustivel:diesel, transmissao:manual, cor:preto, ano:2024)"
                    value={pendingSearchTerm}
                    onChange={(e) => {
                        const value = e.target.value;
                        setPendingSearchTerm(value);
                        if (value === '') {
                            setSearchTerm('');
                            setPrefixWarnings([]);
                        }
                    }}
                    className={styles.searchInput}
                />
                <button onClick={clearFilters} className={styles.clearButton}>
                    Limpar filtros
                </button>
            </div>

            <div className={styles.searchInfo}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', width: '100%' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                        {searchTerm && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Busca: {searchTerm}
                                <button onClick={() => { setSearchTerm(''); setPendingSearchTerm(''); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.modelo && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Modelo: {filters.modelo}
                                <button onClick={() => { setFilters((prev: any) => ({ ...prev, modelo: '' })); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.combustivel && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Combustível: {filters.combustivel}
                                <button onClick={() => { setFilters({ ...filters, combustivel: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.transmissao && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Transmissão: {filters.transmissao}
                                <button onClick={() => { setFilters({ ...filters, transmissao: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.cor && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Cor: {filters.cor}
                                <button onClick={() => { setFilters({ ...filters, cor: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.ano && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Ano: {filters.ano}
                                <button onClick={() => { setFilters({ ...filters, ano: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.status && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Status: {filters.status}
                                <button onClick={() => { setFilters({ ...filters, status: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.estado && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                UF: {filters.estado}
                                <button onClick={() => { setFilters({ ...filters, estado: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.operador && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Operador: {filters.operador}
                                <button onClick={() => { setFilters({ ...filters, operador: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.cidade && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Cidade: {filters.cidade}
                                <button onClick={() => { setFilters({ ...filters, cidade: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.concessionaria && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Concessionária: {filters.concessionaria}
                                <button onClick={() => { setFilters({ ...filters, concessionaria: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.nomeContato && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Contato: {filters.nomeContato}
                                <button onClick={() => { setFilters({ ...filters, nomeContato: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                        {filters.opcionais && (
                            <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                Opcionais: {filters.opcionais}
                                <button onClick={() => { setFilters((prev: any) => ({ ...prev, opcionais: '' })); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                            </span>
                        )}
                    </div>

                    <h3 style={{ margin: 0, marginLeft: 'auto' }}>Veículos Disponíveis ({totalItems})</h3>
                </div>

                {prefixWarnings.length > 0 && (
                    <div style={{ marginTop: '6px', color: '#a66', fontSize: '0.85rem' }}>
                        {prefixWarnings.map((w, i) => (<div key={i}>⚠️ {w}</div>))}
                    </div>
                )}
            </div>
        </div>
    );
}
