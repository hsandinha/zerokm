'use client';

import styles from './AceiteTermos.module.css';

/** Versão do aceite gravada no cadastro. Trocar quando o contrato novo entrar. */
export const VERSAO_TERMOS = '2026-10';

/**
 * "Li e concordo" do cadastro. Os textos abrem nos modais legais da landing
 * (evento open-legal). O contrato definitivo ainda está sendo escrito: quando
 * ficar pronto, entra no lugar dos Termos de Uso e a VERSAO_TERMOS muda.
 */
export function AceiteTermos({ checked, onChange, className = '' }: { checked: boolean; onChange: (value: boolean) => void; className?: string }) {
    const abrir = (type: 'termos' | 'privacidade') => window.dispatchEvent(new CustomEvent('open-legal', { detail: { type } }));
    return (
        <label className={`${styles.aceite} ${className}`}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} required />
            <span>
                Li e concordo com os{' '}
                <button type="button" className={styles.link} onClick={() => abrir('termos')}>Termos de Uso</button>
                {' '}e a{' '}
                <button type="button" className={styles.link} onClick={() => abrir('privacidade')}>Política de Privacidade</button>
                {' '}do CNV.
            </span>
        </label>
    );
}
