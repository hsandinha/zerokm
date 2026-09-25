'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import styles from './UpgradeModal.module.css';
import { ArrowLeft, Barcode, Check, ChevronRight, Copy, CreditCard, ExternalLink, Loader2, QrCode, ShieldCheck } from 'lucide-react';
import { MaskedInput } from '@/components/operator/MaskedInput';
import { CardPaymentForm, type CardFormData } from '@/components/operator/CardPaymentForm';
import { getUserProfile, updateUserProfile, UserProfileData } from '@/app/dashboard/profile/actions';
import { validateCPF } from '@/lib/utils/cpf';
import { dividirNomePlano, itensDoPlano } from '@/lib/utils/planoTexto';

interface Plan {
    id: string;
    name: string;
    description?: string;
    type: 'monthly' | 'credits';
    credits?: number | null;
    price: number;
    annualPrice?: number | null;
    active: boolean;
}

type BillingType = 'monthly' | 'annual';

interface UpgradeModalProps {
    onClose: () => void;
    /** Se informado, pré-seleciona o plano com este id assim que os planos carregarem. */
    initialPlanId?: string;
    /** Tipo de cobrança inicial quando `initialPlanId` está presente. Default: 'monthly'. */
    initialBilling?: BillingType;
    /** Impede fechar o modal enquanto o acesso gratis estiver expirado. */
    locked?: boolean;
    /** Oculta planos gratuitos no fluxo de upgrade. */
    paidOnly?: boolean;
    /** Mantém o fluxo restrito ao PIX, sem alternativa de cartão. */
    pixOnly?: boolean;
    title?: string;
    subtitle?: string;
    showLogout?: boolean;
}

/** Maps Mercado Pago status_detail codes to human-readable Portuguese messages. */
const MP_STATUS_DETAIL_PT: Record<string, string> = {
    cc_rejected_bad_filled_card_number: 'Número do cartão inválido. Verifique e tente novamente.',
    cc_rejected_bad_filled_date: 'Data de validade incorreta. Verifique e tente novamente.',
    cc_rejected_bad_filled_other: 'Dados do cartão incorretos. Revise as informações e tente novamente.',
    cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) inválido. Confira o código de 3 dígitos no verso do cartão.',
    cc_rejected_blacklist: 'Cartão bloqueado para esta transação. Entre em contato com seu banco.',
    cc_rejected_call_for_authorize: 'Pagamento não autorizado automaticamente. Ligue para o banco emissor para autorizar.',
    cc_rejected_card_disabled: 'Cartão inativo ou bloqueado. Entre em contato com o banco emissor.',
    cc_rejected_card_error: 'Erro ao processar o cartão. Tente novamente em alguns instantes.',
    cc_rejected_duplicated_payment: 'Pagamento duplicado detectado. Aguarde alguns minutos antes de tentar novamente.',
    cc_rejected_high_risk: 'Pagamento recusado por análise de risco do banco. Tente outro cartão ou use PIX.',
    cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente no cartão. Verifique com seu banco.',
    cc_rejected_invalid_installments: 'Número de parcelas não aceito por este cartão.',
    cc_rejected_max_attempts: 'Número máximo de tentativas excedido. Tente novamente mais tarde ou use outro cartão.',
    cc_rejected_other_reason: 'Banco emissor recusou a transação. Entre em contato com seu banco ou tente outro cartão.',
    cc_rejected_3ds_mandatory: 'Autenticação adicional 3D-Secure necessária. Tente novamente.',
    cc_rejected_3ds_challenge: 'Autenticação 3D-Secure não concluída. Tente novamente.',
    pending_contingency: 'Pagamento em contingência. Aguarde a confirmação do banco.',
    pending_review_manual: 'Pagamento em revisão manual. Você será notificado quando aprovado.',
};

/**
 * Returns the best human-readable error message for a MP payment failure.
 * Priority: statusDetail mapping > server error message > fallback
 */
function getMpErrorMessage(statusDetail?: string, serverError?: string): string {
    if (statusDetail && MP_STATUS_DETAIL_PT[statusDetail]) {
        return MP_STATUS_DETAIL_PT[statusDetail];
    }
    if (serverError && serverError.trim().length > 0) {
        return serverError;
    }
    return 'A cobrança foi recusada pelo banco. Tente novamente ou use outro cartão.';
}

export function UpgradeModal({ onClose, initialPlanId, initialBilling, locked = false, paidOnly = false, pixOnly = false, title, subtitle, showLogout = false }: UpgradeModalProps) {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);

    const { update: updateSession } = useSession();

    // MP device fingerprint — capturado assim que security.js carrega
    const [mpDeviceId, setMpDeviceId] = useState<string | undefined>(undefined);

    // Flow States
    const [flow, setFlow] = useState<'plans' | 'method' | 'card_form' | 'cvv_confirm' | 'pix' | 'boleto' | 'card_pending' | 'processing' | 'missing_info'>('plans');
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [billingType, setBillingType] = useState<BillingType>('monthly');
    /** Mensal/anual escolhido na tela de planos (antes de escolher o plano). */
    const [planBilling, setPlanBilling] = useState<BillingType>(initialBilling ?? 'monthly');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Helpers para precificação anual/mensal
    const getEffectiveMonthlyPrice = (plan: Plan | null, billing: BillingType): number => {
        if (!plan) return 0;
        // annualPrice é o valor TOTAL anual (ex.: R$ 7.188). Dividimos por 12 para mostrar o equivalente mensal.
        if (billing === 'annual' && plan.annualPrice && plan.annualPrice > 0) {
            return plan.annualPrice / 12;
        }
        return plan.price;
    };
    const getTotalChargeAmount = (plan: Plan | null, billing: BillingType): number => {
        if (!plan) return 0;
        // Anual: cobra annualPrice de uma vez. Mensal: cobra plan.price.
        if (billing === 'annual' && plan.annualPrice && plan.annualPrice > 0) {
            return plan.annualPrice;
        }
        return plan.price;
    };
    const formatBRL = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hasAnnualOption = (plan: Plan | null) => !!(plan && plan.annualPrice && plan.annualPrice > 0);
    const annualSavingsPct = (plan: Plan | null): number | null => {
        if (!plan || !plan.annualPrice || plan.annualPrice <= 0 || plan.price <= 0) return null;
        // Desconto = quanto o plano anual economiza por mês vs o plano mensal
        const monthlyEquiv = plan.annualPrice / 12;
        const save = Math.round(((plan.price - monthlyEquiv) / plan.price) * 100);
        return save > 0 ? save : null;
    };

    // PIX States
    const [pixData, setPixData] = useState<{ paymentId: number; qrCode: string; qrCodeBase64: string; amount: number } | null>(null);
    const [pixCopied, setPixCopied] = useState(false);
    const [pixPolling, setPixPolling] = useState(false);

    // Boleto States
    const [boletoData, setBoletoData] = useState<{ paymentId: number; boletoUrl: string | null; boletoBarcode: string | null; expiresAt: string | null; amount: number } | null>(null);
    const [boletoCopied, setBoletoCopied] = useState(false);
    const [boletoPolling, setBoletoPolling] = useState(false);

    // Card Pending — polling da assinatura até o Mercado Pago autorizar.
    const [cardPending, setCardPending] = useState<{ paymentId: string; pollingActive: boolean; elapsedSec: number } | null>(null);

    // Card States
    const [hasCard, setHasCard] = useState(false);
    const [cardLastFour, setCardLastFour] = useState('');
    const [cardBrand, setCardBrand] = useState('');
    const [cardMpCardId, setCardMpCardId] = useState<string>('');
    const [checkingCard, setCheckingCard] = useState(false);

    // Form
    const [cardInput, setCardInput] = useState({ number: '', expiry: '', holderName: '', cvv: '', cardType: 'credit' as 'credit' | 'debit' });
    const [cvvInput, setCvvInput] = useState('');

    useEffect(() => {
        // Obter os planos
        fetch('/api/admin/plans')
            .then(r => r.json())
            .then((data: Plan[]) => {
                // Plano de concessionária (repasse) não é vendido ao lojista.
                setPlans(Array.isArray(data) ? data.filter(p => p.active && (p as any).publico !== 'concessionaria') : []);
                setLoading(false);
            })
            .catch(() => {
                setError('Erro ao carregar planos.');
                setLoading(false);
            });
    }, []);

    // Auto-seleção quando o modal é aberto a partir de um link com ?plan=...
    // (ex.: usuário acabou de se cadastrar e foi redirecionado com plano já escolhido).
    const autoSelectedRef = useRef(false);
    useEffect(() => {
        if (autoSelectedRef.current) return;
        if (!initialPlanId || plans.length === 0) return;
        const targetPlans = paidOnly ? plans.filter(p => p.price > 0) : plans;
        const target = targetPlans.find(p => p.id === initialPlanId || (p as any)._id === initialPlanId);
        if (!target) return;
        autoSelectedRef.current = true;
        handleSelectPlan(target, initialBilling ?? 'monthly');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plans, initialPlanId, initialBilling, paidOnly]);

    // Injeta o MP SDK v2 + security.js (antifraude).
    // O SDK v2 expõe window.MercadoPago e, quando instanciado, gera
    // internamente o device fingerprint. O security.js complementa
    // adicionando identificação de sessão via cookie/header.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const injectAndCapture = () => {
            // Injeta security.js (se ainda não injetado)
            if (!document.getElementById('mp-security-js')) {
                const sec = document.createElement('script');
                sec.id = 'mp-security-js';
                sec.src = 'https://www.mercadopago.com/v2/security.js';
                sec.setAttribute('view', 'checkout');
                sec.async = true;
                document.head.appendChild(sec);
            }

            // Tenta capturar device session ID via SDK v2
            const tryCapture = () => {
                const MP = (window as any).MercadoPago;
                const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
                if (!MP || !publicKey) return false;
                try {
                    // MercadoPago SDK v2: instanciar gera o fingerprint
                    const mp = new MP(publicKey, { locale: 'pt-BR' });
                    // getSessionID() é o método correto da v2 (alguns builds usam getDeviceSessionId)
                    const id: string | undefined =
                        mp.getSessionID?.() ||
                        mp.getDeviceSessionId?.() ||
                        (window as any).MP_DEVICE_SESSION_ID;
                    if (typeof id === 'string' && id.length > 0) {
                        setMpDeviceId(id);
                        return true;
                    }
                } catch { /* SDK ainda inicializando */ }
                return false;
            };

            if (!tryCapture()) {
                // Retry até 15s para o SDK terminar de inicializar
                let attempts = 0;
                const poll = setInterval(() => {
                    if (tryCapture() || ++attempts >= 30) clearInterval(poll);
                }, 500);
            }
        };

        if (document.getElementById('mp-sdk-v2')) {
            // SDK já carregado — captura direto
            injectAndCapture();
        } else {
            // Injeta o SDK e aguarda o load
            const sdk = document.createElement('script');
            sdk.id = 'mp-sdk-v2';
            sdk.src = 'https://sdk.mercadopago.com/js/v2';
            sdk.async = true;
            sdk.onload = injectAndCapture;
            document.head.appendChild(sdk);
        }
    }, []);

    // Recupera o device_id para enviar na cobrança
    const getDeviceId = (): string | undefined => {
        if (mpDeviceId) return mpDeviceId;
        // Fallback: tenta capturar na hora (se SDK já inicializou)
        if (typeof window === 'undefined') return undefined;
        try {
            const MP = (window as any).MercadoPago;
            const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
            if (MP && publicKey) {
                const mp = new MP(publicKey, { locale: 'pt-BR' });
                const id: string | undefined = mp.getSessionID?.() || mp.getDeviceSessionId?.();
                if (typeof id === 'string' && id.length > 0) return id;
            }
        } catch { /* silencioso */ }
        return (window as any).MP_DEVICE_SESSION_ID || undefined;
    };

    // Tokeniza cartão salvo no browser via MP SDK v2.
    // Retorna `null` se o SDK não estiver disponível (SEM CARD disponível etc.) — fallback server.
    // LANÇA erro com message='cvv_invalid' se o SDK rejeitar especificamente o CVV —
    // o chamador deve mostrar erro de CVV em vez de fazer fallback server-side (que
    // perderia o device fingerprint e mascararia o erro real como cc_rejected_high_risk).
    const tokenizeSavedCardInBrowser = async (cvv: string): Promise<string | null> => {
        if (typeof window === 'undefined') return null;
        const MP = (window as any).MercadoPago;
        const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
        if (!MP || !publicKey || !cardMpCardId) return null;

        try {
            const mp = new MP(publicKey, { locale: 'pt-BR' });

            // Captura device ID da instância (mais confiável que o polling)
            const sessionId: string | undefined = mp.getSessionID?.() || mp.getDeviceSessionId?.();
            if (sessionId && !mpDeviceId) setMpDeviceId(sessionId);

            const tokenResp = await mp.createCardToken({
                cardId: cardMpCardId,
                securityCode: cvv,
            });
            if (typeof tokenResp?.id === 'string') return tokenResp.id;
            // Token criado mas sem ID — CVV pode ser inválido
            throw Object.assign(new Error('cvv_invalid'), { code: 'cvv_invalid' });
        } catch (err: any) {
            const msg: string = (err?.message || err?.cause?.[0]?.code || '').toLowerCase();
            const isCvvError =
                msg.includes('security') ||
                msg.includes('cvv') ||
                msg.includes('security_code') ||
                err?.code === 'cvv_invalid' ||
                // MP SDK causa de código 324 = invalid security code
                err?.cause?.some?.((c: any) => c.code === 324 || c.code === '324');

            if (isCvvError) {
                // Lança para o chamador tratar como erro de CVV (não fazer fallback)
                const cvvErr = new Error('cvv_invalid');
                (cvvErr as any).code = 'cvv_invalid';
                throw cvvErr;
            }

            // Falha de rede/SDK não relacionada ao CVV → fallback server-side
            console.warn('[UpgradeModal] tokenização browser falhou (não-CVV), tentando server:', err);
            return null;
        }
    };



    const fetchCardStatus = async () => {
        setCheckingCard(true);
        try {
            const res = await fetch('/api/user/save-card');
            const data = await res.json();
            if (data.hasCard) {
                setHasCard(true);
                setCardLastFour(data.lastFour);
                setCardBrand(data.brand);
                setCardMpCardId(data.mpCardId || '');
            } else {
                setHasCard(false);
                setCardMpCardId('');
            }
        } catch {
            setHasCard(false);
            setCardMpCardId('');
        } finally {
            setCheckingCard(false);
        }
    };

    const [missingInfoData, setMissingInfoData] = useState<Partial<UserProfileData>>({ address: { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zipCode: '' } as any });
    const [missingInfoError, setMissingInfoError] = useState('');
    const [cepLoading, setCepLoading] = useState(false);

    const handleSelectPlan = async (plan: Plan, nextBilling: BillingType = 'monthly') => {
        setSelectedPlan(plan);
        setBillingType(nextBilling);
        setError('');
        setFlow('processing');
        try {
            const profile = await getUserProfile();
            if (
                !profile?.cpf ||
                !validateCPF(profile.cpf) ||
                !profile?.phoneNumber ||
                !profile?.address?.street ||
                !profile?.address?.city ||
                !profile?.address?.zipCode
            ) {
                setMissingInfoData(profile || { address: { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zipCode: '' } as any });
                setFlow('missing_info');
            } else {
                fetchCardStatus();
                generatePixQR(plan, nextBilling);
            }
        } catch (e) {
            setError('Erro ao verificar perfil.');
            setFlow('plans');
        }
    };

    const handleSaveMissingInfo = async () => {
        if (!missingInfoData.cpf || !validateCPF(missingInfoData.cpf)) {
            setMissingInfoError('CPF inválido.');
            return;
        }
        if (!missingInfoData.phoneNumber) { setMissingInfoError('Telefone é obrigatório.'); return; }
        if (!missingInfoData.address?.zipCode) { setMissingInfoError('CEP é obrigatório.'); return; }
        if (!missingInfoData.address?.street) { setMissingInfoError('Rua é obrigatória.'); return; }
        if (!missingInfoData.address?.number) { setMissingInfoError('Número é obrigatório.'); return; }
        if (!missingInfoData.address?.neighborhood) { setMissingInfoError('Bairro é obrigatório.'); return; }
        if (!missingInfoData.address?.city) { setMissingInfoError('Cidade é obrigatória.'); return; }
        if (!missingInfoData.address?.state) { setMissingInfoError('Estado é obrigatório.'); return; }

        setFlow('processing');
        try {
            await updateUserProfile(missingInfoData);
            fetchCardStatus();
            if (selectedPlan) {
                generatePixQR(selectedPlan, billingType);
            } else {
                setFlow('method');
            }
        } catch {
            setMissingInfoError('Erro ao atualizar perfil.');
            setFlow('missing_info');
        }
    };

    const handleCepBlur = async (cep: string) => {
        const clean = cep.replace(/\D/g, '');
        if (clean.length !== 8) return;
        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
            const data = await res.json();
            if (!data.erro) {
                setMissingInfoData(prev => ({
                    ...prev,
                    address: {
                        ...prev.address!,
                        street: data.logradouro || prev.address?.street || '',
                        neighborhood: data.bairro || prev.address?.neighborhood || '',
                        city: data.localidade || prev.address?.city || '',
                        state: data.uf || prev.address?.state || '',
                    },
                }));
            }
        } catch { /* silently ignore */ }
        finally { setCepLoading(false); }
    };

    // Gera QR code PIX — chamado automaticamente ao selecionar plano
    const generatePixQR = async (plan: Plan, billing: 'monthly' | 'annual') => {
        setFlow('processing');
        setError('');
        setPixData(null);
        try {
            const res = await fetch('/api/checkout/pix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: plan.id, billingType: billing })
            });
            const data = await res.json();
            if (data.ok && data.qrCodeBase64) {
                setPixData({
                    paymentId: data.paymentId,
                    qrCode: data.qrCode,
                    qrCodeBase64: data.qrCodeBase64,
                    amount: data.amount,
                });
                setFlow('pix');
                startPixPolling(data.paymentId);
            } else {
                setError(data.error || 'Erro ao gerar PIX. Tente novamente.');
                setFlow('plans');
            }
        } catch {
            setError('Erro de conexão. Tente novamente.');
            setFlow('plans');
        }
    };

    const generateBoleto = async (plan: Plan, billing: 'monthly' | 'annual') => {
        setFlow('processing');
        setError('');
        setBoletoData(null);
        try {
            const res = await fetch('/api/checkout/boleto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: plan.id, billingType: billing })
            });
            const data = await res.json();
            if (data.ok && (data.boletoUrl || data.boletoBarcode)) {
                setBoletoData({
                    paymentId: data.paymentId,
                    boletoUrl: data.boletoUrl,
                    boletoBarcode: data.boletoBarcode,
                    expiresAt: data.expiresAt,
                    amount: data.amount,
                });
                setFlow('boleto');
                startBoletoPolling(data.paymentId);
            } else {
                setError(data.error || 'Erro ao gerar boleto. Tente novamente.');
                setFlow('plans');
            }
        } catch {
            setError('Erro de conexão. Tente novamente.');
            setFlow('plans');
        }
    };

    // Troca periodicidade no step PIX e regenera QR code
    const handlePixBillingChange = (newBilling: 'monthly' | 'annual') => {
        if (!selectedPlan) return;
        setBillingType(newBilling);
        generatePixQR(selectedPlan, newBilling);
    };

    // Fluxo PIX inline — mantido para compatibilidade (method step)
    const handlePixPayment = async () => {
        if (!selectedPlan) return;
        generatePixQR(selectedPlan, billingType);
    };

    const handleBoletoPayment = async () => {
        if (!selectedPlan) return;
        generateBoleto(selectedPlan, billingType);
    };

    // Polling para verificar se o PIX foi pago
    const startPixPolling = (paymentId: number) => {
        setPixPolling(true);
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/checkout/status/${paymentId}`);
                const data = await res.json();
                if (data.status === 'approved') {
                    clearInterval(interval);
                    setPixPolling(false);
                    setSuccessMessage('Pagamento PIX confirmado! Atualizando seu acesso...');
                    setFlow('processing');
                    setTimeout(async () => {
                        await updateSession({ profile: 'cliente', allowedProfiles: ['cliente'] });
                        window.location.href = '/dashboard/cliente';
                    }, 2500);
                }
            } catch { }
        }, 5000); // Verifica a cada 5 segundos

        // Parar polling após 30 min
        setTimeout(() => {
            clearInterval(interval);
            setPixPolling(false);
        }, 30 * 60 * 1000);
    };

    const startBoletoPolling = (paymentId: number) => {
        setBoletoPolling(true);
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/checkout/status/${paymentId}`);
                const data = await res.json();
                if (data.status === 'approved') {
                    clearInterval(interval);
                    setBoletoPolling(false);
                    setSuccessMessage('Boleto compensado! Atualizando seu acesso...');
                    setFlow('processing');
                    setTimeout(async () => {
                        await updateSession({ profile: 'cliente', allowedProfiles: ['cliente'] });
                        window.location.href = '/dashboard/cliente';
                    }, 2500);
                }
            } catch { }
        }, 10000);

        setTimeout(() => {
            clearInterval(interval);
            setBoletoPolling(false);
        }, 30 * 60 * 1000);
    };

    // Polling para verificar se a assinatura nativa do MP foi autorizada.
    const startSubscriptionPolling = (preapprovalId: string) => {
        setCardPending({ paymentId: preapprovalId, pollingActive: true, elapsedSec: 0 });

        const startedAt = Date.now();
        const interval = setInterval(async () => {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            setCardPending(prev => prev ? { ...prev, elapsedSec: elapsed } : prev);

            try {
                const res = await fetch(`/api/user/subscription/status/${encodeURIComponent(preapprovalId)}`);
                const data = await res.json();
                const s = data.status;

                if (s === 'approved') {
                    clearInterval(interval);
                    setCardPending(null);
                    setSuccessMessage('Pagamento Aprovado! Atualizando seu acesso...');
                    setTimeout(async () => {
                        await updateSession({ profile: 'cliente', allowedProfiles: ['cliente'] });
                        window.location.href = '/dashboard/cliente';
                    }, 2000);
                } else if (s === 'rejected' || s === 'cancelled' || s === 'canceled' || s === 'paused') {
                    clearInterval(interval);
                    setCardPending(null);
                    setError(data.error || 'A assinatura não foi autorizada. Tente outro cartão ou use PIX.');
                    setFlow('cvv_confirm');
                }
                // caso continue pending, segue o loop
            } catch { /* silencioso — rede instável, tenta de novo no próximo tick */ }
        }, 5000);

        // Encerra polling depois de 10 min (emissor pode demorar horas; a partir daí
        // confiamos no webhook — o usuário pode fechar e vai receber acesso quando aprovar).
        setTimeout(() => {
            clearInterval(interval);
            setCardPending(prev => prev ? { ...prev, pollingActive: false } : prev);
        }, 10 * 60 * 1000);
    };

    const handleCopyPix = () => {
        if (pixData?.qrCode) {
            navigator.clipboard.writeText(pixData.qrCode).then(() => {
                setPixCopied(true);
                setTimeout(() => setPixCopied(false), 3000);
            });
        }
    };

    const handleCopyBoleto = () => {
        const value = boletoData?.boletoBarcode || boletoData?.boletoUrl;
        if (!value) return;
        navigator.clipboard.writeText(value).then(() => {
            setBoletoCopied(true);
            setTimeout(() => setBoletoCopied(false), 3000);
        });
    };

    // Cobrar cartão salvo com CVV.
    // Preferimos tokenizar o cartão NO BROWSER via MP SDK v2 antes de mandar
    // para o backend — o token carrega device_id/IP reais do usuário, o que
    // reduz muito cc_rejected_high_risk. Se a tokenização no browser falhar
    // por CVV inválido, mostramos o erro sem fallback server-side (que perderia
    // o fingerprint e mascararia o erro como cc_rejected_high_risk).
    const handleChargeSavedCard = async () => {
        if (!selectedPlan) return;
        if (!cvvInput || cvvInput.length < 3) {
            setError('Informe o código de segurança (CVV).');
            return;
        }
        setFlow('processing');
        setError('');

        let browserToken: string | null = null;
        try {
            browserToken = await tokenizeSavedCardInBrowser(cvvInput);
        } catch (err: any) {
            // CVV rejeitado pelo SDK do MP → mostra erro de CVV imediatamente
            if (err?.code === 'cvv_invalid' || err?.message === 'cvv_invalid') {
                setError('Código de segurança (CVV) inválido. Verifique o código no verso do cartão.');
                setFlow('cvv_confirm');
                return;
            }
            // Outro erro do SDK → tenta o fallback server-side
            console.warn('[UpgradeModal] tokenização browser lançou erro inesperado:', err);
        }

        if (!browserToken) {
            setError('Não foi possível validar o cartão salvo. Cadastre o cartão novamente.');
            setFlow('card_form');
            return;
        }

        try {
            const res = await fetch('/api/user/subscription/card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planId: selectedPlan.id,
                    cardToken: browserToken || undefined,
                    billingType,
                    brand: cardBrand,
                    cardType: cardBrand.startsWith('deb') ? 'debit' : 'credit',
                    lastFour: cardLastFour,
                })
            });
            const data = await res.json();
            if (data.ok && data.status === 'approved') {
                setSuccessMessage('Assinatura ativada! Atualizando seu acesso...');
                setTimeout(async () => {
                    await updateSession({ profile: 'cliente', allowedProfiles: ['cliente'] });
                    window.location.href = '/dashboard/cliente';
                }, 2500);
            } else if (data.ok && data.pending) {
                if (data.redirectUrl) {
                    window.location.href = data.redirectUrl;
                    return;
                }
                setSuccessMessage('');
                setError('');
                setFlow('card_pending');
                if (data.preapprovalId) startSubscriptionPolling(String(data.preapprovalId));
            } else {
                setError(getMpErrorMessage(data.statusDetail, data.error));
                setFlow('cvv_confirm');
            }
        } catch {
            setError('Erro de conexão. A cobrança falhou.');
            setFlow('cvv_confirm');
        }
    };


    // Cria assinatura nativa do Mercado Pago com o token descartável do cartão.
    const handleSaveCard = async (formData: CardFormData) => {
        if (!selectedPlan) return;

        setFlow('processing');
        setError('');

        try {
            const subRes = await fetch('/api/user/subscription/card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planId: selectedPlan.id,
                    cardToken: formData.cardToken,
                    billingType,
                    holderName: formData.holderName,
                    cardType: formData.cardType,
                    cpf: formData.cpf,
                    brand: formData.brand,
                    lastFour: formData.lastFour,
                    expirationMonth: formData.expirationMonth,
                    expirationYear: formData.expirationYear,
                }),
            });
            const subData = await subRes.json();

            if (subData.ok && subData.status === 'approved') {
                setHasCard(true);
                setCardLastFour(formData.lastFour || '');
                setCardBrand(formData.brand || '');
                setSuccessMessage('Assinatura ativada! Atualizando seu acesso...');
                setTimeout(async () => {
                    await updateSession({ profile: 'cliente', allowedProfiles: ['cliente'] });
                    window.location.href = '/dashboard/cliente';
                }, 2500);
            } else if (subData.ok && subData.pending) {
                if (subData.redirectUrl) {
                    window.location.href = subData.redirectUrl;
                    return;
                }
                setSuccessMessage('');
                setError('');
                setFlow('card_pending');
                if (subData.preapprovalId) startSubscriptionPolling(String(subData.preapprovalId));
            } else {
                setError(getMpErrorMessage(subData.statusDetail, subData.error));
                setCvvInput('');
                setFlow('card_form');
            }
        } catch {
            setError('Falha na conexão de pagamento seguro.');
            setFlow('card_form');
        }
    };

    const visiblePlans = paidOnly ? plans.filter(p => p.price > 0) : plans;
    const monthlyPlans = visiblePlans.filter(p => p.type === 'monthly');
    const creditPlans = visiblePlans.filter(p => p.type === 'credits');

    const flowTitles: Record<string, string> = {
        plans: title || 'Desbloqueie o acesso completo',
        missing_info: 'Finalize seu perfil',
        method: 'Forma de pagamento',
        card_form: 'Dados do cartão',
        cvv_confirm: 'Confirmar pagamento',
        pix: 'Pague com PIX',
        boleto: 'Boleto bancário',
        card_pending: 'Pagamento em análise',
        processing: 'Processando...',
    };

    return (
        <AdminModal
            title={flowTitles[flow] ?? 'Planos'}
            subtitle={subtitle && flow === 'plans' ? subtitle : undefined}
            onClose={onClose}
            size={flow === 'plans' && monthlyPlans.length >= 3 ? 'xl' : 'lg'}
            dismissible={!locked}
            busy={flow === 'processing' || flow === 'card_pending'}
            bodyClassName={styles.body}
            footer={(showLogout || locked) ? (
                /* Modal trancado precisa de saída: quem não vai pagar agora
                   sai da conta em vez de ficar preso atrás do overlay. */
                <button
                    type="button"
                    className={modalStyles.secondary}
                    onClick={() => signOut({ callbackUrl: '/' })}
                >
                    Sair da conta
                </button>
            ) : undefined}
        >
            {error && <p className={styles.error} role="alert">{error}</p>}
            {successMessage && <p className={styles.success} role="status">{successMessage}</p>}

            {/* ETAPA 1: ESCOLHER O PLANO */}
            {flow === 'plans' && (
                <>
                    {loading ? (
                        <p className={styles.loading}>Carregando planos...</p>
                    ) : monthlyPlans.length === 0 ? (
                        <p className={styles.empty}>Nenhum plano disponível no momento.</p>
                    ) : (() => {
                        // Do mais acessível ao mais completo; o mais completo ganha destaque.
                        const ordenados = [...monthlyPlans].sort((a, b) => a.price - b.price);
                        const destaqueId = ordenados.length > 1 ? ordenados[ordenados.length - 1].id : null;
                        const temAnual = ordenados.some(p => hasAnnualOption(p));
                        const maiorEconomia = Math.max(0, ...ordenados.map(p => annualSavingsPct(p) || 0));
                        return (
                            <div className={styles.pricing}>
                                {temAnual && (
                                    <div className={styles.billingSwitch} role="group" aria-label="Forma de cobrança">
                                        <button type="button" aria-pressed={planBilling === 'monthly'} className={planBilling === 'monthly' ? styles.billingOn : ''} onClick={() => setPlanBilling('monthly')}>Mensal</button>
                                        <button type="button" aria-pressed={planBilling === 'annual'} className={planBilling === 'annual' ? styles.billingOn : ''} onClick={() => setPlanBilling('annual')}>
                                            Anual{maiorEconomia > 0 && <span className={styles.billingSave}>até {maiorEconomia}% off</span>}
                                        </button>
                                    </div>
                                )}

                                <div className={styles.pricingGrid} data-colunas={Math.min(ordenados.length, 3)}>
                                    {ordenados.map(plan => {
                                        const anual = planBilling === 'annual' && hasAnnualOption(plan);
                                        const { titulo, resumo } = dividirNomePlano(plan.name);
                                        const itens = itensDoPlano(plan.description);
                                        const destaque = plan.id === destaqueId;
                                        const economia = anual ? annualSavingsPct(plan) : null;
                                        return (
                                            <article key={plan.id} className={`${styles.pricingCard} ${destaque ? styles.pricingCardFeatured : ''}`}>
                                                {destaque && <span className={styles.pricingRibbon}>Mais completo</span>}
                                                <header className={styles.pricingHead}>
                                                    <h3 className={styles.pricingName}>{titulo}</h3>
                                                    {resumo && <p className={styles.pricingTagline}>{resumo}</p>}
                                                </header>

                                                <div className={styles.pricingPrice}>
                                                    <span className={styles.pricingCurrency}>R$</span>
                                                    <span className={styles.pricingValue}>{formatBRL(getEffectiveMonthlyPrice(plan, anual ? 'annual' : 'monthly'))}</span>
                                                    <span className={styles.pricingPeriod}>/mês</span>
                                                </div>
                                                <p className={styles.pricingNote}>
                                                    {anual
                                                        ? <>R$ {formatBRL(getTotalChargeAmount(plan, 'annual'))} cobrados por ano{economia ? <strong> · economia de {economia}%</strong> : null}</>
                                                        : 'Cobrança mensal'}
                                                </p>

                                                <button
                                                    type="button"
                                                    className={destaque ? styles.pricingCtaPrimary : styles.pricingCta}
                                                    onClick={() => handleSelectPlan(plan, anual ? 'annual' : 'monthly')}
                                                >
                                                    Assinar {titulo}
                                                </button>

                                                {itens.length > 0 && (
                                                    <ul className={styles.pricingFeatures}>
                                                        {itens.map(item => (
                                                            <li key={item}><Check size={16} aria-hidden="true" />{item}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>

                                <p className={styles.pricingFooter}>
                                    <ShieldCheck size={15} aria-hidden="true" />
                                    Pagamento processado pelo Mercado Pago{pixOnly ? ' via PIX' : ': PIX, boleto ou cartão'}.
                                </p>
                            </div>
                        );
                    })()}
                </>
            )}

            {/* DADOS OBRIGATÓRIOS PARA FATURAMENTO (MISSING_INFO) */}
            {flow === 'missing_info' && (
                <div className={styles.step}>
                    <p className={styles.stepIntro}>
                        Para emitir a cobrança, complete os dados de faturamento abaixo.
                    </p>

                    {missingInfoError && <p className={styles.error} role="alert">{missingInfoError}</p>}

                    <div className={styles.formGrid}>
                        <div className={`${modalStyles.field} ${styles.c3}`}>
                            <span>CPF</span>
                            <MaskedInput plain mask="cpf" value={missingInfoData.cpf || ''} onChange={(v: string) => setMissingInfoData(p => ({ ...p, cpf: v }))} placeholder="000.000.000-00" />
                        </div>
                        <div className={`${modalStyles.field} ${styles.c3}`}>
                            <span>Telefone</span>
                            <MaskedInput plain mask="phone" value={missingInfoData.phoneNumber || ''} onChange={(v: string) => setMissingInfoData(p => ({ ...p, phoneNumber: v }))} placeholder="(00) 00000-0000" />
                        </div>
                        <div className={`${modalStyles.field} ${styles.c2}`}>
                            <span>CEP {cepLoading && <span className={styles.hint}>buscando...</span>}</span>
                            <MaskedInput
                                plain
                                mask="cep"
                                value={missingInfoData.address?.zipCode || ''}
                                onChange={(v: string) => setMissingInfoData(p => ({ ...p, address: { ...p.address!, zipCode: v } }))}
                                onBlur={(v: string) => handleCepBlur(v)}
                                placeholder="00000-000"
                            />
                        </div>
                        <label className={`${modalStyles.field} ${styles.c4}`}>
                            Rua
                            <input type="text" value={missingInfoData.address?.street || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, street: e.target.value } }))} />
                        </label>
                        <label className={`${modalStyles.field} ${styles.c2}`}>
                            Número
                            <input type="text" value={missingInfoData.address?.number || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, number: e.target.value } }))} />
                        </label>
                        <label className={`${modalStyles.field} ${styles.c4}`}>
                            Complemento
                            <input type="text" value={missingInfoData.address?.complement || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, complement: e.target.value } }))} placeholder="Opcional" />
                        </label>
                        <label className={`${modalStyles.field} ${styles.c2}`}>
                            Bairro
                            <input type="text" value={missingInfoData.address?.neighborhood || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, neighborhood: e.target.value } }))} />
                        </label>
                        <label className={`${modalStyles.field} ${styles.c3}`}>
                            Cidade
                            <input type="text" value={missingInfoData.address?.city || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, city: e.target.value } }))} />
                        </label>
                        <label className={`${modalStyles.field} ${styles.c1}`}>
                            UF
                            <input type="text" maxLength={2} value={missingInfoData.address?.state || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, state: e.target.value.toUpperCase() } }))} placeholder="UF" />
                        </label>
                    </div>

                    <div className={styles.stepActions}>
                        <button type="button" className={styles.linkBack} onClick={() => setFlow('plans')}>
                            <ArrowLeft size={15} aria-hidden="true" /> Voltar aos planos
                        </button>
                        <button type="button" className={styles.btnPrimary} onClick={handleSaveMissingInfo}>
                            Salvar e continuar
                        </button>
                    </div>
                </div>
            )}

            {/* ETAPA 2: FORMA DE PAGAMENTO */}
            {flow === 'method' && selectedPlan && (
                <div className={styles.step}>
                    <div className={styles.summary}>
                        <span className={styles.summaryLabel}>{selectedPlan.name}</span>
                        <strong className={styles.summaryValue}>
                            R$ {formatBRL(getEffectiveMonthlyPrice(selectedPlan, billingType))}<small> /mês</small>
                        </strong>
                        <span className={styles.summaryNote}>
                            {billingType === 'annual'
                                ? <>Cobrança única de <strong>R$ {formatBRL(getTotalChargeAmount(selectedPlan, 'annual'))}</strong> por ano</>
                                : 'Cobrança mensal'}
                        </span>
                    </div>

                    {hasAnnualOption(selectedPlan) && (
                        <div className={styles.billingSwitch} role="group" aria-label="Periodicidade de cobrança">
                            <button type="button" aria-pressed={billingType === 'monthly'} className={billingType === 'monthly' ? styles.billingOn : ''} onClick={() => setBillingType('monthly')}>Mensal</button>
                            <button type="button" aria-pressed={billingType === 'annual'} className={billingType === 'annual' ? styles.billingOn : ''} onClick={() => setBillingType('annual')}>
                                Anual{annualSavingsPct(selectedPlan) && <span className={styles.billingSave}>-{annualSavingsPct(selectedPlan)}%</span>}
                            </button>
                        </div>
                    )}

                    <div className={styles.methodList}>
                        <button
                            type="button"
                            className={styles.methodOption}
                            onClick={() => {
                                if (hasCard) { setCvvInput(''); setError(''); setFlow('cvv_confirm'); }
                                else { setFlow('card_form'); }
                            }}
                            disabled={checkingCard}
                        >
                            <span className={styles.methodIcon}><CreditCard size={20} aria-hidden="true" /></span>
                            <span className={styles.methodText}>
                                <strong>{billingType === 'annual' ? 'Cartão de crédito, anual' : 'Cartão de crédito, recorrente'}</strong>
                                <span>
                                    {checkingCard ? 'Verificando cartão salvo...' :
                                        hasCard
                                            ? `Cobrar R$ ${formatBRL(getTotalChargeAmount(selectedPlan, billingType))} no cartão final ${cardLastFour}`
                                            : (billingType === 'annual' ? 'Pagamento único: 12 meses de acesso' : 'Débito automático todo mês, sem interrupção')}
                                </span>
                            </span>
                            <ChevronRight size={18} aria-hidden="true" className={styles.methodArrow} />
                        </button>

                        <button type="button" className={styles.methodOption} onClick={handlePixPayment}>
                            <span className={styles.methodIcon}><QrCode size={20} aria-hidden="true" /></span>
                            <span className={styles.methodText}>
                                <strong>PIX</strong>
                                <span>QR Code instantâneo, pague pelo app do banco</span>
                            </span>
                            <ChevronRight size={18} aria-hidden="true" className={styles.methodArrow} />
                        </button>

                        <button type="button" className={styles.methodOption} onClick={handleBoletoPayment}>
                            <span className={styles.methodIcon}><Barcode size={20} aria-hidden="true" /></span>
                            <span className={styles.methodText}>
                                <strong>Boleto bancário</strong>
                                <span>Pague pelo banco ou lotérica; libera após a compensação</span>
                            </span>
                            <ChevronRight size={18} aria-hidden="true" className={styles.methodArrow} />
                        </button>
                    </div>

                    <button type="button" className={styles.linkBack} onClick={() => setFlow('plans')}>
                        <ArrowLeft size={15} aria-hidden="true" /> Voltar aos planos
                    </button>
                </div>
            )}

            {/* ETAPA 3: CADASTRAR CARTÃO */}
            {flow === 'card_form' && selectedPlan && (
                <CardPaymentForm
                    amount={getTotalChargeAmount(selectedPlan, billingType)}
                    billingType={billingType}
                    error={error}
                    submitting={false}
                    onBack={() => { setError(''); pixData ? setFlow('pix') : setFlow('plans'); }}
                    onSubmit={handleSaveCard}
                />
            )}

            {/* ETAPA CVV: CONFIRMAR O CARTÃO SALVO */}
            {flow === 'cvv_confirm' && selectedPlan && (
                <div className={styles.step}>
                    <p className={styles.stepIntro}>
                        {hasCard
                            ? <>Informe o código de segurança do cartão final <strong>{cardLastFour}</strong>.</>
                            : 'Informe o código de segurança (CVV) do seu cartão.'}
                    </p>

                    <label className={styles.cvvField}>
                        CVV
                        <input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            value={cvvInput}
                            onChange={e => {
                                setCvvInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                                setError('');
                            }}
                            placeholder="•••"
                            autoFocus
                        />
                    </label>

                    <button type="button" className={styles.btnPrimary} onClick={handleChargeSavedCard} disabled={cvvInput.length < 3}>
                        Pagar R$ {formatBRL(getTotalChargeAmount(selectedPlan, billingType))} ({billingType === 'annual' ? 'anual' : 'mensal'})
                    </button>

                    <div className={styles.stepActions}>
                        <button type="button" className={styles.linkBack} onClick={() => pixData ? setFlow('pix') : setFlow('plans')}>
                            <ArrowLeft size={15} aria-hidden="true" /> Voltar
                        </button>
                        <button type="button" className={styles.btnSecondary} onClick={() => { setCvvInput(''); setError(''); setFlow('card_form'); }}>
                            Usar outro cartão
                        </button>
                    </div>
                </div>
            )}

            {/* ETAPA PIX: QR CODE */}
            {flow === 'pix' && pixData && selectedPlan && (
                <div className={`${styles.step} ${styles.stepCenter}`}>
                    <div className={styles.summary}>
                        <span className={styles.summaryLabel}>{selectedPlan.name}</span>
                        <strong className={styles.summaryValue}>R$ {pixData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </div>

                    {hasAnnualOption(selectedPlan) && (
                        <div className={styles.billingSwitch} role="group" aria-label="Periodicidade">
                            {(['monthly', 'annual'] as const).map(b => (
                                <button key={b} type="button" aria-pressed={billingType === b} className={billingType === b ? styles.billingOn : ''} onClick={() => handlePixBillingChange(b)}>
                                    {b === 'monthly' ? 'Mensal' : 'Anual'}
                                    {b === 'annual' && annualSavingsPct(selectedPlan) && <span className={styles.billingSave}>-{annualSavingsPct(selectedPlan)}%</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Fundo branco fixo: o leitor do banco precisa de contraste para ler o código. */}
                    <div className={styles.qrFrame}>
                        <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" width={200} height={200} />
                    </div>
                    <p className={styles.hint}>Escaneie com o app do seu banco. A aprovação é imediata.</p>

                    <div className={styles.copyRow}>
                        <input type="text" readOnly value={pixData.qrCode} aria-label="Código PIX copia e cola" />
                        <button type="button" className={styles.btnSecondary} data-copiado={pixCopied || undefined} onClick={handleCopyPix}>
                            {pixCopied ? <><Check size={15} aria-hidden="true" /> Copiado</> : <><Copy size={15} aria-hidden="true" /> Copiar</>}
                        </button>
                    </div>

                    {pixPolling && (
                        <p className={styles.waiting} role="status"><Loader2 size={15} className={styles.spin} aria-hidden="true" /> Aguardando a confirmação do pagamento...</p>
                    )}

                    {!pixOnly && (
                        <div className={styles.altMethods}>
                            <span>Prefere outra forma?</span>
                            <button
                                type="button"
                                className={styles.chip}
                                onClick={() => {
                                    if (hasCard) { setCvvInput(''); setError(''); setFlow('cvv_confirm'); }
                                    else { setFlow('card_form'); }
                                }}
                                disabled={checkingCard}
                            >
                                <CreditCard size={14} aria-hidden="true" /> Cartão{checkingCard ? '...' : ''}
                            </button>
                            <button type="button" className={styles.chip} onClick={handleBoletoPayment}>
                                <Barcode size={14} aria-hidden="true" /> Boleto
                            </button>
                        </div>
                    )}

                    {!locked && (
                        <button type="button" className={styles.linkBack} onClick={() => { setFlow('plans'); setPixData(null); }}>
                            <ArrowLeft size={15} aria-hidden="true" /> Voltar aos planos
                        </button>
                    )}
                </div>
            )}

            {/* ETAPA BOLETO */}
            {flow === 'boleto' && boletoData && selectedPlan && (
                <div className={`${styles.step} ${styles.stepCenter}`}>
                    <div className={styles.summary}>
                        <span className={styles.summaryLabel}>{selectedPlan.name}</span>
                        <strong className={styles.summaryValue}>R$ {boletoData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        {boletoData.expiresAt && <span className={styles.summaryNote}>Vence em {new Date(boletoData.expiresAt).toLocaleDateString('pt-BR')}</span>}
                    </div>

                    {boletoData.boletoUrl && (
                        <a href={boletoData.boletoUrl} target="_blank" rel="noreferrer" className={styles.btnPrimary}>
                            <ExternalLink size={16} aria-hidden="true" /> Abrir boleto
                        </a>
                    )}

                    <div className={styles.copyRow}>
                        <input type="text" readOnly value={boletoData.boletoBarcode || boletoData.boletoUrl || ''} aria-label="Linha digitável do boleto" />
                        <button type="button" className={styles.btnSecondary} data-copiado={boletoCopied || undefined} onClick={handleCopyBoleto}>
                            {boletoCopied ? <><Check size={15} aria-hidden="true" /> Copiado</> : <><Copy size={15} aria-hidden="true" /> Copiar</>}
                        </button>
                    </div>

                    {boletoPolling && (
                        <p className={styles.waiting} role="status"><Loader2 size={15} className={styles.spin} aria-hidden="true" /> Aguardando a compensação do boleto...</p>
                    )}

                    <p className={styles.hint}>Depois da compensação pelo Mercado Pago, seu acesso é renovado automaticamente.</p>

                    <button type="button" className={styles.linkBack} onClick={() => { setFlow('pix'); setBoletoData(null); }}>
                        <ArrowLeft size={15} aria-hidden="true" /> Voltar ao PIX
                    </button>
                </div>
            )}

            {/* ETAPA CARD_PENDING: cobrança aceita, emissor analisando.
                 Polling a cada 5s. Se aprovar, redireciona. Se recusar, volta ao método.
                 O usuário pode fechar: o webhook libera o acesso quando o MP confirmar. */}
            {flow === 'card_pending' && (
                <div className={`${styles.step} ${styles.stepCenter}`}>
                    <Loader2 size={44} className={`${styles.spin} ${styles.bigSpinner}`} aria-hidden="true" />
                    <h3 className={styles.stepTitle}>Assinatura em ativação</h3>
                    <p className={styles.stepIntro}>
                        O Mercado Pago está autorizando a cobrança recorrente no cartão. Verificamos sozinhos e
                        liberamos seu acesso assim que a assinatura for autorizada.
                    </p>

                    {cardPending && (
                        <p className={styles.waiting} role="status">
                            {cardPending.pollingActive
                                ? <><span className={styles.pulseDot} aria-hidden="true" /> Aguardando confirmação ({Math.floor(cardPending.elapsedSec / 60)}m{String(cardPending.elapsedSec % 60).padStart(2, '0')}s)</>
                                : 'A autorização ainda não foi concluída. Você pode fechar esta janela e tentar mais tarde.'}
                        </p>
                    )}

                    {!locked && (
                        <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
                    )}
                </div>
            )}

            {flow === 'processing' && (
                <div className={`${styles.step} ${styles.stepCenter}`} role="status" aria-label="Processando pagamento...">
                    <Loader2 size={40} className={`${styles.spin} ${styles.bigSpinner}`} aria-hidden="true" />
                </div>
            )}
        </AdminModal>
    );
}
