'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import styles from './Page.module.css';

export interface ConfirmOptions {
    title: string;
    description?: ReactNode;
    /** Texto do botão que confirma (ex.: "Excluir plano"). */
    confirmLabel?: string;
    cancelLabel?: string;
    /** Ação destrutiva: botão vermelho. */
    danger?: boolean;
}

type Tone = 'positive' | 'negative';

/**
 * Substitui alert() e confirm() do navegador, que fogem do padrão visual e do
 * modo escuro. `confirm` abre o modal do admin e devolve uma Promise<boolean>;
 * `notify` mostra um aviso no canto da tela que some sozinho.
 * Renderize `feedback` uma vez no componente.
 */
export function useFeedback() {
    const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
    const [toast, setToast] = useState<{ id: number; text: string; tone: Tone } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => setDialog({ ...options, resolve })), []);

    const notify = useCallback((text: string, tone: Tone = 'negative') => {
        setToast({ id: Date.now(), text, tone });
    }, []);

    useEffect(() => {
        if (!toast) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setToast(null), toast.tone === 'negative' ? 6000 : 3500);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [toast]);

    const fechar = (ok: boolean) => {
        dialog?.resolve(ok);
        setDialog(null);
    };

    const feedback = (
        <>
            {dialog && (
                <AdminModal
                    title={dialog.title}
                    size="sm"
                    onClose={() => fechar(false)}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => fechar(false)}>
                            {dialog.cancelLabel ?? 'Cancelar'}
                        </button>
                        <button type="button" className={dialog.danger ? modalStyles.dangerSolid : modalStyles.primary} onClick={() => fechar(true)} autoFocus>
                            {dialog.confirmLabel ?? 'Confirmar'}
                        </button>
                    </>}
                >
                    {dialog.description && <p className={styles.confirmText}>{dialog.description}</p>}
                </AdminModal>
            )}
            {toast && (
                <div key={toast.id} className={styles.toast} data-tone={toast.tone} role={toast.tone === 'negative' ? 'alert' : 'status'}>
                    {toast.tone === 'positive' ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
                    <span>{toast.text}</span>
                    <button type="button" className={styles.toastClose} onClick={() => setToast(null)} aria-label="Fechar aviso">
                        <X size={14} aria-hidden="true" />
                    </button>
                </div>
            )}
        </>
    );

    return { confirm, notify, feedback };
}

/** Faixa de erro/aviso dentro de formulários e modais. */
export function InlineNotice({ tone = 'negative', children }: { tone?: 'negative' | 'warning' | 'positive'; children: ReactNode }) {
    return <p className={styles.notice} data-tone={tone} role={tone === 'negative' ? 'alert' : 'status'}>{children}</p>;
}
