'use client';

import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { modalStyles } from '@/components/admin/AdminModal';
import { Button, Page, PageHeader, SectionCard, pageStyles } from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

interface ContatoConfig {
    whatsapp: string;
    email_support: string;
    email_sales: string;
    email_general: string;
    address: string;
    business_hours: string;
    cnpj: string;
}

const CONTATO_VAZIO: ContatoConfig = {
    whatsapp: '', email_support: '', email_sales: '', email_general: '', address: '', business_hours: '', cnpj: '',
};

/** Aceita "50", "50,00" e "1.250,90". */
function paraCentavos(texto: string): number | null {
    const s = texto.trim();
    if (!s) return null;
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function ConfiguracoesManagement() {
    const [config, setConfig] = useState<ContatoConfig>(CONTATO_VAZIO);
    // Texto, não número: com número controlado não dava para digitar centavos.
    const [precoBanner, setPrecoBanner] = useState('50,00');
    const [diasBanner, setDiasBanner] = useState('7');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const { notify, feedback } = useFeedback();

    useEffect(() => {
        const carregar = async () => {
            try {
                const [res, resBanner] = await Promise.all([fetch('/api/config/contato'), fetch('/api/config/banners')]);
                if (res.ok) {
                    const data = await res.json();
                    setConfig({
                        whatsapp: data.whatsapp || '',
                        email_support: data.email_support || '',
                        email_sales: data.email_sales || '',
                        email_general: data.email_general || '',
                        address: data.address || '',
                        business_hours: data.business_hours || '',
                        cnpj: data.cnpj || '',
                    });
                }
                if (resBanner.ok) {
                    const dataBanner = await resBanner.json();
                    setPrecoBanner(((dataBanner.price_cents || 5000) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                    setDiasBanner(String(dataBanner.duration_days || 7));
                }
            } catch (error) {
                console.error('Erro ao buscar configurações:', error);
                setErro('Não foi possível carregar as configurações. Recarregue a página.');
            } finally {
                setIsLoading(false);
            }
        };
        carregar();
    }, []);

    const campo = (chave: keyof ContatoConfig) => ({
        value: config[chave],
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfig({ ...config, [chave]: e.target.value }),
        disabled: isLoading,
    });

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setErro(null);

        const price_cents = paraCentavos(precoBanner);
        const duration_days = Number.parseInt(diasBanner, 10);
        if (price_cents === null) { setErro('Informe um preço de anúncio válido (ex.: 50,00).'); return; }
        if (!Number.isInteger(duration_days) || duration_days < 1) { setErro('A duração do anúncio precisa ser de pelo menos 1 dia.'); return; }

        setIsSaving(true);
        try {
            const [res, resBanner] = await Promise.all([
                fetch('/api/config/contato', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }),
                fetch('/api/config/banners', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price_cents, duration_days }) }),
            ]);
            if (res.ok && resBanner.ok) {
                notify('Configurações salvas. O rodapé do site já usa os dados novos.', 'positive');
            } else {
                const falhou = !res.ok ? res : resBanner;
                const body = await falhou.json().catch(() => ({}));
                setErro(body?.error || 'Não foi possível salvar. Verifique se o seu perfil tem permissão.');
            }
        } catch {
            setErro('Falha de conexão ao salvar as configurações.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Page>
            <form onSubmit={handleSave} className={pageStyles.formStack}>
                <PageHeader
                    title="Configurações"
                    description="Contatos do rodapé do site, WhatsApp do botão flutuante e regras dos anúncios em banner."
                    actions={<Button type="submit" variant="primary" icon={<Save size={16} aria-hidden="true" />} disabled={isSaving || isLoading}>{isSaving ? 'Salvando...' : 'Salvar alterações'}</Button>}
                />

                {erro && <InlineNotice>{erro}</InlineNotice>}

                <SectionCard title="Contatos" description="WhatsApp do botão flutuante e e-mails exibidos no rodapé de todas as páginas públicas.">
                    <div className={modalStyles.row}>
                        <label className={modalStyles.field}>
                            WhatsApp com DDI e DDD
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="5531999999999"
                                value={config.whatsapp}
                                onChange={e => setConfig({ ...config, whatsapp: e.target.value.replace(/\D/g, '') })}
                                disabled={isLoading}
                            />
                            <span className={modalStyles.hint}>Só números.</span>
                        </label>
                        <label className={modalStyles.field}>E-mail geral<input type="email" {...campo('email_general')} /></label>
                        <label className={modalStyles.field}>E-mail de suporte<input type="email" {...campo('email_support')} /></label>
                        <label className={modalStyles.field}>E-mail comercial<input type="email" {...campo('email_sales')} /></label>
                    </div>
                </SectionCard>

                <SectionCard title="Empresa" description="Dados institucionais exibidos no rodapé.">
                    <div className={modalStyles.row}>
                        <label className={modalStyles.field}>Horário de atendimento<input type="text" placeholder="Seg a sex, 9h às 18h" {...campo('business_hours')} /></label>
                        <label className={modalStyles.field}>Cidade e estado<input type="text" placeholder="Belo Horizonte, MG" {...campo('address')} /></label>
                        <label className={modalStyles.field}>CNPJ<input type="text" {...campo('cnpj')} /></label>
                    </div>
                </SectionCard>

                <SectionCard title="Anúncios em banner" description="Valor e duração cobrados da concessionária por anúncio no topo da consulta.">
                    <div className={modalStyles.row}>
                        <label className={modalStyles.field}>
                            Preço por anúncio (R$)
                            <input type="text" inputMode="decimal" value={precoBanner} onChange={e => setPrecoBanner(e.target.value)} disabled={isLoading} />
                        </label>
                        <label className={modalStyles.field}>
                            Duração (dias)
                            <input type="text" inputMode="numeric" value={diasBanner} onChange={e => setDiasBanner(e.target.value.replace(/\D/g, ''))} disabled={isLoading} />
                        </label>
                    </div>
                </SectionCard>
            </form>
            {feedback}
        </Page>
    );
}
