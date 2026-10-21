'use client';

import { embedDoVideo } from '@/lib/utils/video';
import styles from './VideoTutorial.module.css';

/** Player do vídeo tutorial configurado em Configurações. */
export function VideoTutorial({ url }: { url: string }) {
    const video = embedDoVideo(url);
    if (!video) return null;
    return (
        <div className={styles.frame}>
            {video.tipo === 'iframe' ? (
                <iframe
                    src={video.src}
                    title="Como usar o CNV"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            ) : (
                <video src={video.src} controls preload="metadata" />
            )}
        </div>
    );
}
