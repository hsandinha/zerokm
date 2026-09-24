'use client';

import React, { useState, useEffect } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import styles from './BannerPaymentModal.module.css';

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

    const formatBRL = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    const titles: Record<typeof flow, string> = {
        method: 'Forma de pagamento',
        pix: 'Pague com PIX',
        boleto: 'Boleto bancário',
        card_form: 'Dados do cartão',
        processing: 'Processando...',
    };

    let footer: React.ReactNode = null;
    if (flow === 'method') {
        footer = <>
            <button type="button" onClick={() => setFlow('card_form')} className={modalStyles.secondary}>Pagar com cartão</button>
            <button type="button" onClick={handleBoletoPayment} className={modalStyles.secondary}>Pagar com boleto</button>
            <button type="button" onClick={handlePixPayment} className={modalStyles.primary}>Pagar com PIX</button>
        </>;
    } else if (flow === 'pix' && pixData) {
        footer = <button type="button" onClick={() => setFlow('method')} className={modalStyles.secondary}>Voltar</button>;
    } else if (flow === 'boleto' && boletoData) {
        footer = <>
            <button type="button" onClick={() => setFlow('method')} className={modalStyles.secondary}>Voltar</button>
            {boletoData.boletoUrl && (
                <a href={boletoData.boletoUrl} target="_blank" rel="noreferrer" className={modalStyles.primary} style={{ textDecoration: 'none' }}>
                    Abrir boleto
                </a>
            )}
        </>;
    } else if (flow === 'card_form') {
        footer = <button type="button" onClick={() => setFlow('method')} className={modalStyles.secondary}>Voltar para os métodos</button>;
    }

    return (
        <AdminModal title={titles[flow]} onClose={onClose} size="sm" footer={footer}>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {successMessage && <p className={styles.success} role="status">{successMessage}</p>}

            {flow === 'method' && (
                <div className={modalStyles.facts}>
                    <div className={modalStyles.fact}>
                        <span className={modalStyles.factLabel}>Anúncio</span>
                        <strong className={modalStyles.factValue}>{bannerData.title}</strong>
                    </div>
                    <div className={modalStyles.fact}>
                        <span className={modalStyles.factLabel}>Valor</span>
                        <strong className={modalStyles.factValue}>R$ {formatBRL(bannerData.amount)}</strong>
                    </div>
                </div>
            )}

            {flow === 'pix' && pixData && (
                <div className={`${modalStyles.stack} ${styles.center}`}>
                    <p className={styles.muted}>Escaneie o QR Code abaixo no aplicativo do seu banco.</p>
                    <img
                        src={`data:image/jpeg;base64,${pixData.qrCodeBase64}`}
                        alt="QR Code PIX"
                        className={styles.qr}
                    />
                    <div>
                        <p className={styles.codeLabel}>Ou copie e cole o código PIX:</p>
                        <div className={styles.codeRow}>
                            <input type="text" readOnly value={pixData.qrCode} className={styles.codeInput} aria-label="Código PIX" />
                            <button
                                type="button"
                                className={modalStyles.primary}
                                onClick={() => {
                                    navigator.clipboard.writeText(pixData.qrCode).then(() => {
                                        setPixCopied(true);
                                        setTimeout(() => setPixCopied(false), 3000);
                                    });
                                }}
                            >
                                {pixCopied ? 'Copiado!' : 'Copiar'}
                            </button>
                        </div>
                    </div>
                    <div className={styles.waiting}>
                        <div className={styles.spinner} aria-hidden="true"></div>
                        Aguardando pagamento...
                    </div>
                </div>
            )}

            {flow === 'boleto' && boletoData && (
                <div className={`${modalStyles.stack} ${styles.center}`}>
                    <p className={styles.amount}>R$ {formatBRL(boletoData.amount)}</p>
                    {boletoData.expiresAt && (
                        <p className={styles.muted}>Vencimento: {new Date(boletoData.expiresAt).toLocaleDateString('pt-BR')}</p>
                    )}
                    <div className={styles.codeRow}>
                        <input type="text" readOnly value={boletoData.boletoBarcode || boletoData.boletoUrl || ''} className={styles.codeInput} aria-label="Código do boleto" />
                        <button
                            type="button"
                            className={modalStyles.secondary}
                            onClick={() => {
                                navigator.clipboard.writeText(boletoData.boletoBarcode || boletoData.boletoUrl).then(() => {
                                    setBoletoCopied(true);
                                    setTimeout(() => setBoletoCopied(false), 3000);
                                });
                            }}
                        >
                            {boletoCopied ? 'Copiado' : 'Copiar'}
                        </button>
                    </div>
                    <div className={`${styles.waiting} ${styles.waitingNeutral}`}>
                        <div className={styles.spinner} aria-hidden="true"></div>
                        Aguardando compensação...
                    </div>
                </div>
            )}

            {flow === 'card_form' && (
                <div className={modalStyles.stack}>
                    <p className={styles.muted}>
                        Insira os dados do cartão para pagar <strong>R$ {formatBRL(bannerData.amount)}</strong>.
                    </p>
                    {/* Um formulário genérico ou o MP CardForm pode ser inserido aqui */}
                    <p className={styles.notice}>
                        Devido às regras de segurança (PCI Compliance), o Mercado Pago requer o uso do SDK CardForm para capturar os dados sensíveis do cartão. A implementação completa deste módulo está em desenvolvimento.
                    </p>
                </div>
            )}

            {flow === 'processing' && (
                <div className={styles.processing}>
                    <div className={`${styles.spinner} ${styles.spinnerLarge}`} role="status" aria-label="Processando"></div>
                </div>
            )}
        </AdminModal>
    );
}
