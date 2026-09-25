'use client';

/**
 * "Criar banner" a partir de uma linha da consulta de veículos.
 *
 * O banner é montado sozinho com o que já está no estoque — foto, modelo,
 * preço, ano, cor, combustível, prazo, situação e o WhatsApp da loja. Aqui só
 * se confere e confirma; ajustar selo, subtítulo ou chamada continua sendo na
 * tela de Banners, que é onde o formulário completo vive.
 *
 * A prévia usa o MESMO componente do carrossel do lojista (`BannerCard`), na
 * mesma caixa de 750x180. O que aparece aqui é o que vai ao ar.
 */

import React, { useMemo, useState } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { BannerCard } from '@/components/cliente/BannerCard';
import { bannerDoVeiculo, impedimentoParaBanner, type VeiculoParaBanner } from '@/lib/utils/bannerDoVeiculo';
import styles from './CriarBannerModal.module.css';

export function CriarBannerModal({ veiculo, preco, onClose, onCriado }: {
    veiculo: VeiculoParaBanner;
    /** Preço já com a margem — o mesmo número que a linha mostra. */
    preco: number;
    onClose: () => void;
    onCriado: () => void;
}) {
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const impedimento = useMemo(() => impedimentoParaBanner(veiculo), [veiculo]);
    const banner = useMemo(() => bannerDoVeiculo(veiculo, preco), [veiculo, preco]);

    const criar = async () => {
        setSalvando(true);
        setErro(null);
        try {
            const res = await fetch('/api/admin/banners', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Sem `expiresAt`: a rota já usa 24h como padrão.
                body: JSON.stringify(banner),
            });
            if (!res.ok) {
                setErro('Não foi possível criar o banner. Tente de novo.');
                return;
            }
            onCriado();
        } catch {
            setErro('Falha de conexão ao criar o banner.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <AdminModal
            size="lg"
            title="Criar banner"
            subtitle="O anúncio fica 24 horas no ar, no topo da consulta dos lojistas."
            onClose={onClose}
            busy={salvando}
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={onClose} disabled={salvando}>
                    Cancelar
                </button>
                <button
                    type="button"
                    className={modalStyles.primary}
                    onClick={criar}
                    disabled={salvando || !!impedimento}
                >
                    {salvando ? 'Criando...' : 'Criar banner de 24h'}
                </button>
            </>}
        >
            {impedimento && <InlineNotice tone="negative">{impedimento}</InlineNotice>}
            {erro && <InlineNotice tone="negative">{erro}</InlineNotice>}

            {!impedimento && (
                <>
                    <p className={modalStyles.hint}>Assim o lojista vai ver:</p>
                    <div className={styles.previa}>
                        <BannerCard banner={banner} role="client" />
                    </div>

                    {!banner.linkUrl && (
                        <InlineNotice tone="warning">
                            Este veículo não tem telefone cadastrado — o banner vai ao ar sem o
                            contato de WhatsApp.
                        </InlineNotice>
                    )}
                </>
            )}
        </AdminModal>
    );
}
