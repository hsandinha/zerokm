import React, { useState, useEffect } from 'react';
import styles from '../../app/dashboard/operator/operator.module.css';

export function VisaoGeralERelatoriosTab() {
    const [metrics, setMetrics] = useState({
        concessionariasAtivas: 0,
        veiculosEmEstoque: 0,
        veiculosVendidos: 0,
        metaMensal: '100%',
        desatualizadas: 0
    });

    useEffect(() => {
        fetch('/api/operator/metrics')
            .then(res => res.json())
            .then(data => {
                if (data && !data.error) {
                    setMetrics({
                        concessionariasAtivas: data.concessionariasAtivas || 0,
                        veiculosEmEstoque: data.veiculosEmEstoque || 0,
                        veiculosVendidos: data.veiculosVendidos || 0,
                        metaMensal: data.metaMensal || '100%',
                        desatualizadas: data.desatualizadas || 0
                    });
                }
            })
            .catch(console.error);
    }, []);

    return (
        <div className={styles.visaoGeralContainer} style={{ gridTemplateColumns: '1fr', maxWidth: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon}>🏢</div>
                        <div className={styles.statContent}>
                            <h3>Total de Lojas</h3>
                            <div className={styles.statNumber}>{metrics.concessionariasAtivas}</div>
                            <div className={styles.statChange}>Em sua carteira</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon}>🚗</div>
                        <div className={styles.statContent}>
                            <h3>Estoque Agregado</h3>
                            <div className={styles.statNumber}>{metrics.veiculosEmEstoque}</div>
                            <div className={styles.statChange}>Total de Veículos</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ color: '#f59e0b' }}>⏱️</div>
                        <div className={styles.statContent}>
                            <h3>Lojas Desatualizadas</h3>
                            <div className={styles.statNumber} style={{ color: '#f59e0b' }}>{metrics.desatualizadas}</div>
                            <div className={styles.statChange}>{'>'} 5 dias sem atualizar</div>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon}>✅</div>
                        <div className={styles.statContent}>
                            <h3>Vendas / Licenciados</h3>
                            <div className={styles.statNumber}>{metrics.veiculosVendidos}</div>
                            <div className={styles.statChange}>No período</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
