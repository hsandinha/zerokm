import { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import styles from './operator.module.css';

interface CarteiraClient {
    id: string;
    nome: string;
    cidade: string;
    status: 'active' | 'expiring_soon' | 'expired' | 'no_plan';
    daysUntilExpiry: number | null;
    expiresAt: string | null;
    paymentMethod: string;
    responsavel: string;
    telefone: string;
}

export function FarolVencimentos() {
    const [clients, setClients] = useState<CarteiraClient[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/operator/carteira')
            .then(res => res.json())
            .then(data => {
                if (data.clients) {
                    setClients(data.clients);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className={styles.farolBox}>Carregando farol de vencimentos...</div>;
    }

    if (clients.length === 0) {
        return (
            <div className={styles.farolBox}>
                <h2>Carteira de clientes (farol)</h2>
                <p>Nenhuma concessionária na sua carteira possui assinaturas no momento.</p>
            </div>
        );
    }

    return (
        <div className={styles.farolBox}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Farol de Vencimentos</h2>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-text-muted)' }}><span className={`${styles.farolDot} ${styles.farolDotNegative}`} aria-hidden="true" /> Vencido / sem acesso</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-text-muted)' }}><span className={`${styles.farolDot} ${styles.farolDotWarning}`} aria-hidden="true" /> Próx. 5 dias</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-text-muted)' }}><span className={`${styles.farolDot} ${styles.farolDotPositive}`} aria-hidden="true" /> Regular</span>
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table className={styles.farolTable} style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--admin-border)' }}>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Status</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Cliente (Loja)</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Responsável</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Pagamento</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Renovação</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map(client => {
                            let dotClass = styles.farolDot;
                            let rowBg = 'transparent';
                            if (client.status === 'expired' || client.status === 'no_plan') {
                                dotClass = `${styles.farolDot} ${styles.farolDotNegative}`;
                                rowBg = 'color-mix(in srgb, var(--color-negative) 6%, transparent)';
                            } else if (client.status === 'expiring_soon') {
                                dotClass = `${styles.farolDot} ${styles.farolDotWarning}`;
                                rowBg = 'color-mix(in srgb, var(--color-warning) 8%, transparent)';
                            } else if (client.status === 'active') {
                                dotClass = `${styles.farolDot} ${styles.farolDotPositive}`;
                            }

                            return (
                                <tr key={client.id} style={{ borderBottom: '1px solid var(--admin-border)', backgroundColor: rowBg }}>
                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }} title={client.status}><span className={dotClass} aria-hidden="true" /></td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{client.nome}</td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem' }}>
                                        {client.responsavel || '-'}
                                        {client.telefone && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{client.telefone}</div>}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem' }}>{client.paymentMethod}</td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem' }}>
                                        {client.expiresAt ? (
                                            <>
                                                {new Date(client.expiresAt).toLocaleDateString('pt-BR')}
                                                {client.daysUntilExpiry !== null && (
                                                    <span style={{ display: 'block', fontSize: '0.75rem', color: client.daysUntilExpiry <= 5 ? 'var(--color-negative)' : 'var(--color-text-muted)' }}>
                                                        {client.daysUntilExpiry < 0 ? `há ${Math.abs(client.daysUntilExpiry)} dias` : `em ${client.daysUntilExpiry} dias`}
                                                    </span>
                                                )}
                                            </>
                                        ) : '-'}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                        {client.telefone && (
                                            <a 
                                                href={`https://wa.me/55${client.telefone.replace(/\D/g, '')}?text=Olá,%20notamos%20que%20o%20plano%20da%20sua%20loja%20ZeroKM%20precisa%20de%20atenção.`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.farolWhatsapp}
                                            >
                                                <MessageCircle size={14} aria-hidden="true" /> Contatar
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
