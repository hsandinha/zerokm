'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import styles from './MobileMoreSheet.module.css';

export interface MobileNavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
}

export interface MobileNavUser {
    name?: string | null;
    email?: string | null;
    role?: string;
}

interface MobileMoreSheetProps {
    open: boolean;
    onClose: () => void;
    items: MobileNavItem[];
    activeId: string;
    onSelect: (id: string) => void;
    user?: MobileNavUser;
}

const CLOSE_ANIMATION_MS = 220;
const DRAG_CLOSE_THRESHOLD = 90;

function getInitials(name: string) {
    return name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export function MobileMoreSheet({ open, onClose, items, activeId, onSelect, user }: MobileMoreSheetProps) {
    const { theme, toggleTheme } = useTheme();
    const [closing, setClosing] = useState(false);
    const [dragY, setDragY] = useState(0);
    const [dragging, setDragging] = useState(false);
    const dragStartY = useRef<number | null>(null);

    const requestClose = () => {
        if (closing) return;
        setClosing(true);
        setTimeout(() => {
            setClosing(false);
            setDragY(0);
            onClose();
        }, CLOSE_ANIMATION_MS);
    };

    // Trava o scroll da página enquanto o sheet está aberto
    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') requestClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    const handleTouchStart = (e: React.TouchEvent) => {
        dragStartY.current = e.touches[0].clientY;
        setDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (dragStartY.current === null) return;
        const delta = e.touches[0].clientY - dragStartY.current;
        if (delta > 0) setDragY(delta);
    };

    const handleTouchEnd = () => {
        setDragging(false);
        dragStartY.current = null;
        if (dragY > DRAG_CLOSE_THRESHOLD) {
            requestClose();
        } else {
            setDragY(0);
        }
    };

    const handleSelect = (id: string) => {
        if (typeof navigator !== 'undefined') navigator.vibrate?.(8);
        onSelect(id);
        requestClose();
    };

    return (
        <div className={styles.root}>
            <div
                className={`${styles.backdrop} ${closing ? styles.backdropClosing : ''}`}
                onClick={requestClose}
                aria-hidden="true"
            />
            <div
                className={`${styles.panel} ${closing ? styles.panelClosing : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label="Menu completo"
                style={{
                    transform: dragY ? `translateY(${dragY}px)` : undefined,
                    transition: dragging ? 'none' : undefined,
                }}
            >
                <div
                    className={styles.grabArea}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <div className={styles.handle} />
                </div>

                {user && (
                    <Link href="/dashboard/profile" className={styles.userCard} onClick={requestClose}>
                        <div className={styles.userAvatar}>{getInitials(user.name || 'U')}</div>
                        <div className={styles.userInfo}>
                            <span className={styles.userName}>{user.name || 'Usuário'}</span>
                            <span className={styles.userRole}>{user.role || user.email || ''}</span>
                        </div>
                        <span className={styles.userChevron}>›</span>
                    </Link>
                )}

                <div className={styles.grid}>
                    {items.map((item, index) => (
                        <button
                            key={item.id}
                            className={`${styles.cell} ${activeId === item.id ? styles.cellActive : ''}`}
                            onClick={() => handleSelect(item.id)}
                            style={{ '--i': index } as React.CSSProperties}
                        >
                            <span className={styles.cellIcon}>{item.icon}</span>
                            <span className={styles.cellLabel}>{item.label}</span>
                        </button>
                    ))}
                </div>

                <div className={styles.footer}>
                    <button onClick={toggleTheme} className={styles.footerButton}>
                        <span className={styles.footerIcon}>{theme === 'dark' ? '☀️' : '🌙'}</span>
                        {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                    </button>
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className={`${styles.footerButton} ${styles.footerButtonDanger}`}
                    >
                        <span className={styles.footerIcon}>🚪</span>
                        Sair
                    </button>
                </div>
            </div>
        </div>
    );
}
