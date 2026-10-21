'use client';

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';

interface Aviso {
    id: string;
    titulo: string;
    mensagem: string;
    linkUrl: string | null;
    linkTexto: string | null;
}

/**
 * Avisos gerais da equipe do CNV para quem está logado (assinante ou
 * concessionária). Um por vez; fechar marca como lido em qualquer aparelho.
 */
export function AvisosAssinante() {
    const [fila, setFila] = useState<Aviso[]>([]);

    useEffect(() => {
        let ativo = true;
        fetch('/api/avisos')
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (ativo && Array.isArray(data?.avisos)) setFila(data.avisos); })
            .catch(() => { /* sem avisos */ });
        return () => { ativo = false; };
    }, []);

    const atual = fila[0];
    if (!atual) return null;

    const fechar = () => {
        void fetch(`/api/avisos/${atual.id}/lido`, { method: 'POST' }).catch(() => undefined);
        setFila(prev => prev.slice(1));
    };

    return (
        <AdminModal
            size="sm"
            leading={<Megaphone size={22} aria-hidden="true" />}
            title={atual.titulo}
            subtitle={fila.length > 1 ? `Aviso do CNV · mais ${fila.length - 1}` : 'Aviso do CNV'}
            onClose={fechar}
            footer={<>
                {atual.linkUrl && (
                    <a
                        className={modalStyles.secondary}
                        href={atual.linkUrl}
                        target={atual.linkUrl.startsWith('/') ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        onClick={fechar}
                    >
                        {atual.linkTexto || 'Saiba mais'}
                    </a>
                )}
                <button type="button" className={modalStyles.primary} onClick={fechar}>Entendi</button>
            </>}
        >
            <p className={modalStyles.flush} style={{ whiteSpace: 'pre-line' }}>{atual.mensagem}</p>
        </AdminModal>
    );
}
