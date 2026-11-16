'use client';

import { useState, useEffect } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
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
    /** Leva à aba de preços, para a loja corrigir valores antes de confirmar. */
    onUpdateStock: () => void;
    /** Estoque confirmado: quem mostra indicadores busca de novo. */
    onConfirmado?: () => void;
}

/**
 * Confirma o estoque no servidor: todos os anúncios ativos da loja recebem a
 * data de hoje. É isso que faz o lojista ver os carros como atualizados; só
 * abrir a aba de preços não muda nada.
 */
export async function confirmarEstoqueDaLoja(): Promise<{ total: number }> {
    const res = await fetch('/api/dealership/estoque/confirmar', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível confirmar o estoque. Tente de novo.');
    return { total: Number(data.total) || 0 };
}

/** Lê o localStorage sem quebrar em aba anônima ou com armazenamento bloqueado. */
function lerLembrete(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function gravarLembrete(valor: string) {
    try { localStorage.setItem(STORAGE_KEY, valor); } catch { /* sem armazenamento: mostra de novo amanhã */ }
}

export function StockReminderModal({ onUpdateStock, onConfirmado }: StockReminderModalProps) {
    const [metrics, setMetrics] = useState<ReminderMetrics | null>(null);
    const [visible, setVisible] = useState(false);
    // Prazo de Configurações: a partir dele o estoque conta como desatualizado.
    const [limite, setLimite] = useState(3);
    const [confirmando, setConfirmando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    // Depois de confirmar: quantos anúncios receberam a data de hoje.
    const [confirmados, setConfirmados] = useState<number | null>(null);

    useEffect(() => {
        const today = new Date().toLocaleDateString('en-CA');
        const jaViuHoje = lerLembrete() === today;

        let cancelled = false;
        Promise.all([
            fetch('/api/dealership/metrics').then((res) => (res.ok ? res.json() : null)),
            fetch('/api/config/sistema').then((res) => (res.ok ? res.json() : null)).catch(() => null),
        ])
            .then(([data, config]) => {
                if (cancelled || !data) return;
                const dias = Number(config?.diasEstoqueDesatualizado) || 3;
                setLimite(dias);
                // Em dia: um lembrete por dia. Passou do prazo: aparece toda vez que entrar.
                const atrasado = data.daysSinceUpdate >= dias || data.veiculosCadastrados === 0;
                if (jaViuHoje && !atrasado) return;
                setMetrics(data);
                setVisible(true);
                gravarLembrete(today);
            })
            .catch(() => { });

        return () => { cancelled = true; };
    }, []);

    if (!visible || !metrics) return null;

    const handleClose = () => setVisible(false);

    const handleRevisar = () => {
        setVisible(false);
        onUpdateStock();
    };

    const handleConfirmar = async () => {
        setConfirmando(true);
        setErro(null);
        try {
            const { total } = await confirmarEstoqueDaLoja();
            setConfirmados(total);
            onConfirmado?.();
        } catch (error: any) {
            setErro(error?.message || 'Não foi possível confirmar o estoque. Tente de novo.');
        } finally {
            setConfirmando(false);
        }
    };

    if (confirmados !== null) {
        return (
            <AdminModal
                title="Estoque confirmado"
                subtitle="Os lojistas já veem seus veículos como atualizados hoje."
                onClose={handleClose}
                size="md"
                footer={<button type="button" className={modalStyles.primary} onClick={handleClose}>Fechar</button>}
            >
                <div className={styles.statusRow}>
                    <div className={`${styles.trafficLight} ${styles.green}`} aria-hidden="true"></div>
                    <div className={styles.statusInfo}>
                        <span className={styles.statusLabel}>Última atualização: <strong>Hoje</strong></span>
                        <span className={`${styles.statusMessage} ${styles.msg_green}`}>
                            {confirmados === 1 ? '1 veículo recebeu a data de hoje.' : `${confirmados} veículos receberam a data de hoje.`} Mudou algum preço ou quantidade? Ajuste em Estoque e preços.
                        </span>
                    </div>
                </div>
            </AdminModal>
        );
    }

    const breakdown: StatusBreakdown = metrics.statusBreakdown || { verde: 0, amarelo: 0, vermelho: 0 };
    const daysSinceUpdate = metrics.daysSinceUpdate;
    const semVeiculos = metrics.veiculosCadastrados === 0;

    let statusColor: 'green' | 'yellow' | 'red' = 'green';
    let statusMessage = 'Seu estoque está em dia. Continue assim!';
    if (daysSinceUpdate > 1) {
        statusColor = 'yellow';
        statusMessage = 'Atenção: seu estoque não é atualizado há mais de 1 dia.';
    }
    if (daysSinceUpdate >= limite) {
        statusColor = 'red';
        statusMessage = `Seu estoque está há ${daysSinceUpdate >= 999 ? 'muito tempo' : `${daysSinceUpdate} dias`} sem atualização. Confirme ou revise preços e quantidades para continuar aparecendo para os lojistas.`;
    }
    if (semVeiculos) {
        statusColor = 'red';
        statusMessage = 'Você ainda não tem veículos com preço ativo. Cadastre seu estoque.';
    }

    const lastUpdateLabel = daysSinceUpdate === 0 ? 'Hoje' : `${daysSinceUpdate} dia(s) atrás`;

    return (
        <AdminModal
            title={statusColor === 'red' ? 'Atualize seu estoque' : 'Lembrete diário'}
            subtitle="Mantenha seu estoque atualizado para aparecer nas consultas."
            onClose={handleClose}
            size="md"
            busy={confirmando}
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={handleClose} disabled={confirmando}>Deixar para depois</button>
                {semVeiculos ? (
                    <button type="button" className={modalStyles.primary} onClick={handleRevisar}>Cadastrar estoque</button>
                ) : (
                    <>
                        <button type="button" className={modalStyles.secondary} onClick={handleRevisar} disabled={confirmando}>Revisar preços</button>
                        <button type="button" className={modalStyles.primary} onClick={handleConfirmar} disabled={confirmando}>
                            {confirmando ? 'Confirmando...' : 'Confirmar estoque atualizado'}
                        </button>
                    </>
                )}
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

                {!semVeiculos && (
                    <p className={styles.breakdownHint}>
                        Preços e quantidades continuam valendo? Confirme e todos os seus veículos passam a aparecer como atualizados hoje para os lojistas. Se algo mudou, revise os preços antes.
                    </p>
                )}
                {erro && <InlineNotice>{erro}</InlineNotice>}

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
