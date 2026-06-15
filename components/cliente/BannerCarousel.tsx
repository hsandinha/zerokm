'use client';

import React, { useState, useEffect } from 'react';
import { MdChevronLeft, MdChevronRight, MdLocalGasStation, MdColorLens, MdDateRange, MdLocalShipping, MdInfo } from 'react-icons/md';
import styles from './BannerCarousel.module.css';

interface Banner {
    _id: string;
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

export function BannerCarousel() {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchBanners = async () => {
            try {
                const res = await fetch('/api/banners');
                if (res.ok) {
                    const data = await res.json();
                    setBanners(data);
                }
            } catch (error) {
                console.error('Erro ao buscar banners', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchBanners();
    }, []);

    useEffect(() => {
        if (banners.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % banners.length);
        }, 10000); // Rotação a cada 10 segundos

        return () => clearInterval(interval);
    }, [banners]);

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
    };

    if (isLoading) return null; // Não exibe nada enquanto carrega
    if (banners.length === 0) return null; // Não exibe o container se não houver banners

    return (
        <div className={styles.carouselContainer}>
            {banners.map((banner, index) => {
                const isActive = index === currentIndex;
                const transformValue = `translateX(${(index - currentIndex) * 100}%)`;

                const content = (
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
                            {(banner.price || banner.priceSubtitle) && (
                                <div className={styles.priceGroup}>
                                    {banner.price && <div className={styles.price}>{banner.price}</div>}
                                    {banner.priceSubtitle && <div className={styles.priceSubtitle}>{banner.priceSubtitle}</div>}
                                </div>
                            )}

                            {banner.vehicleModel && <div className={styles.vehicleModel}>{banner.vehicleModel}</div>}
                            {banner.storeName && <div className={styles.storeName}>{banner.storeName}</div>}

                            {/* Specifications Grid */}
                            <div className={styles.specsContainer}>
                                <div className={styles.specsRow3}>
                                    {banner.year && (
                                        <div className={styles.specItem}>
                                            <MdDateRange className={styles.specIcon} />
                                            <div className={styles.specTextGroup}>
                                                <span className={styles.specValue}>{banner.year}</span>
                                                <span className={styles.specLabel}>Ano</span>
                                            </div>
                                        </div>
                                    )}
                                    {banner.color && (
                                        <div className={styles.specItem}>
                                            <MdColorLens className={styles.specIcon} />
                                            <div className={styles.specTextGroup}>
                                                <span className={styles.specValue}>{banner.color}</span>
                                                <span className={styles.specLabel}>Cor</span>
                                            </div>
                                        </div>
                                    )}
                                    {banner.fuel && (
                                        <div className={styles.specItem}>
                                            <MdLocalGasStation className={styles.specIcon} />
                                            <div className={styles.specTextGroup}>
                                                <span className={styles.specValue}>{banner.fuel}</span>
                                                <span className={styles.specLabel}>Combustível</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className={styles.specsRow2}>
                                    {banner.delivery && (
                                        <div className={styles.specItem}>
                                            <MdLocalShipping className={styles.specIcon} />
                                            <div className={styles.specTextGroup}>
                                                <span className={styles.specValue}>{banner.delivery}</span>
                                                <span className={styles.specLabel}>Prazo</span>
                                            </div>
                                        </div>
                                    )}
                                    {banner.statusCondition && (
                                        <div className={styles.specItem}>
                                            <MdInfo className={styles.specIcon} />
                                            <div className={styles.specTextGroup}>
                                                <span className={styles.specValue}>{banner.statusCondition}</span>
                                                <span className={styles.specLabel}>Situação</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );

                return (
                    <div 
                        key={banner._id} 
                        className={styles.slide}
                        style={{ transform: transformValue, position: isActive ? 'relative' : 'absolute' }}
                    >
                        {banner.linkUrl ? (
                            <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={styles.bannerLink}>
                                {content}
                            </a>
                        ) : (
                            <div className={styles.bannerLink}>
                                {content}
                            </div>
                        )}
                    </div>
                );
            })}

            {banners.length > 1 && (
                <>
                    <button 
                        onClick={handlePrev} 
                        className={`${styles.navButton} ${styles.navButtonLeft}`}
                        aria-label="Anterior"
                    >
                        <MdChevronLeft size={20} />
                    </button>
                    <button 
                        onClick={handleNext} 
                        className={`${styles.navButton} ${styles.navButtonRight}`}
                        aria-label="Próximo"
                    >
                        <MdChevronRight size={20} />
                    </button>

                    <div className={styles.dotsContainer}>
                        {banners.map((_, index) => (
                            <button
                                key={index}
                                className={`${styles.dot} ${index === currentIndex ? styles.dotActive : ''}`}
                                onClick={() => setCurrentIndex(index)}
                                aria-label={`Banner ${index + 1}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
