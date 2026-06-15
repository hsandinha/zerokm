'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './VideoBackground.module.css';

const videos = [
    {
        src: '/videos/luxury-car.mp4',
        type: 'Carros de Luxo',
        poster: '/images/luxury-car-poster.jpg',
        title: 'Elegância e Sofisticação',
        description: 'Veículos premium com acabamento refinado'
    },
    {
        src: '/videos/classic-car.mp4',
        type: 'Carros Clássicos',
        poster: '/images/classic-car-poster.jpg',
        title: 'Tradição e História',
        description: 'Modelos atemporais com design icônico'
    },
    {
        src: '/videos/supercar.mp4',
        type: 'Supercarros',
        poster: '/images/supercar-poster.jpg',
        title: 'Potência e Performance',
        description: 'Tecnologia de ponta e máxima velocidade'
    }
]; export function VideoBackground() {
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsTransitioning(true);

            setTimeout(() => {
                setCurrentVideoIndex((prev) => (prev + 1) % videos.length);
                setIsTransitioning(false);
            }, 500);
        }, 8000); // Trocar vídeo a cada 8 segundos

        return () => clearInterval(interval);
    }, []);

    const currentVideo = videos[currentVideoIndex];

    return (
        <div className={styles.container}>
            <div className={`${styles.videoWrapper} ${isTransitioning ? styles.transitioning : ''}`}>
                {/* Fallback para quando os vídeos não estão disponíveis */}
                <div className={styles.fallbackBackground}>
                    <div className={styles.gradientOverlay}></div>
                    <div className={styles.carAnimation}>
                        <div className={styles.car}>🏎️</div>
                        <div className={styles.track}></div>
                    </div>
                </div>

                {/* Vídeo real seria carregado aqui */}
                <video
                    ref={videoRef}
                    className={styles.video}
                    autoPlay
                    muted
                    loop
                    playsInline
                    poster={currentVideo.poster}
                    onError={() => {
                        // Se o vídeo falhar, usa o fallback
                        console.log('Vídeo não encontrado, usando animação CSS');
                    }}
                >
                    <source src={currentVideo.src} type="video/mp4" />
                </video>
            </div>

            <div className={styles.videoInfo}>
                <div className={styles.videoDetails}>
                    <div className={styles.videoType}>{currentVideo.type}</div>
                    <div className={styles.videoTitle}>{currentVideo.title}</div>
                    <div className={styles.videoDescription}>{currentVideo.description}</div>
                </div>
                <div className={styles.videoControls}>
                    <div className={styles.videoIndicators}>
                        {videos.map((video, index) => (
                            <button
                                key={index}
                                className={`${styles.indicator} ${index === currentVideoIndex ? styles.active : ''
                                    }`}
                                title={video.type}
                                onClick={() => {
                                    setIsTransitioning(true);
                                    setTimeout(() => {
                                        setCurrentVideoIndex(index);
                                        setIsTransitioning(false);
                                    }, 500);
                                }}
                            />
                        ))}
                    </div>
                    <div className={styles.videoCounter}>
                        {currentVideoIndex + 1} / {videos.length}
                    </div>
                </div>
            </div>
        </div>
    );
}