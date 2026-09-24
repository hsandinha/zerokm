'use client';
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './AdminModal.module.css';

export { styles as modalStyles };

type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface AdminModalProps {
    title: ReactNode;
    subtitle?: ReactNode;
    onClose: () => void;
    children: ReactNode;
    /** Botões de ação. Com `onSubmit`, ficam dentro do <form> e o submit funciona. */
    footer?: ReactNode;
    size?: Size;
    /** Bloqueia fechar (Esc, fundo e ×) enquanto salva. */
    busy?: boolean;
    /** Elemento à esquerda do título (ex.: avatar). */
    leading?: ReactNode;
    /** Conteúdo ao lado do título (ex.: selo de status). */
    titleAside?: ReactNode;
    /** Faixa fixa entre cabeçalho e corpo (ex.: abas). */
    toolbar?: ReactNode;
    onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
    bodyClassName?: string;
    /** false = obrigatório (sem ×, Esc ou clique no fundo). Ex.: upgrade com acesso expirado. */
    dismissible?: boolean;
}

/**
 * Padrão visual único dos modais do admin: cabeçalho com título, subtítulo e ×,
 * corpo com rolagem própria e rodapé de ações. Cores vêm dos tokens do design system
 * (claro/escuro). Fecha com Esc, clique no fundo e ×; no celular vira folha inferior.
 */
export function AdminModal({ title, subtitle, onClose, children, footer, size = 'md', busy = false, leading, titleAside, toolbar, onSubmit, bodyClassName, dismissible = true }: AdminModalProps) {
    const titleId = useId();
    const panelRef = useRef<HTMLElement | null>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const busyRef = useRef(busy || !dismissible);
    busyRef.current = busy || !dismissible;

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        panelRef.current?.focus({ preventScroll: true });
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busyRef.current) closeRef.current(); };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
            previous?.focus?.({ preventScroll: true });
        };
    }, []);

    const content = <>
        <header className={styles.header}>
            {leading && <div className={styles.leading}>{leading}</div>}
            <div className={styles.titles}>
                <div className={styles.titleRow}>
                    <h2 id={titleId} className={styles.title}>{title}</h2>
                    {titleAside}
                </div>
                {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
            </div>
            {dismissible && (
                <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Fechar">
                    <X size={18} aria-hidden="true" />
                </button>
            )}
        </header>
        {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
        <div className={`${styles.body} ${bodyClassName || ''}`}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
    </>;

    const panelProps = {
        className: `${styles.panel} ${styles[size]}`,
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': titleId,
        tabIndex: -1,
    } as const;

    return (
        <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget && !busy && dismissible) onClose(); }}>
            {onSubmit
                ? <form {...panelProps} ref={node => { panelRef.current = node; }} onSubmit={onSubmit}>{content}</form>
                : <section {...panelProps} ref={node => { panelRef.current = node; }}>{content}</section>}
        </div>
    );
}
