"use client";

import React, { useState, useEffect } from 'react';
import { MdContentCopy, MdRefresh } from 'react-icons/md';

export default function IntegrationsPanel() {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        fetchToken();
    }, []);

    const fetchToken = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/integrations/token');
            const data = await res.json();
            if (data.token) {
                setToken(data.token);
            }
        } catch (error) {
            console.error('Erro ao buscar token:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateToken = async () => {
        if (token && !confirm("Gerar um novo token invalidará o token atual. Todas as suas integrações existentes (Facebook Ads, RD Station, etc) pararão de funcionar até que você as atualize com o novo token. Tem certeza?")) {
            return;
        }

        setGenerating(true);
        try {
            const res = await fetch('/api/integrations/token', { method: 'POST' });
            const data = await res.json();
            if (data.token) {
                setToken(data.token);
                alert('Novo token gerado com sucesso!');
            }
        } catch (error) {
            console.error('Erro ao gerar token:', error);
            alert('Erro ao gerar token.');
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('Copiado para a área de transferência!');
    };

    const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/leads` : 'https://seu-dominio.com/api/webhooks/leads';

    if (loading) {
        return <div style={{ color: 'var(--color-text)', padding: '24px' }}>Carregando integrações...</div>;
    }

    return (
        <div style={{ padding: '24px', background: 'var(--color-surface)', borderRadius: '12px', color: 'var(--color-text)' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '8px' }}>Integrações (Webhooks)</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px' }}>
                Conecte ferramentas externas como Facebook Ads, RD Station, ActiveCampaign ou Typeform enviando Leads automaticamente para o CRM.
            </p>

            <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: '1fr', maxWidth: '800px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-highlight)', borderRadius: '8px', padding: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔗 1. URL do Webhook
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                        Configure o seu sistema externo (ou Zapier/Make) para enviar uma requisição <strong>POST</strong> para esta URL:
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <input 
                            type="text" 
                            readOnly 
                            value={webhookUrl} 
                            style={{ flex: 1, padding: '10px 16px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-highlight)', color: 'var(--color-text)', borderRadius: '6px', fontFamily: 'monospace', outline: 'none' }}
                        />
                        <button 
                            onClick={() => handleCopy(webhookUrl)}
                            style={{ padding: '0 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}
                        >
                            <MdContentCopy /> Copiar
                        </button>
                    </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-highlight)', borderRadius: '8px', padding: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔐 2. Token de Autenticação (Secret)
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                        Envie este token no cabeçalho (Header) da requisição como <code>Authorization: Bearer SEU_TOKEN</code>, ou na URL como <code>?token=SEU_TOKEN</code>.
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <input 
                            type="text" 
                            readOnly 
                            value={token || 'Nenhum token gerado ainda'} 
                            style={{ flex: 1, padding: '10px 16px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-highlight)', color: token ? 'var(--color-text)' : '#ef4444', borderRadius: '6px', fontFamily: 'monospace', outline: 'none' }}
                        />
                        {token && (
                            <button 
                                onClick={() => handleCopy(token)}
                                style={{ padding: '0 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}
                            >
                                <MdContentCopy /> Copiar
                            </button>
                        )}
                        <button 
                            onClick={handleGenerateToken}
                            disabled={generating}
                            style={{ padding: '0 16px', background: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-highlight)', borderRadius: '6px', cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, opacity: generating ? 0.5 : 1 }}
                        >
                            <MdRefresh /> {token ? 'Gerar Novo' : 'Gerar Token'}
                        </button>
                    </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-highlight)', borderRadius: '8px', padding: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📄 3. Formato do JSON (Payload)
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                        O corpo da requisição (Body) deve ser um JSON com os dados do Lead. Nome e Telefone são obrigatórios.
                    </p>
                    <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', color: '#a78bfa', fontFamily: 'monospace', fontSize: '0.9rem', overflowX: 'auto', border: '1px solid var(--color-highlight)' }}>
{`{
  "name": "Nome do Lead",
  "phone": "(11) 99999-9999",
  "email": "email@exemplo.com", // Opcional
  "message": "Olá! Vim do anúncio e gostaria de criar minha conta no CNV", // Opcional
  "source": "Facebook Ads", // Opcional (Origem)
  "campaign": "Campanha Black Friday", // Opcional
  "notes": "Lead tem interesse no carro X" // Opcional
}`}
                    </pre>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '12px', marginBottom: 0 }}>
                        O campo <code>message</code> é a primeira frase enviada pelo lead. É a partir dela que a
                        origem é etiquetada automaticamente — sem ela, o lead entra sem tag e não aparece na
                        conversão por origem:
                    </p>
                    <ul style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '8px', paddingLeft: '20px' }}>
                        <li><strong>Meta - Público Aberto</strong> — “…<em>vim do anúncio</em>…”</li>
                        <li><strong>Meta - Público Segmentado</strong> — “…<em>que vi no anúncio</em>”</li>
                        <li><strong>Google - LP</strong> — “…<em>vim pelo site</em>…”</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
