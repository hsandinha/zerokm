'use client';

import styles from '@/app/page.module.css';

export function LegalButtons() {
    return (
        <div className={styles.footerBottomLinks}>
            <button
                type="button"
                className={styles.footerBottomLink}
                onClick={() => window.dispatchEvent(new CustomEvent('open-legal', { detail: { type: 'termos' } }))}
            >
                Termos de Uso
            </button>
            <button
                type="button"
                className={styles.footerBottomLink}
                onClick={() => window.dispatchEvent(new CustomEvent('open-legal', { detail: { type: 'privacidade' } }))}
            >
                Privacidade &amp; LGPD
            </button>
        </div>
    );
}
