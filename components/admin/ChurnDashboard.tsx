'use client';

import { useState, useEffect } from 'react';
import styles from './ChurnDashboard.module.css';

export function ChurnDashboard() {
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/metrics/churn')
            .then(res => res.json())
            .then(data => {
                if (!data.error) {
                    setMetrics(data);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <p className={styles.loading}>Carregando cockpit financeiro...</p>;
    if (!metrics) return null;

    const { globalValues, operatorRanking } = metrics;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    return (
        <div className={styles.churnContainer}>
            <div className={styles.header}>
                <h2>Cockpit de Gestão à Vista (Prevenção de Churn)</h2>
                <p>Monitoramento financeiro de assinaturas em tempo real</p>
            </div>

            <div className={styles.globalKPIs}>
                <div className={`${styles.kpiCard} ${styles.kpiGreen}`}>
                    <div className={styles.kpiIcon}>✅</div>
                    <div className={styles.kpiInfo}>
                        <h4>Receita Saudável / Cativa</h4>
                        <h2>{formatCurrency(globalValues.receitaCativa)}</h2>
                        <span>{globalValues.totalAtivos} Clientes Pagantes Ativos</span>
                    </div>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiYellow}`}>
                    <div className={styles.kpiIcon}>⚠️</div>
                    <div className={styles.kpiInfo}>
                        <h4>Receita em Risco (Vencendo)</h4>
                        <h2>{formatCurrency(globalValues.receitaRisco)}</h2>
                        <span>{globalValues.totalRisco} Clientes no Radar (5 dias)</span>
                    </div>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiRed}`}>
                    <div className={styles.kpiIcon}>🚨</div>
                    <div className={styles.kpiInfo}>
                        <h4>Receita Bloqueada / Perdida</h4>
                        <h2>{formatCurrency(globalValues.receitaPerdida)}</h2>
                        <span>{globalValues.totalBloqueados} Clientes Inadimplentes</span>
                    </div>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiPurple}`}>
                    <div className={styles.kpiIcon}>🎁</div>
                    <div className={styles.kpiInfo}>
                        <h4>Cortesia / Bundled</h4>
                        <h2>{(globalValues.totalCortesia ?? 0) + (globalValues.totalInvitees ?? 0)}</h2>
                        <span>
                            {globalValues.totalCortesia ?? 0} cortesia · {globalValues.totalInvitees ?? 0} convidados
                            {' '}— não contabilizados na receita
                        </span>
                    </div>
                </div>
            </div>

            <div className={styles.rankingSection}>
                <h3>Ranking de Saúde por Operador (Gamificação)</h3>
                <div className={styles.tableWrapper}>
                    <table className={styles.rankingTable}>
                        <thead>
                            <tr>
                                <th>Operador / Vendedor</th>
                                <th>Receita Sob Gestão</th>
                                <th className={styles.cellGreen}>Planos Saudáveis</th>
                                <th className={styles.cellYellow}>Planos em Risco (Ação)</th>
                                <th className={styles.cellRed}>Planos Inadimplentes</th>
                                <th className={styles.cellPurple}>Cortesias</th>
                            </tr>
                        </thead>
                        <tbody>
                            {operatorRanking.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '1rem' }}>Sem dados de operadores.</td>
                                </tr>
                            )}
                            {operatorRanking.map((op: any, i: number) => (
                                <tr key={i}>
                                    <td><strong>{op.nome}</strong></td>
                                    <td>{formatCurrency(op.receitaGerida)}</td>
                                    <td className={styles.cellGreen}><strong>{op.verde}</strong> lojas</td>
                                    <td className={styles.cellYellow}><strong>{op.amarelo}</strong> lojas</td>
                                    <td className={styles.cellRed}><strong>{op.vermelho}</strong> lojas</td>
                                    <td className={styles.cellPurple}><strong>{op.cortesia ?? 0}</strong> lojas</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
