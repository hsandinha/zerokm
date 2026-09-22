'use client';

import { useState, useEffect } from 'react';
import { Concessionaria } from '../../lib/services/concessionariaService';
import { DealerInventory } from '../dealership/DealerInventory';
import styles from './AdminDealershipVehicles.module.css';

export function AdminDealershipVehicles() {
    const [concessionarias, setConcessionarias] = useState<Concessionaria[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchConcessionarias = async () => {
            try {
                const res = await fetch('/api/concessionarias');
                if (res.ok) {
                    const data = await res.json();
                    setConcessionarias(data);
                }
            } catch (err) {
                console.error('Erro ao buscar concessionárias:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchConcessionarias();
    }, []);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Gestão de Veículos das Concessionárias</h2>
                <p>Selecione uma concessionária para gerenciar o catálogo 0KM e os veículos de repasse.</p>
                
                <div className={styles.selectWrapper}>
                    <select
                        className={styles.select}
                        value={selectedId}
                        onChange={(e) => setSelectedId(e.target.value)}
                        disabled={loading}
                    >
                        <option value="">Selecione uma concessionária...</option>
                        {concessionarias.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nome} {c.marca ? `(${c.marca})` : ''} - {c.cidade}/{c.uf} ({c.totalAtivos || 0} ativos)
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedId ? (
                <div className={styles.catalogWrapper}>
                    <DealerInventory key={selectedId} concessionariaId={selectedId} />
                </div>
            ) : (
                <div className={styles.emptyState}>
                    Nenhuma concessionária selecionada.
                </div>
            )}
        </div>
    );
}
