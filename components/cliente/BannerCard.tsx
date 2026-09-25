'use client';

/**
 * O cartão do banner, como o lojista vê.
 *
 * Vive separado do carrossel porque tem dois usuários: o próprio carrossel e a
 * prévia do "Criar banner" na consulta de veículos. Uma prévia desenhada à
 * parte divergiria do resultado no primeiro ajuste de estilo — e prévia que
 * mente é pior que nenhuma.
 */

import React from 'react';
import { MdLocalGasStation, MdColorLens, MdDateRange, MdLocalShipping, MdInfo } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';
import styles from './BannerCarouselHorizontal.module.css';

export interface BannerData {
    title: string;
    imageUrl: string;
    linkUrl?: string;
    badge?: string;
    price?: string;
    priceSubtitle?: string;
    vehicleModel?: string;
    storeName?: string;
    year?: string;
    color?: string;
    fuel?: string;
    delivery?: string;
    statusCondition?: string;
    ctaText?: string;
}

/** Perfil `gratis` não recebe o contato da loja — nem ícone, nem link. */
export function BannerCard({ banner, role }: { banner: BannerData; role?: string }) {
    const especificacoes: { icone: React.ReactNode; valor?: string }[] = [
        { icone: <MdDateRange className={styles.specIcon} />, valor: banner.year },
        { icone: <MdColorLens className={styles.specIcon} />, valor: banner.color },
        { icone: <MdLocalGasStation className={styles.specIcon} />, valor: banner.fuel },
        { icone: <MdLocalShipping className={styles.specIcon} />, valor: banner.delivery },
        { icone: <MdInfo className={styles.specIcon} />, valor: banner.statusCondition },
    ];

    return (
        <div className={styles.slideInner}>
            <div className={styles.imageWrapper}>
                {banner.badge && <div className={styles.badge}>{banner.badge}</div>}
                <img
                    src={banner.imageUrl}
                    alt={banner.vehicleModel || banner.title}
                    className={styles.bannerImage}
                />
            </div>

            <div className={styles.contentWrapper}>
                <div className={styles.titleContainer}>
                    <div className={styles.titleRow}>
                        {banner.vehicleModel && <div className={styles.vehicleModel}>{banner.vehicleModel}</div>}
                        {banner.linkUrl && role !== 'gratis' && (
                            <div className={styles.whatsappIconOnly}>
                                <FaWhatsapp size={20} />
                            </div>
                        )}
                    </div>
                    <div className={styles.storeRow}>
                        {banner.storeName && <div className={styles.storeName}>{banner.storeName}</div>}
                    </div>
                </div>

                <div className={styles.priceRow}>
                    {(banner.price || banner.priceSubtitle) && (
                        <div className={styles.priceGroup}>
                            {banner.priceSubtitle && <div className={styles.priceSubtitle}>{banner.priceSubtitle}</div>}
                            {banner.price && <div className={styles.price}>{banner.price}</div>}
                        </div>
                    )}
                </div>

                <div className={styles.specsContainer}>
                    {especificacoes.filter(e => e.valor).map((e, i) => (
                        <div key={i} className={styles.specItem}>
                            {e.icone}
                            <div className={styles.specTextGroup}>
                                <span className={styles.specValue}>{e.valor}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
