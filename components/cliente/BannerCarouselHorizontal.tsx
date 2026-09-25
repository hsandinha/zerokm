'use client';

import React, { useState, useEffect } from 'react';
import { MdChevronLeft, MdChevronRight } from 'react-icons/md';
import styles from './BannerCarouselHorizontal.module.css';
import { BannerCard, type BannerData } from './BannerCard';

interface Banner extends BannerData {
    _id: string;
}

interface BannerCarouselHorizontalProps {
    role?: string;
}

export function BannerCarouselHorizontal({ role }: BannerCarouselHorizontalProps = {}) {
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

                const content = <BannerCard banner={banner} role={role} />;

                return (
                    <div 
                        key={banner._id} 
                        className={styles.slide}
                        style={{ transform: transformValue, position: isActive ? 'relative' : 'absolute' }}
                    >
                        {banner.linkUrl && role !== 'gratis' ? (
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
