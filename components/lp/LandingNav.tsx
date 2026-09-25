'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '@/app/page.module.css';
import { OpenModalButton } from '@/components/lp/OpenModalButton';
import { IconClose, IconMenu } from '@/components/lp/icons';

const LINKS = [
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#recursos', label: 'Recursos' },
    { href: '#concessionarias', label: 'Para concessionárias' },
    { href: '#planos', label: 'Planos' },
    { href: '#duvidas', label: 'Dúvidas' },
];

/** Marca provisória em texto; trocar pelo logo novo quando ele existir. */
export function BrandLockup({ href = '#topo' }: { href?: string }) {
    return (
        <a href={href} className={styles.brand} aria-label="CNV 0KM, Comércio Nacional de Veículos 0km">
            <span className={styles.brandMark} aria-hidden="true">CNV</span>
            <span className={styles.brandText}>
                <span className={styles.brandName}>CNV 0KM</span>
                <span className={styles.brandSub}>Comércio Nacional de Veículos</span>
            </span>
        </a>
    );
}

export function LandingNav() {
    const [aberto, setAberto] = useState(false);

    // Esc fecha o menu do celular.
    useEffect(() => {
        if (!aberto) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [aberto]);

    return (
        <header className={styles.nav}>
            <div className={`${styles.container} ${styles.navInner}`}>
                <BrandLockup />
                <nav aria-label="Seções" className={styles.navLinks}>
                    {LINKS.map(l => <a key={l.href} href={l.href} className={styles.navLink}>{l.label}</a>)}
                </nav>
                <div className={styles.navActions}>
                    <Link href="/login" className={`${styles.btn} ${styles.btnGhost}`}>Entrar</Link>
                    <OpenModalButton type="cliente" className={`${styles.btn} ${styles.btnPrimary} ${styles.navCta}`}>Testar grátis</OpenModalButton>
                    <button
                        type="button"
                        className={styles.menuButton}
                        aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
                        aria-expanded={aberto}
                        aria-controls="menu-celular"
                        onClick={() => setAberto(v => !v)}
                    >
                        {aberto ? <IconClose /> : <IconMenu />}
                    </button>
                </div>
            </div>
            <nav id="menu-celular" aria-label="Seções" className={styles.mobileMenu} data-open={aberto}>
                {LINKS.map(l => (
                    <a key={l.href} href={l.href} className={styles.mobileMenuLink} onClick={() => setAberto(false)}>{l.label}</a>
                ))}
                <div className={styles.mobileMenuActions}>
                    <OpenModalButton type="cliente" className={`${styles.btn} ${styles.btnLg} ${styles.btnPrimary} ${styles.btnBlock}`}>Testar grátis por 10 minutos</OpenModalButton>
                </div>
            </nav>
        </header>
    );
}
