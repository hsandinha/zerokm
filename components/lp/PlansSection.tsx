'use client';

import { useState } from 'react';
import { OpenModalButton } from '@/components/lp/OpenModalButton';
import styles from '@/app/page.module.css';
import toggleStyles from './PlansSection.module.css';

export interface PlanData {
    id: string;
    name: string;
    desc: string;
    price: number;
    priceFormatted: string;
    annualPrice: number | null;
    period: string;
    highlight: boolean;
    badge?: string;
    cta: string;
    features: string[];
}

function formatPrice(price: number) {
    if (price === 0) return 'Grátis';
    return `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function PlansSection({ plans }: { plans: PlanData[] }) {
    const hasAnnual = plans.some(p => p.annualPrice != null && p.annualPrice > 0);
    const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

    // Calculate best discount across all plans for the badge
    const bestDiscount = plans.reduce((best, p) => {
        if (!p.annualPrice || !p.price) return best;
        const pct = Math.round(((p.price - p.annualPrice / 12) / p.price) * 100);
        return pct > best ? pct : best;
    }, 0);

    return (
        <>
            <div className={toggleStyles.toggleWrap}>
                <span className={billing === 'monthly' ? toggleStyles.toggleLabelActive : toggleStyles.toggleLabel}>
                    Mensal
                </span>
                <button
                    role="switch"
                    aria-checked={billing === 'annual'}
                    onClick={() => setBilling(b => b === 'monthly' ? 'annual' : 'monthly')}
                    className={`${toggleStyles.toggle} ${billing === 'annual' ? toggleStyles.toggleOn : ''}`}
                >
                    <span className={toggleStyles.toggleThumb} />
                </button>
                <span className={billing === 'annual' ? toggleStyles.toggleLabelActive : toggleStyles.toggleLabel}>
                    Anual
                </span>
                <span className={toggleStyles.toggleSaveBadge}>
                    {billing === 'annual'
                        ? `${bestDiscount > 0 ? `${bestDiscount}% off` : 'Desconto'} no plano anual`
                        : `Economize até ${bestDiscount > 0 ? `${bestDiscount}%` : '2 meses'} no anual`}
                </span>
            </div>

            <div className={styles.plansRow}>
                {plans.map((p) => {
                    const showAnnual = billing === 'annual' && p.annualPrice != null && p.annualPrice > 0;
                    const displayPrice = showAnnual
                        ? formatPrice(p.annualPrice! / 12)
                        : p.priceFormatted;
                    const displayPeriod = p.period;
                    const discountPct = showAnnual && p.price > 0
                        ? Math.round(((p.price - p.annualPrice! / 12) / p.price) * 100)
                        : 0;

                    return (
                        <div key={p.id} className={`${styles.planCard} ${p.highlight ? styles.planHighlight : ''}`}>
                            {p.badge && <span className={styles.planBadge}>{p.badge}</span>}
                            <h3 className={styles.planName}>{p.name}</h3>
                            <p className={styles.planDesc}>{p.desc}</p>
                            <div className={styles.planPrice}>
                                <span className={styles.planAmount}>{displayPrice}</span>
                                {displayPeriod && <span className={styles.planPeriod}>{displayPeriod}</span>}
                                {discountPct > 0 && (
                                    <span className={toggleStyles.planDiscountBadge}>-{discountPct}%</span>
                                )}
                            </div>
                            {showAnnual && (
                                <p className={styles.planAnnualNote}>
                                    *Cobrança de {formatPrice(p.annualPrice!)} no cartão
                                </p>
                            )}
                            {p.features.length > 0 && (
                                <ul className={styles.planFeatures}>
                                    {p.features.map((f, fi) => (
                                        <li key={fi}><span>✓</span>{f}</li>
                                    ))}
                                </ul>
                            )}
                            <OpenModalButton
                                type="cliente"
                                className={p.highlight ? styles.planCtaPrimary : styles.planCtaOutline}
                                planId={p.price > 0 ? p.id : undefined}
                                billing={billing}
                            >
                                {p.cta}
                            </OpenModalButton>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
