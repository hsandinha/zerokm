'use client';

import React, { useState, useEffect } from 'react';
import styles from '../operator/UpgradeModal.module.css';

interface BannerPaymentModalProps {
    onClose: () => void;
    onSuccess: () => void;
    bannerData: {
        title: string;
        imageUrl: string;
        linkUrl: string;
        amount: number;
    };
}

export function BannerPaymentModal({ onClose, onSuccess, bannerData }: BannerPaymentModalProps) {
    const [flow, setFlow] = useState<'method' | 'pix' | 'boleto' | 'card_form' | 'processing'>('method');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [pixData, setPixData] = useState<any>(null);
    const [boletoData, setBoletoData] = useState<any>(null);
    const [pixCopied, setPixCopied] = useState(false);
    const [boletoCopied, setBoletoCopied] = useState(false);

    // Form Cartão
    const [cardToken, setCardToken] = useState('');

    // Injeta MP SDK
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!document.getElementById('mp-sdk-v2')) {
            const sdk = document.createElement('script');
            sdk.id = 'mp-sdk-v2';
            sdk.src = 'https://sdk.mercadopago.com/js/v2';
            sdk.async = true;
            document.head.appendChild(sdk);
        }
    }, []);

    const handlePixPayment = async () => {
        setFlow('processing');
        setError('');
        try {
            const res = await fetch('/api/checkout/pix/banner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bannerData)
            });
            const data = await res.json();
            if (data.ok && data.qrCodeBase64) {
                setPixData(data);
                setFlow('pix');
                startPolling(data.paymentId, 'pix');
            } else {
                setError(data.error || 'Erro ao gerar PIX.');
                setFlow('method');
            }
        } catch {
            setError('Erro de conexão.');
            setFlow('method');
        }
    };

    const handleBoletoPayment = async () => {
        setFlow('processing');
        setError('');
        try {
            const res = await fetch('/api/checkout/boleto/banner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bannerData)
            });
            const data = await res.json();
            if (data.ok && (data.boletoUrl || data.boletoBarcode)) {
                setBoletoData(data);
                setFlow('boleto');
                startPolling(data.paymentId, 'boleto');
            } else {
                setError(data.error || 'Erro ao gerar Boleto.');
                setFlow('method');
            }
        } catch {
            setError('Erro de conexão.');
            setFlow('method');
        }
    };

    const startPolling = (paymentId: string, type: 'pix' | 'boleto') => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/checkout/status/${paymentId}`);
                const data = await res.json();
                if (data.status === 'approved') {
                    clearInterval(interval);
                    setSuccessMessage(`Pagamento ${type.toUpperCase()} confirmado!`);
                    setFlow('processing');
                    setTimeout(() => onSuccess(), 2500);
                }
            } catch {}
        }, type === 'pix' ? 5000 : 10000);

        setTimeout(() => clearInterval(interval), 30 * 60 * 1000); // 30 min
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal} style={{ maxWidth: '500px' }}>
                <button className={styles.btnClose} onClick={onClose} aria-label="Fechar modal">✕</button>

                <div className={styles.header}>
                    <h2 className={styles.headerTitle}>
                        {flow === 'method' && '💳 Forma de Pagamento'}
                        {flow === 'pix' && '📱 Pague com PIX'}
                        {flow === 'boleto' && 'Boleto bancário'}
                        {flow === 'card_form' && '🔒 Dados do Cartão'}
                        {flow === 'processing' && 'Processando...'}
                    </h2>
                </div>

                <div className={styles.content}>
                    {error && <p style={{ color: 'red', textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}
                    {successMessage && <p style={{ color: 'green', textAlign: 'center', marginBottom: '1rem', fontWeight: 'bold' }}>✅ {successMessage}</p>}

                    {flow === 'method' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '1rem' }}>
                                Anúncio: <strong>{bannerData.title}</strong><br/>
                                Valor: <strong>R$ {bannerData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                            </p>

                            <button onClick={handlePixPayment} className={styles.btnPrimary} style={{ background: '#10b981' }}>
                                ⚡ Pagar com PIX
                            </button>
                            <button onClick={handleBoletoPayment} className={styles.btnSecondary}>
                                Pagar com Boleto
                            </button>
                            <button onClick={() => setFlow('card_form')} className={styles.btnSecondary} style={{ border: '1px solid #1a73e8', color: '#1a73e8' }}>
                                💳 Pagar com Cartão
                            </button>
                        </div>
                    )}

                    {flow === 'pix' && pixData && (
                        <div style={{ padding: '2rem', textAlign: 'center' }}>
                            <p style={{ marginBottom: '1rem', color: '#666' }}>
                                Escaneie o QR Code abaixo no aplicativo do seu banco.
                            </p>
                            <img 
                                src={`data:image/jpeg;base64,${pixData.qrCodeBase64}`} 
                                alt="QR Code PIX" 
                                style={{ width: '250px', height: '250px', margin: '0 auto', display: 'block', borderRadius: '12px', border: '1px solid #eee' }} 
                            />
                            <div style={{ marginTop: '2rem' }}>
                                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>Ou copie e cole o código PIX:</p>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                    <input 
                                        type="text" 
                                        readOnly 
                                        value={pixData.qrCode} 
                                        style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc', flex: 1, backgroundColor: '#f9f9f9', fontSize: '0.8rem' }}
                                    />
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(pixData.qrCode).then(() => {
                                                setPixCopied(true);
                                                setTimeout(() => setPixCopied(false), 3000);
                                            });
                                        }}
                                        style={{ padding: '0.8rem 1.5rem', borderRadius: '8px', border: 'none', background: '#0056b3', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        {pixCopied ? 'Copiado! ✓' : 'Copiar'}
                                    </button>
                                </div>
                            </div>
                            <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#f29900', fontSize: '0.9rem' }}>
                                <div className={styles.spinner} style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                                Aguardando pagamento...
                            </div>
                            <button onClick={() => setFlow('method')} style={{ background: 'transparent', border: 'none', color: '#666', marginTop: '1rem', cursor: 'pointer' }}>
                                ← Voltar
                            </button>
                        </div>
                    )}

                    {flow === 'boleto' && boletoData && (
                        <div style={{ padding: '2rem', textAlign: 'center' }}>
                            <p style={{ margin: '0 0 16px 0', fontSize: '2rem', fontWeight: 700, color: '#333' }}>
                                R$ {boletoData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            {boletoData.expiresAt && (
                                <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#666' }}>
                                    Vencimento: {new Date(boletoData.expiresAt).toLocaleDateString('pt-BR')}
                                </p>
                            )}
                            {boletoData.boletoUrl && (
                                <a href={boletoData.boletoUrl} target="_blank" rel="noreferrer" className={styles.btnPrimary} style={{ textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>
                                    Abrir Boleto
                                </a>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
                                <input type="text" readOnly value={boletoData.boletoBarcode || boletoData.boletoUrl || ''} style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc', flex: 1, backgroundColor: '#f9f9f9', fontSize: '0.8rem' }} />
                                <button onClick={() => {
                                    navigator.clipboard.writeText(boletoData.boletoBarcode || boletoData.boletoUrl).then(() => {
                                        setBoletoCopied(true);
                                        setTimeout(() => setBoletoCopied(false), 3000);
                                    });
                                }} style={{ padding: '0.8rem 1.5rem', borderRadius: '8px', border: 'none', background: '#64748b', color: '#fff', cursor: 'pointer' }}>
                                    {boletoCopied ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>
                            <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.9rem' }}>
                                <div className={styles.spinner} style={{ width: '16px', height: '16px', borderWidth: '2px', borderColor: '#64748b', borderTopColor: 'transparent' }}></div>
                                Aguardando compensação...
                            </div>
                            <button onClick={() => setFlow('method')} style={{ background: 'transparent', border: 'none', color: '#666', marginTop: '1rem', cursor: 'pointer' }}>
                                ← Voltar
                            </button>
                        </div>
                    )}

                    {flow === 'card_form' && (
                        <div style={{ padding: '1rem' }}>
                            <p style={{ textAlign: 'center', color: '#666', marginBottom: '1rem' }}>
                                Insira os dados do cartão para pagar <strong>R$ {bannerData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>.
                            </p>
                            {/* Um formulário genérico ou o MP CardForm pode ser inserido aqui */}
                            <p style={{ textAlign: 'center', color: '#d93025', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                🚧 Devido às regras de segurança (PCI Compliance), o Mercado Pago requer o uso do SDK CardForm para capturar os dados sensíveis do cartão. A implementação completa deste módulo está em desenvolvimento.
                            </p>
                            <button onClick={() => setFlow('method')} className={styles.btnSecondary}>
                                Voltar para os Métodos
                            </button>
                        </div>
                    )}

                    {flow === 'processing' && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                            <div className={styles.spinner} style={{ width: '40px', height: '40px' }}></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
