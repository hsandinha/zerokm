'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './ScrollReveal.module.css';

interface ScrollRevealProps {
    children: ReactNode;
    delay?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
    parallax?: number; // pixels of parallax travel (default 18)
    className?: string;
}

export function ScrollReveal({
    children,
    delay = 0,
    direction = 'up',
    parallax = 18,
    className,
}: ScrollRevealProps) {
    const ref = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // Entrance animation
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    el.style.transitionDelay = delay ? `${delay}ms` : '0ms';
                    el.classList.add(styles.visible);
                    // After entrance completes, switch parallax to fast tracking
                    setTimeout(() => {
                        el.classList.add(styles.parallaxing);
                        el.style.transitionDelay = '0ms';
                    }, 800 + delay);
                }
            },
            { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
        );
        observer.observe(el);

        // Continuous parallax
        if (parallax === 0) return () => observer.disconnect();

        const onScroll = () => {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                const rect = el.getBoundingClientRect();
                const vh = window.innerHeight;
                const center = rect.top + rect.height / 2;
                const progress = (center - vh / 2) / (vh / 2);
                const clamped = Math.max(-1, Math.min(1, progress));
                el.style.setProperty('--parallax-y', `${clamped * parallax}px`);
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(rafRef.current);
        };
    }, [delay, parallax]);

    return (
        <div ref={ref} className={`${styles.reveal} ${styles[direction]} ${className ?? ''}`}>
            {children}
        </div>
    );
}
