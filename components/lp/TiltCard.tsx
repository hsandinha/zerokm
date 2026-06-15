'use client';
import { useRef, type MouseEvent, type ReactNode } from 'react';

interface TiltCardProps {
    children: ReactNode;
    className?: string;
    intensity?: number;
}

export default function TiltCard({ children, className, intensity = 12 }: TiltCardProps) {
    const ref = useRef<HTMLDivElement>(null);

    function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transition = 'transform 0.08s ease-out';
        el.style.transform = `perspective(900px) rotateY(${x * intensity}deg) rotateX(${-y * (intensity * 0.75)}deg) translateZ(18px)`;
    }

    function handleMouseLeave() {
        const el = ref.current;
        if (!el) return;
        el.style.transition = 'transform 0.55s ease-out';
        el.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg) translateZ(0px)';
    }

    return (
        <div
            ref={ref}
            className={className}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {children}
        </div>
    );
}
