'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { VideoTutorial } from '@/components/cliente/VideoTutorial';
import { openSalesWhatsAppForLead } from '@/lib/utils/leadWhatsApp';
import { esquecerNovoCadastro, lerNovoCadastro } from '@/lib/utils/boasVindas';

/**
 * Primeira tela depois do cadastro (?boasVindas=1): a pessoa escolhe se quer
 * tirar dúvidas no WhatsApp ou seguir sem conversar. Antes o cadastro abria o
 * WhatsApp sozinho, numa aba nova, sem perguntar.
 */
export function BoasVindas({ nome, email, videoUrl }: { nome?: string | null; email?: string | null; videoUrl?: string }) {
    const [aberto, setAberto] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        // Quem chegou escolhendo um plano vai direto para o pagamento.
        if (params.get('boasVindas') === '1' && params.get('upgrade') !== '1') setAberto(true);
    }, []);

    const fechar = () => {
        setAberto(false);
        esquecerNovoCadastro();
        const params = new URLSearchParams(window.location.search);
        params.delete('boasVindas');
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    };

    const tirarDuvidas = () => {
        // A aba abre no clique; o endereço do WhatsApp entra quando o número de vendas chega.
        const aba = window.open('', '_blank');
        if (aba) aba.opener = null;
        const lead = lerNovoCadastro() || { name: nome || '', email: email || '', source: 'Cadastro gratis' };
        void openSalesWhatsAppForLead({ ...lead, source: `${lead.source || 'Cadastro gratis'} - tirar duvidas` }, aba);
        fechar();
    };

    if (!aberto) return null;

    return (
        <AdminModal
            size={videoUrl ? 'lg' : 'sm'}
            title={`Bem-vindo ao CNV${nome ? `, ${nome.split(' ')[0]}` : ''}!`}
            subtitle="Sua conta está pronta e o teste grátis já começou."
            onClose={fechar}
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={fechar}>
                    Continuar sem conversar no WhatsApp
                </button>
                <button type="button" className={modalStyles.primary} onClick={tirarDuvidas}>
                    <MessageCircle size={16} aria-hidden="true" /> Tirar dúvidas no WhatsApp
                </button>
            </>}
        >
            <div className={modalStyles.stack}>
                {videoUrl && <VideoTutorial url={videoUrl} />}
                <p className={modalStyles.flush}>
                    Quer ajuda para começar? Nossa equipe tira suas dúvidas pelo WhatsApp. Se preferir, siga direto para a consulta de veículos.
                </p>
            </div>
        </AdminModal>
    );
}
