'use client';

import { useState, useEffect } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import styles from './StockReminderModal.module.css';

const STORAGE_KEY = 'zerokm-stock-reminder-last-shown';

interface StatusBreakdown {
    verde: number;
    amarelo: number;
    vermelho: number;
}

interface ReminderMetrics {
    veiculosCadastrados: number;
    daysSinceUpdate: number;
    statusBreakdown?: StatusBreakdown;
}

interface StockReminderModalProps {
    onUpdateStock: () => void;
}

export function StockReminderModal({ onUpdateStock }: StockReminderModalProps) {
    const [metrics, setMetrics] = useState<ReminderMetrics | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const today = new Date().toLocaleDateString('en-CA');
        if (localStorage.getItem(STORAGE_KEY) === today) return;

        let cancelled = false;
        fetch('/api/dealership/metrics')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled || !data) return;
                setMetrics(data);
                setVisible(true);
                localStorage.setItem(STORAGE_KEY, today);
            })
            .catch(() => { });

        return () => { cancelled = true; };
    }, []);

    if (!visible || !metrics) return null;

    const breakdown: StatusBreakdown = metrics.statusBreakdown || { verde: 0, amarelo: 0, vermelho: 0 };
    const daysSinceUpdate = metrics.daysSinceUpdate;

    let statusColor: 'green' | 'yellow' | 'red' = 'green';
    let statusMessage = 'Seu estoque está em dia. Continue assim!';
    if (daysSinceUpdate > 1) {
        statusColor = 'yellow';
        statusMessage = 'Atenção: seu estoque não é atualizado há mais de 1 dia.';
    }
    if (daysSinceUpdate > 3) {
        statusColor = 'red';
        statusMessage = 'Crítico: seu estoque está desatualizado há mais de 3 dias.';
    }
    if (metrics.veiculosCadastrados === 0) {
        statusColor = 'red';
        statusMessage = 'Você ainda não tem veículos com preço ativo. Cadastre seu estoque.';
    }

    const lastUpdateLabel = daysSinceUpdate === 0 ? 'Hoje' : `${daysSinceUpdate} dia(s) atrás`;

    const handleClose = () => setVisible(false);

    const handleUpdateStock = () => {
        setVisible(false);
        onUpdateStock();
    };

    return (
        <AdminModal
            title="Lembrete diário"
            subtitle="Mantenha seu estoque atualizado para aparecer nas consultas."
            onClose={handleClose}
            size="md"
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={handleClose}>Deixar para depois</button>
                <button type="button" className={modalStyles.primary} onClick={handleUpdateStock}>Atualizar estoque agora</button>
            </>}
        >
            <div className={modalStyles.stack}>
                <div className={styles.statusRow}>
                    <div className={`${styles.trafficLight} ${styles[statusColor]}`} aria-hidden="true"></div>
                    <div className={styles.statusInfo}>
                        <span className={styles.statusLabel}>Última atualização: <strong>{lastUpdateLabel}</strong></span>
                        <span className={`${styles.statusMessage} ${styles[`msg_${statusColor}`]}`}>{statusMessage}</span>
                    </div>
                </div>

                <section>
                    <h3 className={styles.breakdownTitle}>Gestão do estoque por status</h3>
                    <div className={styles.breakdownGrid}>
                        <div className={`${styles.breakdownCard} ${styles.cardGreen}`}>
                            <span className={styles.breakdownCount}>{breakdown.verde}</span>
                            <span className={styles.breakdownLabel}>Em dia</span>
                            <span className={styles.breakdownHint}>atualizados há até 1 dia</span>
                        </div>
                        <div className={`${styles.breakdownCard} ${styles.cardYellow}`}>
                            <span className={styles.breakdownCount}>{breakdown.amarelo}</span>
                            <span className={styles.breakdownLabel}>Atenção</span>
                            <span className={styles.breakdownHint}>2 a 3 dias sem atualização</span>
                        </div>
                        <div className={`${styles.breakdownCard} ${styles.cardRed}`}>
                            <span className={styles.breakdownCount}>{breakdown.vermelho}</span>
                            <span className={styles.breakdownLabel}>Desatualizados</span>
                            <span className={styles.breakdownHint}>mais de 3 dias sem atualização</span>
                        </div>
                    </div>
                </section>
            </div>
        </AdminModal>
    );
}
