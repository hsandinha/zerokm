'use client';

import React, { useState, useEffect } from 'react';
import styles from './BannerCarousel.module.css';

interface Banner {
    _id: string;
    title: string;
    imageUrl: string;
    linkUrl: string;
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

    if (isLoading) return null; // Não exibe nada enquanto carrega
    if (banners.length === 0) return null; // Não exibe o container se não houver banners

    return (
        <div className={styles.carouselContainer}>
            {banners.map((banner, index) => {
                const isActive = index === currentIndex;
                const content = (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.5rem 0 0 0', background: 'var(--color-surface)' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', textAlign: 'center', color: 'var(--color-text)' }}>
                            {banner.title}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                            <img 
                                src={banner.imageUrl} 
                                alt={banner.title} 
                                className={styles.bannerImage} 
                            />
                        </div>
                    </div>
                );

                return (
                    <div 
                        key={banner._id} 
                        className={`${styles.slide} ${isActive ? styles.slideActive : ''}`}
                    >
                        {banner.linkUrl ? (
                            <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={styles.bannerLink}>
                                {content}
                            </a>
                        ) : (
                            content
                        )}
                    </div>
                );
            })}

            {banners.length > 1 && (
                <div className={styles.dotsContainer}>
                    {banners.map((_, index) => (
                        <button
                            key={index}
                            className={`${styles.dot} ${index === currentIndex ? styles.dotActive : ''}`}
                            onClick={() => setCurrentIndex(index)}
                            aria-label={`Ir para o banner ${index + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
