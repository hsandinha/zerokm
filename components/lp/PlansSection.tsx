'use client';

import { useState } from 'react';
import styles from '@/app/page.module.css';
import { OpenModalButton } from '@/components/lp/OpenModalButton';
import { IconCheck } from '@/components/lp/icons';

export interface PlanData {
    id: string;
    /** Nome já legível ("Plano 1"), sem o resumo. */
    title: string;
    /** Resumo curto do plano. */
    summary: string;
    price: number;
    annualPrice: number | null;
    features: string[];
    featured: boolean;
    badge?: string;
}

const valor = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const temAnual = (p: PlanData) => p.annualPrice != null && p.annualPrice > 0 && p.price > 0;
const descontoAnual = (p: PlanData) => (temAnual(p) ? Math.round((1 - p.annualPrice! / 12 / p.price) * 100) : 0);

export function PlansSection({ plans }: { plans: PlanData[] }) {
    const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
    const algumAnual = plans.some(temAnual);
    const maiorDesconto = Math.max(0, ...plans.map(descontoAnual));

    return (
        <div className={styles.plansWrap}>
            {algumAnual && (
                <div className={styles.billing} role="group" aria-label="Forma de cobrança">
                    <button type="button" aria-pressed={billing === 'monthly'} onClick={() => setBilling('monthly')}>Mensal</button>
                    <button type="button" aria-pressed={billing === 'annual'} onClick={() => setBilling('annual')}>
                        Anual{maiorDesconto > 0 && <span className={styles.billingSave}>até {maiorDesconto}% off</span>}
                    </button>
                </div>
            )}

            <div className={styles.plansGrid}>
                {plans.map(p => {
                    const anual = billing === 'annual' && temAnual(p);
                    const mensal = anual ? p.annualPrice! / 12 : p.price;
                    return (
                        <article key={p.id} className={`${styles.plan} ${p.featured ? styles.planFeatured : ''}`}>
                            {p.badge && <span className={styles.planBadge}>{p.badge}</span>}
                            <div className={styles.planHead}>
                                <h3 className={styles.planName}>{p.title}</h3>
                                {p.summary && <p className={styles.planDesc}>{p.summary}</p>}
                            </div>
                            <div className={styles.planPrice}>
                                {p.price > 0 ? (
                                    <>
                                        <span className={styles.planCurrency}>R$</span>
                                        <span className={styles.planAmount}>{valor(mensal)}</span>
                                        <span className={styles.planPeriod}>/mês</span>
                                    </>
                                ) : (
                                    <span className={styles.planAmount}>Grátis</span>
                                )}
                            </div>
                            {anual && (
                                <p className={styles.planAnnual}>R$ {valor(p.annualPrice!)} cobrados por ano · economia de {descontoAnual(p)}%</p>
                            )}
                            <OpenModalButton
                                type="cliente"
                                className={`${styles.btn} ${styles.btnLg} ${styles.btnBlock} ${p.featured ? styles.btnGold : styles.btnNavyOutline}`}
                                planId={p.price > 0 ? p.id : undefined}
                                billing={anual ? 'annual' : 'monthly'}
                            >
                                {p.price > 0 ? `Assinar ${p.title}` : 'Começar grátis'}
                            </OpenModalButton>
                            {p.features.length > 0 && (
                                <ul className={styles.planList}>
                                    {p.features.map(f => <li key={f}><IconCheck />{f}</li>)}
                                </ul>
                            )}
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
