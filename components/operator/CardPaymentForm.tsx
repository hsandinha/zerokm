'use client';

import { useState, useEffect, useRef } from 'react';
import { detectBrand, lookupBin, type BrandInfo } from '@/lib/utils/cardValidation';
import { validateCPF } from '@/lib/utils/cpf';
import MPSecureCardFields, { type MPSecureCardFieldsHandle } from '@/components/payments/MPSecureCardFields';
import styles from './CardPaymentForm.module.css';

/* ─── Types ──────────────────────────────────────────────────────────────── */

/**
 * Dados retornados após tokenização via Secure Fields (PCI compliant).
 * O backend NUNCA recebe PAN/CVV — apenas tokens descartáveis.
 *
 * Geramos um token descartável no browser e enviamos ao backend para criar
 * a assinatura recorrente nativa do Mercado Pago (`/preapproval`).
 */
export interface CardFormData {
    cardToken: string;
    chargeToken?: string;
    holderName: string;
    cardType: 'credit' | 'debit';
    cpf?: string;
    brand?: string;
    lastFour?: string;
    expirationMonth?: number;
    expirationYear?: number;
    deviceId?: string;
}

interface CardPaymentFormProps {
    amount: number;
    billingType: 'monthly' | 'annual';
    onSubmit: (data: CardFormData) => void | Promise<void>;
    onBack: () => void;
    submitting?: boolean;
    error?: string;
}

/* ─── Brand SVG icons ────────────────────────────────────────────────────── */

function BrandIcon({ brand, size = 'md' }: { brand: string; size?: 'sm' | 'md' }) {
    const dims = size === 'sm'
        ? { w: 32, h: 22, fs: '0.55rem' }
        : { w: 48, h: 30, fs: '0.62rem' };
    const style: React.CSSProperties = {
        width: dims.w,
        height: dims.h,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: dims.fs,
        fontWeight: 800,
        flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
    };
    switch (brand) {
        case 'visa':
            return <div style={{ ...style, background: '#1434CB', color: '#fff' }}>VISA</div>;
        case 'mastercard':
            return (
                <div style={{ ...style, background: '#252525', padding: 0, overflow: 'hidden' }}>
                    <svg viewBox="0 0 38 24" width={dims.w} height={dims.h}>
                        <circle cx="15" cy="12" r="8" fill="#EB001B" />
                        <circle cx="23" cy="12" r="8" fill="#F79E1B" />
                        <path d="M19 6.8a8 8 0 000 10.4A8 8 0 0019 6.8z" fill="#FF5F00" />
                    </svg>
                </div>
            );
        case 'elo':
            return <div style={{ ...style, background: '#FFD520', color: '#000' }}>elo</div>;
        case 'amex':
            return <div style={{ ...style, background: '#2E77BC', color: '#fff' }}>AMEX</div>;
        case 'hipercard':
            return <div style={{ ...style, background: '#CC1D1D', color: '#fff' }}>HIPER</div>;
        default:
            return (
                <div style={{
                    ...style,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1.5px dashed rgba(255,255,255,0.3)',
                }} />
            );
    }
}

/* ─── Card preview (com flip ao focar CVV) ─── */

function CardPreview({ bin, name, brand, flipped }: { bin: string; name: string; brand: BrandInfo; flipped: boolean }) {
    // Mostra primeiros 4 dígitos do BIN + asteriscos
    const displayNumber = (bin.padEnd(16, '•')).match(/.{1,4}/g)?.join(' ') ?? '•••• •••• •••• ••••';

    const cardGradients: Record<string, string> = {
        visa: 'linear-gradient(135deg, #1434CB 0%, #0d2187 50%, #050d4a 100%)',
        mastercard: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        elo: 'linear-gradient(135deg, #E5B325 0%, #c99b0f 50%, #8b6914 100%)',
        amex: 'linear-gradient(135deg, #2E77BC 0%, #1a4d8f 50%, #0d2c5c 100%)',
        hipercard: 'linear-gradient(135deg, #CC1D1D 0%, #8b0000 50%, #520000 100%)',
        unknown: 'linear-gradient(135deg, #2c3e50 0%, #1a2530 50%, #0b1620 100%)',
    };

    const gradient = cardGradients[brand.brand] ?? cardGradients.unknown;

    return (
        <div className={styles.cardWrap}>
            <div
                className={styles.cardInner}
                style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
            >
                <div className={styles.cardFace} style={{ background: gradient }}>
                    <div className={styles.cardTopRow}>
                        <div className={styles.chip} />
                        <BrandIcon brand={brand.brand} />
                    </div>
                    <div className={styles.cardNumber}>{displayNumber}</div>
                    <div className={styles.cardBottomRow}>
                        <div>
                            <div className={styles.cardLabel}>Titular</div>
                            <div className={styles.cardValue}>{name || 'SEU NOME'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div className={styles.cardLabel}>Validade</div>
                            <div className={styles.cardValue}>MM/AA</div>
                        </div>
                    </div>
                </div>
                <div className={`${styles.cardFace} ${styles.cardBack}`} style={{ background: gradient }}>
                    <div className={styles.magStripe} />
                    <div className={styles.cvvRow}>
                        <div className={styles.cvvStrip} />
                        <div className={styles.cvvBox}>CVV</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export function CardPaymentForm({
    amount,
    billingType,
    onSubmit,
    onBack,
    submitting = false,
    error,
}: CardPaymentFormProps) {
    const [holderName, setHolderName] = useState('');
    const [cpf, setCpf] = useState('');
    const cardType: 'credit' = 'credit';
    const [bin, setBin] = useState<string | null>(null);
    const [secureFieldsValid, setSecureFieldsValid] = useState(false);
    const [brand, setBrand] = useState<BrandInfo>(detectBrand(''));
    const [tokenizing, setTokenizing] = useState(false);
    const [tokenizeError, setTokenizeError] = useState('');
    const [nameError, setNameError] = useState('');
    const [cpfError, setCpfError] = useState('');
    const [cvvFocused, setCvvFocused] = useState(false);

    const secureFieldsRef = useRef<MPSecureCardFieldsHandle>(null);
    const binTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? '';

    /* Brand detection driven by BIN events from Secure Fields */
    useEffect(() => {
        if (!bin) {
            setBrand(detectBrand(''));
            return;
        }
        const detected = detectBrand(bin);
        setBrand(detected);
        if (binTimerRef.current) clearTimeout(binTimerRef.current);
        binTimerRef.current = setTimeout(async () => {
            await lookupBin(bin.slice(0, 6), publicKey);
        }, 400);
        return () => { if (binTimerRef.current) clearTimeout(binTimerRef.current); };
    }, [bin, publicKey]);

    const validateName = () => {
        if (!holderName.trim()) {
            setNameError('Informe o nome impresso no cartão.');
            return false;
        }
        setNameError('');
        return true;
    };

    const formatCPF = (raw: string) => {
        const d = raw.replace(/\D/g, '').slice(0, 11);
        if (d.length <= 3) return d;
        if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
        if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    };

    const validateCpfField = () => {
        const digits = cpf.replace(/\D/g, '');
        if (digits.length !== 11 || !validateCPF(digits)) {
            setCpfError('Informe um CPF válido.');
            return false;
        }
        setCpfError('');
        return true;
    };

    const handleSubmit = async () => {
        setTokenizeError('');
        const okName = validateName();
        const okCpf = validateCpfField();
        if (!okName || !okCpf) return;
        if (!secureFieldsValid) {
            setTokenizeError('Preencha os dados do cartão.');
            return;
        }
        if (!secureFieldsRef.current?.isReady()) {
            setTokenizeError('Aguardando carregamento dos campos seguros…');
            return;
        }
        setTokenizing(true);
        try {
            const cpfDigits = cpf.replace(/\D/g, '');
            const saveResult = await secureFieldsRef.current.tokenize({ cardholderName: holderName, cpf: cpfDigits });
            await onSubmit({
                cardToken: saveResult.token,
                holderName,
                cardType,
                cpf: cpfDigits,
                brand: brand.brand !== 'unknown' ? brand.brand : undefined,
                lastFour: saveResult.lastFourDigits,
                expirationMonth: saveResult.expirationMonth,
                expirationYear: saveResult.expirationYear,
                deviceId: secureFieldsRef.current.getDeviceId(),
            });
        } catch (err: any) {
            setTokenizeError(err?.message || 'Não foi possível validar o cartão.');
        } finally {
            setTokenizing(false);
        }
    };

    const isComplete = secureFieldsValid
        && holderName.trim().length > 0
        && cpf.replace(/\D/g, '').length === 11;
    const busy = submitting || tokenizing;

    const formatBRL = (n: number) =>
        n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    return (
        <div className={styles.container}>
            {error && (
                <div className={styles.errorBanner}>
                    <span aria-hidden>⚠️</span>
                    <span>{error}</span>
                </div>
            )}

            <CardPreview bin={bin || ''} name={holderName} brand={brand} flipped={cvvFocused} />

            {/* Secure Fields PCI compliant */}
            <div style={{ marginBottom: 18 }}>
                <MPSecureCardFields
                    ref={secureFieldsRef}
                    publicKey={publicKey}
                    onBinChange={setBin}
                    onValidityChange={setSecureFieldsValid}
                    onCvvFocusChange={setCvvFocused}
                />
            </div>

            {/* Nome do titular */}
            <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Nome impresso no cartão</label>
                <input
                    type="text"
                    autoComplete="cc-name"
                    placeholder="Nome como aparece no cartão"
                    value={holderName}
                    onChange={e => {
                        setHolderName(e.target.value.toUpperCase());
                        if (nameError) setNameError('');
                    }}
                    onBlur={() => {
                        if (!holderName.trim()) setNameError('Informe o nome impresso no cartão.');
                    }}
                    className={`${styles.fieldInput} ${nameError ? styles.invalid : ''}`}
                />
                {nameError && <p className={styles.fieldError}>{nameError}</p>}
            </div>

            {/* CPF do titular */}
            <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>CPF do titular</label>
                <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={e => {
                        setCpf(formatCPF(e.target.value));
                        if (cpfError) setCpfError('');
                    }}
                    onBlur={() => {
                        if (cpf.replace(/\D/g, '').length === 11) validateCpfField();
                    }}
                    className={`${styles.fieldInput} ${cpfError ? styles.invalid : ''}`}
                    maxLength={14}
                />
                {cpfError && <p className={styles.fieldError}>{cpfError}</p>}
            </div>

            {tokenizeError && <div className={styles.tokenError}>{tokenizeError}</div>}

            {/* Submit */}
            <button
                type="button"
                onClick={handleSubmit}
                disabled={!isComplete || busy}
                className={styles.submitBtn}
            >
                {busy ? (
                    <>
                        <span className={styles.spinner} />
                        Processando…
                    </>
                ) : (
                    <>
                        <span aria-hidden>🔒</span>
                        Assinar por R$ {formatBRL(amount)}
                        <span className={styles.amountTag}>
                            ({billingType === 'annual' ? 'Anual' : 'Mensal'})
                        </span>
                    </>
                )}
            </button>

            <button
                type="button"
                onClick={onBack}
                disabled={busy}
                className={styles.backBtn}
            >
                ← Voltar
            </button>

            {/* Trust strip */}
            <div className={styles.trustStrip}>
                <span className={styles.trustItem}>
                    <span aria-hidden>🔒</span> SSL 256-bit
                </span>
                <span className={styles.trustItem}>
                    <span aria-hidden>🛡️</span> PCI Compliant
                </span>
                <span className={styles.brandList}>
                    <BrandIcon brand="visa" size="sm" />
                    <BrandIcon brand="mastercard" size="sm" />
                    <BrandIcon brand="elo" size="sm" />
                    <BrandIcon brand="amex" size="sm" />
                </span>
            </div>
        </div>
    );
}
