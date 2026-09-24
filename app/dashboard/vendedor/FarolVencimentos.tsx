'use client';

import { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import styles from './operator.module.css';

interface CarteiraClient {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    status: 'active' | 'expiring_soon' | 'expired' | 'no_plan';
    daysUntilExpiry: number | null;
    vencimento: string | null;
    plano: string | null;
}

const STATUS_LABEL: Record<CarteiraClient['status'], string> = {
    expired: 'Vencido',
    no_plan: 'Sem plano',
    expiring_soon: 'Vence nos próximos 5 dias',
    active: 'Regular',
};

export function FarolVencimentos() {
    const [clients, setClients] = useState<CarteiraClient[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/vendedor/clientes')
            .then(res => res.json())
            .then((data: any[]) => {
                if (!Array.isArray(data)) return;
                const agora = new Date();
                const emBreve = new Date(agora);
                emBreve.setDate(emBreve.getDate() + 5);

                const mapped: CarteiraClient[] = data.map(c => {
                    const venc = c.vencimento ? new Date(c.vencimento) : null;
                    let status: CarteiraClient['status'] = 'no_plan';
                    let daysUntilExpiry: number | null = null;

                    if (venc) {
                        const diff = Math.ceil((venc.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
                        daysUntilExpiry = diff;
                        if (diff < 0) status = 'expired';
                        else if (diff <= 5) status = 'expiring_soon';
                        else status = 'active';
                    } else if (c.statusPlano === 'active') {
                        status = 'active';
                    }

                    return {
                        id: c.id,
                        nome: c.nome || c.email || '-',
                        email: c.email || '',
                        telefone: c.telefone || '',
                        plano: c.plano || null,
                        vencimento: c.vencimento || null,
                        status,
                        daysUntilExpiry,
                    };
                });

                // Ordenar: vermelho, sem plano, vencendo, ativo
                const order: Record<string, number> = { expired: 0, no_plan: 1, expiring_soon: 2, active: 3 };
                mapped.sort((a, b) => order[a.status] - order[b.status]);
                setClients(mapped);
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
                <h2 className={styles.farolTitle}>Farol de vencimentos</h2>
                <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                    Nenhum cliente/lojista vinculado à sua carteira ainda.
                </p>
            </div>
        );
    }

    return (
        <div className={styles.farolBox}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <h2 className={styles.farolTitle} style={{ margin: 0 }}>Farol de vencimentos</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className={`${styles.farolDot} ${styles.farolDotNegative}`} aria-hidden="true" /> Vencido / sem acesso</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className={`${styles.farolDot} ${styles.farolDotWarning}`} aria-hidden="true" /> Próximos 5 dias</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className={`${styles.farolDot} ${styles.farolDotPositive}`} aria-hidden="true" /> Regular</span>
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table className={styles.farolTable} style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--admin-border)' }}>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Status</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Cliente (loja)</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Telefone</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Plano</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Renovação</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map(client => {
                            let dotClass = styles.farolDotNeutral;
                            let rowBg = 'transparent';
                            if (client.status === 'expired' || client.status === 'no_plan') {
                                dotClass = styles.farolDotNegative;
                                rowBg = 'color-mix(in srgb, var(--color-negative) 6%, transparent)';
                            } else if (client.status === 'expiring_soon') {
                                dotClass = styles.farolDotWarning;
                                rowBg = 'color-mix(in srgb, var(--color-warning) 7%, transparent)';
                            } else if (client.status === 'active') {
                                dotClass = styles.farolDotPositive;
                            }

                            return (
                                <tr key={client.id} style={{ borderBottom: '1px solid var(--admin-border)', backgroundColor: rowBg }}>
                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }} title={STATUS_LABEL[client.status]}>
                                        <span className={`${styles.farolDot} ${dotClass}`} role="img" aria-label={STATUS_LABEL[client.status]} />
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                                        {client.nome}
                                        {client.email && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                                                {client.email}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem' }}>
                                        {client.telefone || '-'}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem' }}>
                                        {client.plano || <span style={{ color: 'var(--color-text-muted)' }}>Sem plano</span>}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.9rem' }}>
                                        {client.vencimento ? (
                                            <>
                                                {new Date(client.vencimento).toLocaleDateString('pt-BR')}
                                                {client.daysUntilExpiry !== null && (
                                                    <span style={{ display: 'block', fontSize: '0.75rem', color: client.daysUntilExpiry <= 5 ? 'var(--color-negative)' : 'var(--color-text-muted)' }}>
                                                        {client.daysUntilExpiry < 0
                                                            ? `há ${Math.abs(client.daysUntilExpiry)} dias`
                                                            : `em ${client.daysUntilExpiry} dias`}
                                                    </span>
                                                )}
                                            </>
                                        ) : '-'}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                        {client.telefone && (
                                            <a
                                                href={`https://wa.me/55${client.telefone.replace(/\D/g, '')}?text=Olá%20${encodeURIComponent(client.nome)},%20notamos%20que%20o%20seu%20plano%20ZeroKM%20precisa%20de%20atenção.`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.whatsappBtn}
                                            >
                                                <MessageCircle size={15} aria-hidden="true" /> Contatar
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
