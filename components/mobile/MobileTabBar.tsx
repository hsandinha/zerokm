'use client';

import React, { useMemo, useState } from 'react';
import { MdApps } from 'react-icons/md';
import { MobileMoreSheet, MobileNavItem, MobileNavUser } from './MobileMoreSheet';
import styles from './MobileTabBar.module.css';

export type { MobileNavItem, MobileNavUser };

interface MobileTabBarProps {
    /** Menu completo (já filtrado por permissão), na ordem original. */
    items: MobileNavItem[];
    activeId: string;
    onSelect: (id: string) => void;
    /** Ids preferidos para os slots principais da barra, em ordem de prioridade. */
    primaryIds?: string[];
    /** Quantidade de slots principais antes do botão "Mais". */
    maxPrimary?: number;
    /** Dados do usuário exibidos no bottom sheet. */
    user?: MobileNavUser;
}

/**
 * Menu inferior flutuante (padrão Instagram) para mobile.
 * Mostra os itens principais + botão "Mais" que abre o menu completo
 * em um bottom sheet. Invisível em telas >= 769px (via CSS).
 */
export function MobileTabBar({
    items,
    activeId,
    onSelect,
    primaryIds,
    maxPrimary = 4,
    user,
}: MobileTabBarProps) {
    const [sheetOpen, setSheetOpen] = useState(false);

    const primary = useMemo(() => {
        const preferred = (primaryIds ?? [])
            .map((id) => items.find((item) => item.id === id))
            .filter((item): item is MobileNavItem => Boolean(item));
        const fill = items.filter((item) => !preferred.includes(item));
        const ordered = [...preferred, ...fill];
        // Se tudo cabe na barra (contando o slot do "Mais"), mostra todos sem "Mais"
        if (items.length <= maxPrimary + 1) return ordered;
        return ordered.slice(0, maxPrimary);
    }, [items, primaryIds, maxPrimary]);

    const hasMore = items.length > primary.length;
    const activeInMore = hasMore && !primary.some((item) => item.id === activeId);

    const handleTap = (id: string) => {
        if (typeof navigator !== 'undefined') navigator.vibrate?.(8);
        onSelect(id);
    };

    return (
        <>
            <nav className={styles.tabBar} aria-label="Navegação principal">
                {primary.map((item) => (
                    <button
                        key={item.id}
                        className={`${styles.tabItem} ${activeId === item.id ? styles.tabItemActive : ''}`}
                        onClick={() => handleTap(item.id)}
                        aria-current={activeId === item.id ? 'page' : undefined}
                    >
                        <span className={styles.tabIcon}>{item.icon}</span>
                        <span className={styles.tabLabel}>{item.label}</span>
                    </button>
                ))}
                {hasMore && (
                    <button
                        className={`${styles.tabItem} ${activeInMore || sheetOpen ? styles.tabItemActive : ''}`}
                        onClick={() => {
                            if (typeof navigator !== 'undefined') navigator.vibrate?.(8);
                            setSheetOpen(true);
                        }}
                        aria-haspopup="dialog"
                        aria-expanded={sheetOpen}
                    >
                        <span className={styles.tabIcon}>
                            <MdApps size={22} />
                        </span>
                        <span className={styles.tabLabel}>Mais</span>
                    </button>
                )}
            </nav>
            {hasMore && (
                <MobileMoreSheet
                    open={sheetOpen}
                    onClose={() => setSheetOpen(false)}
                    items={items}
                    activeId={activeId}
                    onSelect={onSelect}
                    user={user}
                />
            )}
        </>
    );
}
