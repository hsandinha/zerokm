'use client';

/**
 * MPSecureCardFields — campos de cartão PCI-compliant via Mercado Pago Secure Fields.
 *
 * O número do cartão, validade e CVV são renderizados dentro de iframes hospedados
 * pelo Mercado Pago. O JS desta página NUNCA tem acesso ao PAN/CVV — só recebemos
 * eventos (BIN, validade) e, ao chamar `tokenize()`, um token id descartável.
 *
 * Uso:
 *   const ref = useRef<MPSecureCardFieldsHandle>(null);
 *   <MPSecureCardFields ref={ref} onBinChange={...} onValidityChange={...} />
 *   const result = await ref.current?.tokenize({ cardholderName, cpf });
 *   // result.token → mandar pro backend em /api/user/save-card { cardToken: result.token }
 */

import {
    forwardRef,
    useEffect,
    useId,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';

declare global {
    interface Window {
        MercadoPago?: any;
    }
}

const MP_SDK_SRC = 'https://sdk.mercadopago.com/js/v2';

export interface MPCardTokenizeInput {
    cardholderName: string;
    cpf?: string;
}

export interface MPCardTokenizeResult {
    token: string;
    firstSixDigits?: string;
    lastFourDigits?: string;
    expirationMonth?: number;
    expirationYear?: number;
}

export interface MPSecureCardFieldsHandle {
    tokenize: (input: MPCardTokenizeInput) => Promise<MPCardTokenizeResult>;
    isReady: () => boolean;
    getDeviceId: () => string | undefined;
}

export interface MPSecureCardFieldsProps {
    publicKey: string;
    /** Disparado quando o BIN (primeiros 6 dígitos) é detectado. */
    onBinChange?: (bin: string | null) => void;
    /** Disparado quando todos os 3 campos estão válidos. */
    onValidityChange?: (allValid: boolean) => void;
    /** Disparado ao focar/desfocar o campo CVV (útil para flip de cartão). */
    onCvvFocusChange?: (focused: boolean) => void;
    /** Estilo CSS aplicado dentro do iframe. */
    fieldStyle?: Record<string, string>;
}

let sdkLoadPromise: Promise<void> | null = null;
function loadMPSdk(): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
    if (window.MercadoPago) return Promise.resolve();
    if (sdkLoadPromise) return sdkLoadPromise;

    sdkLoadPromise = new Promise<void>((resolve, reject) => {
        const existing = document.getElementById('mp-sdk-v2') as HTMLScriptElement | null;
        if (existing) {
            if (window.MercadoPago) return resolve();
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Falha ao carregar MP SDK')));
            return;
        }
        const s = document.createElement('script');
        s.id = 'mp-sdk-v2';
        s.src = MP_SDK_SRC;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Falha ao carregar MP SDK'));
        document.head.appendChild(s);
    });
    return sdkLoadPromise;
}

const MPSecureCardFields = forwardRef<MPSecureCardFieldsHandle, MPSecureCardFieldsProps>(
    function MPSecureCardFields({ publicKey, onBinChange, onValidityChange, onCvvFocusChange, fieldStyle }, ref) {
        // IDs estáveis (sobrevivem ao StrictMode double-effect e ao Turbopack HMR).
        const reactId = useId().replace(/[:]/g, '_');
        const numberId = `mp-num-${reactId}`;
        const expiryId = `mp-exp-${reactId}`;
        const cvvId = `mp-cvv-${reactId}`;

        const mpRef = useRef<any>(null);
        const numberFieldRef = useRef<any>(null);
        const expiryFieldRef = useRef<any>(null);
        const cvvFieldRef = useRef<any>(null);
        const validityRef = useRef({ number: false, expiry: false, cvv: false });
        const deviceIdRef = useRef<string | undefined>(undefined);

        const [ready, setReady] = useState(false);
        const [error, setError] = useState<string | null>(null);

        useEffect(() => {
            let cancelled = false;

            // Aguarda os 3 containers existirem no DOM. Em React 18+/StrictMode +
            // Turbopack, o effect roda antes do paint completo em alguns casos.
            async function waitForContainers(maxAttempts = 30): Promise<boolean> {
                for (let i = 0; i < maxAttempts; i++) {
                    const a = document.getElementById(numberId);
                    const b = document.getElementById(expiryId);
                    const c = document.getElementById(cvvId);
                    if (a && b && c) return true;
                    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
                }
                return false;
            }

            async function init() {
                if (!publicKey) {
                    setError('Mercado Pago public key não configurada.');
                    return;
                }
                try {
                    await loadMPSdk();
                    if (cancelled) return;

                    const containersReady = await waitForContainers();
                    if (cancelled) return;
                    if (!containersReady) {
                        throw new Error('Containers dos campos seguros não encontrados no DOM.');
                    }

                    const MP = window.MercadoPago;
                    if (!MP) throw new Error('MercadoPago global não disponível');

                    const mp = new MP(publicKey, { locale: 'pt-BR' });
                    mpRef.current = mp;

                    // Captura device fingerprint
                    try {
                        deviceIdRef.current =
                            mp.getSessionID?.() || mp.getDeviceSessionId?.() || (window as any).MP_DEVICE_SESSION_ID;
                    } catch { /* ignore */ }

                    const numEl = document.getElementById(numberId);
                    const expEl = document.getElementById(expiryId);
                    const cvvEl = document.getElementById(cvvId);
                    if (!numEl || !expEl || !cvvEl) {
                        throw new Error('Containers dos campos seguros não encontrados (post-wait).');
                    }

                    // Detecta cor de texto a partir do CSS var do app (light/dark aware)
                    let textColor = '#1a202c';
                    {
                        const computed = getComputedStyle(numEl);
                        const v = computed.color;
                        if (v && v !== 'rgba(0, 0, 0, 0)') textColor = v;
                    }

                    const style = {
                        height: '100%',
                        padding: '0 14px',
                        fontSize: '16px',
                        color: textColor,
                        ...(fieldStyle || {}),
                    };

                    // MP SDK V2: mount() espera o ID do elemento como string (sem #).
                    // Validamos acima que os elementos existem com esses IDs no DOM.
                    const numberField = mp.fields
                        .create('cardNumber', { placeholder: '0000 0000 0000 0000', style })
                        .mount(numberId);
                    numberFieldRef.current = numberField;

                    const expiryField = mp.fields
                        .create('expirationDate', { placeholder: 'MM/AA', style })
                        .mount(expiryId);
                    expiryFieldRef.current = expiryField;

                    const cvvField = mp.fields
                        .create('securityCode', { placeholder: '123', style })
                        .mount(cvvId);
                    cvvFieldRef.current = cvvField;

                    const updateValidity = () => {
                        const v = validityRef.current;
                        onValidityChange?.(v.number && v.expiry && v.cvv);
                    };

                    numberField.on('binChange', (data: any) => {
                        const bin: string | null = (data?.bin as string) || null;
                        onBinChange?.(bin);
                    });
                    numberField.on('validityChange', (data: any) => {
                        validityRef.current.number = !data?.errorMessages?.length;
                        updateValidity();
                    });
                    expiryField.on('validityChange', (data: any) => {
                        validityRef.current.expiry = !data?.errorMessages?.length;
                        updateValidity();
                    });
                    cvvField.on('validityChange', (data: any) => {
                        validityRef.current.cvv = !data?.errorMessages?.length;
                        updateValidity();
                    });
                    cvvField.on('focus', () => onCvvFocusChange?.(true));
                    cvvField.on('blur', () => onCvvFocusChange?.(false));

                    setReady(true);
                } catch (err: any) {
                    if (!cancelled) setError(err?.message || 'Erro ao inicializar campos seguros.');
                }
            }

            init();

            return () => {
                cancelled = true;
                try { numberFieldRef.current?.unmount(); } catch { /* ignore */ }
                try { expiryFieldRef.current?.unmount(); } catch { /* ignore */ }
                try { cvvFieldRef.current?.unmount(); } catch { /* ignore */ }
                numberFieldRef.current = null;
                expiryFieldRef.current = null;
                cvvFieldRef.current = null;
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [publicKey, numberId, expiryId, cvvId]);

        useImperativeHandle(ref, () => ({
            isReady: () => ready,
            getDeviceId: () => deviceIdRef.current,
            tokenize: async ({ cardholderName, cpf }) => {
                if (!mpRef.current) throw new Error('SDK ainda não carregado.');
                const cpfDigits = (cpf || '').replace(/\D/g, '');
                const payload: Record<string, any> = { cardholderName };
                if (cpfDigits.length === 11) {
                    payload.identificationType = 'CPF';
                    payload.identificationNumber = cpfDigits;
                } else if (cpfDigits.length === 14) {
                    payload.identificationType = 'CNPJ';
                    payload.identificationNumber = cpfDigits;
                }
                const resp = await mpRef.current.fields.createCardToken(payload);
                if (!resp?.id) {
                    throw new Error(resp?.message || 'Não foi possível gerar token do cartão.');
                }
                return {
                    token: resp.id as string,
                    firstSixDigits: resp.first_six_digits,
                    lastFourDigits: resp.last_four_digits,
                    expirationMonth: resp.expiration_month,
                    expirationYear: resp.expiration_year,
                };
            },
        }), [ready]);

        const fieldBoxStyle: React.CSSProperties = {
            height: 52,
            borderRadius: 12,
            background: 'var(--color-surface, #fff)',
            border: '1.5px solid var(--color-border, rgba(0,0,0,0.12))',
            overflow: 'hidden',
            position: 'relative',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        };

        // Garante que o iframe injetado pelo MP preencha o container e seja clicável.
        const iframeFillCss = `
            .mp-secure-field-container > iframe { width: 100% !important; height: 100% !important; border: 0 !important; display: block !important; }
        `;

        const labelStyle: React.CSSProperties = {
            display: 'block',
            fontSize: '0.72rem',
            color: 'var(--color-text-muted, #718096)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginBottom: 6,
        };

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <style>{iframeFillCss}</style>
                {error && (
                    <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>
                )}
                <div>
                    <label style={labelStyle}>Número do cartão</label>
                    <div id={numberId} className="mp-secure-field-container" style={fieldBoxStyle} />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Validade</label>
                        <div id={expiryId} className="mp-secure-field-container" style={fieldBoxStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>CVV</label>
                        <div id={cvvId} className="mp-secure-field-container" style={fieldBoxStyle} />
                    </div>
                </div>
                {!ready && !error && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #718096)' }}>
                        Carregando campos seguros…
                    </div>
                )}
            </div>
        );
    }
);

export default MPSecureCardFields;
