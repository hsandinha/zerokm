"use client";

import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw } from 'lucide-react';
import { Button, Page, PageHeader, SectionCard, StatusBadge, pageStyles } from '@/components/ui/Page';
import { useFeedback } from '@/components/ui/Feedback';

const EXEMPLO_JSON = `{
  "name": "Nome do lead",
  "phone": "(31) 99999-9999",
  "email": "email@exemplo.com",
  "message": "Olá! Vim do anúncio e gostaria de criar minha conta na CNV",
  "source": "Facebook Ads",
  "campaign": "Campanha de lançamento",
  "notes": "Tem interesse no carro X"
}`;

export default function IntegrationsPanel() {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [copiado, setCopiado] = useState<'url' | 'token' | null>(null);
    const { confirm, notify, feedback } = useFeedback();

    useEffect(() => {
        const carregar = async () => {
            try {
                const res = await fetch('/api/integrations/token');
                const data = await res.json();
                if (data.token) setToken(data.token);
            } catch (error) {
                console.error('Erro ao buscar token:', error);
                notify('Não foi possível carregar o token atual.');
            } finally {
                setLoading(false);
            }
        };
        carregar();
    }, [notify]);

    const handleGenerateToken = async () => {
        if (token) {
            const ok = await confirm({
                title: 'Gerar novo token',
                description: 'O token atual para de funcionar na hora. Facebook Ads, RD Station, Zapier e as demais integrações só voltam a enviar leads depois de receber o token novo.',
                confirmLabel: 'Gerar novo token',
                danger: true,
            });
            if (!ok) return;
        }
        setGenerating(true);
        try {
            const res = await fetch('/api/integrations/token', { method: 'POST' });
            const data = await res.json();
            if (!data.token) throw new Error();
            setToken(data.token);
            notify('Token novo gerado. Atualize as integrações com ele.', 'positive');
        } catch (error) {
            console.error('Erro ao gerar token:', error);
            notify('Não foi possível gerar o token. Tente de novo.');
        } finally {
            setGenerating(false);
        }
    };

    const copiar = async (texto: string, qual: 'url' | 'token') => {
        try {
            await navigator.clipboard.writeText(texto);
            setCopiado(qual);
            setTimeout(() => setCopiado(null), 2000);
        } catch {
            notify('Não foi possível copiar. Selecione o texto e copie manualmente.');
        }
    };

    const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/leads` : '/api/webhooks/leads';

    return (
        <Page>
            <PageHeader
                title="Integrações"
                description="Receba leads de Facebook Ads, RD Station, ActiveCampaign, Typeform, Zapier ou Make direto no funil de Leads."
            />

            <SectionCard title="URL do webhook" description={<>Configure a ferramenta externa para enviar um <strong>POST</strong> para este endereço.</>}>
                <div className={pageStyles.copyRow}>
                    <input type="text" readOnly value={webhookUrl} aria-label="URL do webhook" className={pageStyles.codeInput} onFocus={e => e.currentTarget.select()} />
                    <Button onClick={() => copiar(webhookUrl, 'url')} icon={copiado === 'url' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}>
                        {copiado === 'url' ? 'Copiado' : 'Copiar'}
                    </Button>
                </div>
            </SectionCard>

            <SectionCard
                title="Token de autenticação"
                description={<>Envie no cabeçalho como <code className={pageStyles.code}>Authorization: Bearer SEU_TOKEN</code> ou na URL como <code className={pageStyles.code}>?token=SEU_TOKEN</code>.</>}
                aside={loading ? null : token ? <StatusBadge tone="positive">Ativo</StatusBadge> : <StatusBadge tone="warning">Não gerado</StatusBadge>}
            >
                <div className={pageStyles.copyRow}>
                    <input type="text" readOnly value={loading ? 'Carregando...' : token || 'Nenhum token gerado ainda'} aria-label="Token de autenticação" className={pageStyles.codeInput} onFocus={e => e.currentTarget.select()} />
                    {token && (
                        <Button onClick={() => copiar(token, 'token')} icon={copiado === 'token' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}>
                            {copiado === 'token' ? 'Copiado' : 'Copiar'}
                        </Button>
                    )}
                    <Button
                        variant={token ? 'secondary' : 'primary'}
                        onClick={handleGenerateToken}
                        disabled={generating || loading}
                        icon={token ? <RefreshCw size={16} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
                    >
                        {generating ? 'Gerando...' : token ? 'Gerar novo' : 'Gerar token'}
                    </Button>
                </div>
            </SectionCard>

            <SectionCard title="Formato do envio" description="O corpo da requisição é um JSON. Nome e telefone são obrigatórios; os demais campos são opcionais.">
                <pre className={pageStyles.codeBlock}>{EXEMPLO_JSON}</pre>
                <p className={pageStyles.sectionText}>
                    O campo <code className={pageStyles.code}>message</code> é a primeira frase do lead. É por ela que a origem é etiquetada; sem ela, o lead entra sem etiqueta e fica fora da conversão por origem.
                </p>
                <ul className={pageStyles.sectionList}>
                    <li><strong>Meta, público aberto:</strong> contém <em>vim do anúncio</em></li>
                    <li><strong>Meta, público segmentado:</strong> contém <em>que vi no anúncio</em></li>
                    <li><strong>Google, landing page:</strong> contém <em>vim pelo site</em></li>
                </ul>
            </SectionCard>
            {feedback}
        </Page>
    );
}
