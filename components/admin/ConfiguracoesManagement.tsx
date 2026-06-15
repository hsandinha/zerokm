'use client';

import React, { useState, useEffect } from 'react';
import styles from './ConfiguracoesManagement.module.css';

interface ContatoConfig {
    whatsapp: string;
    email_support: string;
    email_sales: string;
    email_general: string;
    address: string;
    business_hours: string;
    cnpj: string;
}

export function ConfiguracoesManagement() {
    const [config, setConfig] = useState<ContatoConfig>({
        whatsapp: '',
        email_support: '',
        email_sales: '',
        email_general: '',
        address: '',
        business_hours: '',
        cnpj: ''
    });

    const [bannerConfig, setBannerConfig] = useState({
        price_cents: 5000,
        duration_days: 7
    });
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    useEffect(() => {
        carregarConfigs();
    }, []);

    const carregarConfigs = async () => {
        try {
            setIsLoading(true);
            const res = await fetch('/api/config/contato');
            if (res.ok) {
                const data = await res.json();
                setConfig({
                    whatsapp: data.whatsapp || '',
                    email_support: data.email_support || '',
                    email_sales: data.email_sales || '',
                    email_general: data.email_general || '',
                    address: data.address || '',
                    business_hours: data.business_hours || '',
                    cnpj: data.cnpj || ''
                });
            }

            const resBanner = await fetch('/api/config/banners');
            if (resBanner.ok) {
                const dataBanner = await resBanner.json();
                setBannerConfig({
                    price_cents: dataBanner.price_cents || 5000,
                    duration_days: dataBanner.duration_days || 7
                });
            }
        } catch (error) {
            console.error('Erro ao buscar configurações:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        setIsSaving(true);

        try {
            const res = await fetch('/api/config/contato', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const resBanner = await fetch('/api/config/banners', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bannerConfig)
            });

            if (res.ok && resBanner.ok) {
                setFeedback({ type: 'success', msg: 'Configurações de contato salvas com sucesso!' });
                setTimeout(() => setFeedback(null), 4000);
            } else {
                const err = await res.json();
                setFeedback({ type: 'error', msg: err?.error || 'Erro ao salvar. Verifique se você tem permissão.' });
            }
        } catch (error) {
            setFeedback({ type: 'error', msg: 'Erro de conexão ao salvar configurações.' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className={styles.loading}>Carregando configurações...</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Painel de Contatos e Rodapé Global</h2>
                <p className={styles.subtitle}>
                    Estes dados alimentam o rodapé (Footer) global do portal, e o número de WhatsApp principal é o destino do botão flutuante.
                </p>
            </div>

            {feedback && (
                <div className={`${styles.feedback} ${feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
                    {feedback.msg}
                </div>
            )}

            <form onSubmit={handleSave} className={styles.form}>
                <div className={styles.formGroupPanel}>
                    <h3 className={styles.groupTitle}>Comunicação</h3>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup}>
                            <label>WhatsApp (Link Flutuante e Rodapé)</label>
                            <input 
                                type="text"
                                placeholder="Ex: 5511999999999 (Apenas números com DDI)"
                                value={config.whatsapp}
                                onChange={e => setConfig({...config, whatsapp: e.target.value.replace(/\D/g, '')})}
                                className={styles.input}
                            />
                            <small>Digitar DDI + DDD + Número. Ex: 5511926384826.</small>
                        </div>
                    </div>
                </div>

                <div className={styles.formGroupPanel}>
                    <h3 className={styles.groupTitle}>E-mails (Rodapé)</h3>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup}>
                            <label>E-mail Geral / Principal</label>
                            <input 
                                type="email"
                                value={config.email_general}
                                onChange={e => setConfig({...config, email_general: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>E-mail de Suporte</label>
                            <input 
                                type="email"
                                value={config.email_support}
                                onChange={e => setConfig({...config, email_support: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>E-mail de Vendas (Comercial)</label>
                            <input 
                                type="email"
                                value={config.email_sales}
                                onChange={e => setConfig({...config, email_sales: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.formGroupPanel}>
                    <h3 className={styles.groupTitle}>Dados Jurídicos e Localização</h3>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup}>
                            <label>Horário de Funcionamento</label>
                            <input 
                                type="text"
                                placeholder="Seg–Sex: 09:00–18:00"
                                value={config.business_hours}
                                onChange={e => setConfig({...config, business_hours: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Localização (Cidade/Estado)</label>
                            <input 
                                type="text"
                                placeholder="São Paulo, SP"
                                value={config.address}
                                onChange={e => setConfig({...config, address: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>CNPJ Comercial</label>
                            <input 
                                type="text"
                                value={config.cnpj}
                                onChange={e => setConfig({...config, cnpj: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.formGroupPanel}>
                    <h3 className={styles.groupTitle}>Configurações de Banners e Anúncios</h3>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup}>
                            <label>Preço do Anúncio (R$)</label>
                            <input 
                                type="number"
                                min="0"
                                step="0.01"
                                value={(bannerConfig.price_cents / 100).toFixed(2)}
                                onChange={e => setBannerConfig({...bannerConfig, price_cents: Math.round(parseFloat(e.target.value) * 100)})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Duração do Anúncio (Dias)</label>
                            <input 
                                type="number"
                                min="1"
                                value={bannerConfig.duration_days}
                                onChange={e => setBannerConfig({...bannerConfig, duration_days: parseInt(e.target.value) || 1})}
                                className={styles.input}
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.formActions}>
                    <button type="submit" disabled={isSaving} className={styles.btnSave}>
                        {isSaving ? 'Salvando...' : 'Salvar Alterações Globais'}
                    </button>
                </div>
            </form>
        </div>
    );
}
