'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { InlineNotice } from '@/components/ui/Feedback';
import { redimensionarLogo } from '@/lib/utils/logoImagem';
import styles from './ClienteLogoField.module.css';

/**
 * Logo do lojista no orçamento. Campo da equipe (CRM): o cliente se cadastra
 * sozinho, e depois da assinatura a equipe pede a logo e coloca aqui.
 */
export function ClienteLogoField({ userId, nomeCliente }: { userId: string; nomeCliente?: string }) {
    const [logo, setLogo] = useState<string | null>(null);
    const [info, setInfo] = useState<{ por: string | null; em: string | null }>({ por: null, em: null });
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let ativo = true;
        setCarregando(true);
        setMensagem(null);
        fetch(`/api/admin/clientes/${userId}/logo`)
            .then(res => res.json())
            .then(data => {
                if (!ativo) return;
                setLogo(data.logo || null);
                setInfo({ por: data.atualizadoPor || null, em: data.atualizadoEm || null });
            })
            .catch(() => ativo && setMensagem({ ok: false, texto: 'Não foi possível carregar a logo.' }))
            .finally(() => ativo && setCarregando(false));
        return () => { ativo = false; };
    }, [userId]);

    const enviar = async (arquivo: File) => {
        setSalvando(true);
        setMensagem(null);
        try {
            const dataUrl = await redimensionarLogo(arquivo);
            const res = await fetch(`/api/admin/clientes/${userId}/logo`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logo: dataUrl }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível salvar a logo.');
            setLogo(data.logo);
            setInfo({ por: data.atualizadoPor || null, em: data.atualizadoEm || null });
            setMensagem({ ok: true, texto: 'Logo salva. Ela já sai nos próximos orçamentos do cliente.' });
        } catch (error) {
            setMensagem({ ok: false, texto: error instanceof Error ? error.message : 'Não foi possível salvar a logo.' });
        } finally {
            setSalvando(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const remover = async () => {
        setSalvando(true);
        setMensagem(null);
        try {
            const res = await fetch(`/api/admin/clientes/${userId}/logo`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            setLogo(null);
            setInfo({ por: null, em: null });
            setMensagem({ ok: true, texto: 'Logo removida. O orçamento volta a sair sem logo.' });
        } catch {
            setMensagem({ ok: false, texto: 'Não foi possível remover a logo.' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={styles.wrap}>
            <div className={styles.preview} aria-busy={carregando}>
                {carregando ? <span className={styles.muted}>Carregando...</span>
                    : logo ? <img src={logo} alt={`Logo de ${nomeCliente || 'cliente'}`} />
                        : <span className={styles.muted}>Sem logo</span>}
            </div>
            <div className={styles.side}>
                <p className={styles.hint}>
                    Sai no canto superior esquerdo do orçamento (Meu carro). PNG, JPG, WEBP ou SVG; a imagem é reduzida automaticamente.
                </p>
                <div className={styles.actions}>
                    <button type="button" className={styles.button} onClick={() => inputRef.current?.click()} disabled={salvando || carregando}>
                        <ImagePlus size={15} aria-hidden="true" />
                        {salvando ? 'Salvando...' : logo ? 'Trocar logo' : 'Enviar logo'}
                    </button>
                    {logo && (
                        <button type="button" className={`${styles.button} ${styles.danger}`} onClick={remover} disabled={salvando}>
                            <Trash2 size={15} aria-hidden="true" />
                            Remover
                        </button>
                    )}
                </div>
                {info.em && (
                    <span className={styles.muted}>
                        Atualizada em {new Date(info.em).toLocaleDateString('pt-BR')}{info.por ? ` por ${info.por}` : ''}
                    </span>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                    hidden
                    onChange={event => { const f = event.target.files?.[0]; if (f) enviar(f); }}
                />
                {mensagem && <InlineNotice tone={mensagem.ok ? 'positive' : 'negative'}>{mensagem.texto}</InlineNotice>}
            </div>
        </div>
    );
}
