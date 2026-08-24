'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import styles from './UpgradeModal.module.css';
import { MaskedInput } from '@/components/operator/MaskedInput';
import { CardPaymentForm, type CardFormData } from '@/components/operator/CardPaymentForm';
import { getUserProfile, updateUserProfile, UserProfileData } from '@/app/dashboard/profile/actions';
import { validateCPF } from '@/lib/utils/cpf';

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
    const formatBRL = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
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
                setPlans(Array.isArray(data) ? data.filter(p => p.active) : []);
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

    return (
        <div className={styles.overlay} onClick={e => { if (!locked && e.target === e.currentTarget && flow !== 'processing' && flow !== 'card_pending') onClose(); }}>
            <div className={styles.modal}>

                <div className={styles.header}>
                    {!locked && flow !== 'processing' && <button className={styles.closeBtn} onClick={onClose}>✕</button>}
                    {flow === 'plans' && <h2 className={styles.headerTitle}>{title || '🚀 Desbloqueie o acesso completo'}</h2>}
                    {flow === 'missing_info' && <h2 className={styles.headerTitle}>⚠️ Finalize seu Perfil</h2>}
                    {flow === 'method' && <h2 className={styles.headerTitle}>💳 Forma de Pagamento</h2>}
                    {flow === 'card_form' && <h2 className={styles.headerTitle}>🔒 Dados do Cartão</h2>}
                    {flow === 'pix' && <h2 className={styles.headerTitle}>📱 Pague com PIX</h2>}
                    {flow === 'boleto' && <h2 className={styles.headerTitle}>Boleto bancário</h2>}
                    {flow === 'card_pending' && <h2 className={styles.headerTitle}>⏳ Pagamento em Análise</h2>}
                    {flow === 'processing' && <h2 className={styles.headerTitle}>Processando...</h2>}
                    {subtitle && flow === 'plans' && <p className={styles.headerSubtitle}>{subtitle}</p>}
                    {/* Modal trancado precisa de saída: quem não vai pagar agora
                        sai da conta em vez de ficar preso atrás do overlay. */}
                    {(showLogout || locked) && (
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            style={{
                                marginTop: '1rem',
                                padding: '8px 16px',
                                background: 'transparent',
                                border: '1px solid var(--color-text-muted)',
                                color: 'var(--color-text-muted)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 0, 0, 0.1)';
                                e.currentTarget.style.color = '#ef4444';
                                e.currentTarget.style.borderColor = '#ef4444';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--color-text-muted)';
                                e.currentTarget.style.borderColor = 'var(--color-text-muted)';
                            }}
                        >
                            Sair / Logout
                        </button>
                    )}
                </div>

                <div className={styles.body}>
                    {error && <p className={styles.error} style={{ color: 'red', marginBottom: '1rem', textAlign: 'center', background: 'rgba(255,0,0,0.1)', padding: '8px', borderRadius: '6px' }}>{error}</p>}
                    {successMessage && <p style={{ color: 'green', marginBottom: '1rem', textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>✅ {successMessage}</p>}

                    {/* ETAPA 1: ESCOLHER O PLANO */}
                    {flow === 'plans' && (
                        <>
                            {loading ? (
                                <p className={styles.loading}>Carregando planos...</p>
                            ) : monthlyPlans.length === 0 ? (
                                <p className={styles.empty}>Nenhum plano disponível no momento.</p>
                            ) : (
                                <>
                                    {monthlyPlans.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {monthlyPlans.map(plan => (
                                                <div key={plan.id} className={styles.monthlyCard}>
                                                    <div>
                                                        <div className={styles.planName}>{plan.name}</div>
                                                        {plan.description && <div className={styles.planDesc}>{plan.description}</div>}
                                                    </div>
                                                    <div className={styles.planPriceBlock}>
                                                        <span className={styles.planPrice}>
                                                            R$ {plan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / Mês
                                                        </span>
                                                        <button className={styles.btnPrimary} onClick={() => handleSelectPlan(plan)}>
                                                            Escolher este
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {/* ETAPA DE CONFIRMAÇÃO DE DADOS BÁSICOS (MISSING_INFO) */}
                    {flow === 'missing_info' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
                                Para continuar com a assinatura, precisamos que você complete os seguintes dados obrigatórios para faturamento:
                            </p>

                            {missingInfoError && (
                                <p style={{ color: 'red', textAlign: 'center', fontSize: '0.9rem', marginBottom: '10px', padding: '8px', background: 'rgba(255,0,0,0.1)', borderRadius: '6px' }}>
                                    {missingInfoError}
                                </p>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>CPF</label>
                                    <MaskedInput
                                        mask="cpf"
                                        value={missingInfoData.cpf || ''}
                                        onChange={(v: string) => setMissingInfoData(p => ({ ...p, cpf: v }))}
                                        placeholder="000.000.000-00"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Telefone</label>
                                    <MaskedInput
                                        mask="phone"
                                        value={missingInfoData.phoneNumber || ''}
                                        onChange={(v: string) => setMissingInfoData(p => ({ ...p, phoneNumber: v }))}
                                        placeholder="(00) 00000-0000"
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>CEP {cepLoading && <span style={{ fontSize: '0.75rem', color: '#999' }}>(buscando...)</span>}</label>
                                        <MaskedInput
                                            mask="cep"
                                            value={missingInfoData.address?.zipCode || ''}
                                            onChange={(v: string) => setMissingInfoData(p => ({ ...p, address: { ...p.address!, zipCode: v } }))}
                                            onBlur={(v: string) => handleCepBlur(v)}
                                            placeholder="00000-000"
                                        />
                                    </div>
                                    <div style={{ flex: 2 }}>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Rua</label>
                                        <input type="text" value={missingInfoData.address?.street || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, street: e.target.value } }))} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Número</label>
                                        <input type="text" value={missingInfoData.address?.number || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, number: e.target.value } }))} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Complemento</label>
                                        <input type="text" value={missingInfoData.address?.complement || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, complement: e.target.value } }))} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: 'var(--color-surface)', color: 'var(--color-text)' }} placeholder="Opcional" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Bairro</label>
                                        <input type="text" value={missingInfoData.address?.neighborhood || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, neighborhood: e.target.value } }))} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Cidade</label>
                                        <input type="text" value={missingInfoData.address?.city || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, city: e.target.value } }))} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                    </div>
                                    <div style={{ flex: 0.5 }}>
                                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>UF</label>
                                        <input type="text" maxLength={2} value={missingInfoData.address?.state || ''} onChange={e => setMissingInfoData(p => ({ ...p, address: { ...p.address!, state: e.target.value.toUpperCase() } }))} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: 'var(--color-surface)', color: 'var(--color-text)' }} placeholder="UF" />
                                    </div>
                                </div>
                            </div>

                            <button className={styles.btnPrimary} style={{ marginTop: '10px', padding: '14px', backgroundColor: '#3b82f6' }} onClick={handleSaveMissingInfo}>
                                Salvar e Continuar
                            </button>

                            <button className={styles.btnSecondary} onClick={() => setFlow('plans')} style={{ border: 'none', background: 'transparent', color: '#666' }}>
                                ← Voltar aos Planos
                            </button>
                        </div>
                    )}

                    {/* ETAPA 2: ESCOLHER O MÉTODO DE PAGAMENTO (Auto-Renovação vs Pix) */}
                    {flow === 'method' && selectedPlan && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                                Você escolheu o <strong>{selectedPlan.name}</strong>.
                            </p>

                            {/* Toggle Mensal / Anual — só aparece se o plano tiver annualPrice configurado */}
                            {hasAnnualOption(selectedPlan) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '0.25rem' }}>
                                    <div
                                        role="tablist"
                                        aria-label="Periodicidade de cobrança"
                                        style={{
                                            display: 'flex',
                                            background: 'var(--color-surface)',
                                            border: '1px solid #444',
                                            borderRadius: '10px',
                                            padding: '4px',
                                            gap: '4px',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={billingType === 'monthly'}
                                            onClick={() => setBillingType('monthly')}
                                            style={{
                                                flex: 1,
                                                padding: '10px 12px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: '0.95rem',
                                                fontWeight: billingType === 'monthly' ? 700 : 500,
                                                color: billingType === 'monthly' ? '#fff' : 'var(--color-text-muted)',
                                                background: billingType === 'monthly' ? '#3b82f6' : 'transparent',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            Mensal
                                        </button>
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={billingType === 'annual'}
                                            onClick={() => setBillingType('annual')}
                                            style={{
                                                flex: 1,
                                                padding: '10px 12px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: '0.95rem',
                                                fontWeight: billingType === 'annual' ? 700 : 500,
                                                color: billingType === 'annual' ? '#fff' : 'var(--color-text-muted)',
                                                background: billingType === 'annual' ? '#10b981' : 'transparent',
                                                transition: 'all 0.15s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                            }}
                                        >
                                            Anual
                                            {annualSavingsPct(selectedPlan) && (
                                                <span
                                                    style={{
                                                        background: billingType === 'annual' ? 'rgba(255,255,255,0.22)' : 'rgba(16,185,129,0.18)',
                                                        color: billingType === 'annual' ? '#fff' : '#10b981',
                                                        fontSize: '0.72rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '999px',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    -{annualSavingsPct(selectedPlan)}%
                                                </span>
                                            )}
                                        </button>
                                    </div>

                                    {/* Resumo de preço conforme a periodicidade */}
                                    <div
                                        style={{
                                            textAlign: 'center',
                                            background: 'rgba(59,130,246,0.08)',
                                            border: '1px solid rgba(59,130,246,0.25)',
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                        }}
                                    >
                                        <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                                            R$ {formatBRL(getEffectiveMonthlyPrice(selectedPlan, billingType))} <span style={{ fontSize: '0.85rem', opacity: 0.75, fontWeight: 500 }}>/ mês</span>
                                        </div>
                                        {billingType === 'annual' ? (
                                            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>
                                                Cobrança única de <strong>R$ {formatBRL(getTotalChargeAmount(selectedPlan, 'annual'))}</strong> no cartão · renovação anual
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>
                                                Cobrança mensal recorrente
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!hasAnnualOption(selectedPlan) && (
                                <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.95rem', marginTop: 0 }}>
                                    Valor: <strong>R$ {formatBRL(selectedPlan.price)}</strong> / mês
                                </p>
                            )}

                            <button
                                className={styles.btnPrimary}
                                style={{ padding: '16px', fontSize: '1.05rem', backgroundColor: '#3b82f6', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                onClick={() => {
                                    if (hasCard) { setCvvInput(''); setError(''); setFlow('cvv_confirm'); }
                                    else { setFlow('card_form'); }
                                }}
                                disabled={checkingCard}
                            >
                                <span>💳 {billingType === 'annual' ? 'Assinatura Anual no Cartão' : 'Assinatura no Cartão de Crédito'}</span>
                                <span style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '4px' }}>
                                    {checkingCard ? 'Verificando...' :
                                        hasCard
                                            ? `(Cobrar R$ ${formatBRL(getTotalChargeAmount(selectedPlan, billingType))} no Cartão final •••• ${cardLastFour})`
                                            : (billingType === 'annual'
                                                ? 'Pagamento único anual — 12 meses de acesso'
                                                : 'Débito automático mensal sem interrupções')}
                                </span>
                            </button>

                            <button
                                className={styles.btnSecondary}
                                style={{ padding: '16px', fontSize: '1.05rem', border: '2px solid #10b981', color: '#10b981', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                onClick={handlePixPayment}
                            >
                                <span>⚡ Pagar com PIX</span>
                                <span style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '4px' }}>QR Code instantâneo — pague pelo app do banco</span>
                            </button>

                            <button
                                className={styles.btnSecondary}
                                style={{ padding: '16px', fontSize: '1.05rem', border: '2px solid #64748b', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                onClick={handleBoletoPayment}
                            >
                                <span>Boleto bancário</span>
                                <span style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '4px' }}>Gere o boleto e pague pelo banco ou lotérica</span>
                            </button>

                            <button className={styles.btnSecondary} onClick={() => setFlow('plans')} style={{ border: 'none', background: 'transparent', color: '#666' }}>
                                ← Voltar aos Planos
                            </button>
                        </div>
                    )}


                    {/* ETAPA 3: CADASTRAR CARTÃO — novo formulário premium */}
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

                    {/* ETAPA CVV: CONFIRMAR CVV PARA PROCESSAR PAGAMENTO */}
                    {flow === 'cvv_confirm' && selectedPlan && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ textAlign: 'center', fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--color-text)' }}>
                                {hasCard
                                    ? <>Informe o CVV do cartão <strong>•••• {cardLastFour}</strong></>
                                    : 'Informe o código de segurança (CVV) do seu cartão'
                                }
                            </p>

                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <div style={{ width: '160px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>CVV</label>
                                    <input
                                        type="text"
                                        maxLength={4}
                                        value={cvvInput}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                            setCvvInput(val);
                                            setError('');
                                        }}
                                        style={{
                                            width: '100%', padding: '14px', borderRadius: '8px',
                                            border: '2px solid #3b82f6', background: 'var(--color-surface)',
                                            color: 'var(--color-text)', fontSize: '1.3rem', textAlign: 'center',
                                            letterSpacing: '8px', fontWeight: 700,
                                        }}
                                        placeholder="•••"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <button
                                className={styles.btnPrimary}
                                style={{ padding: '14px', backgroundColor: '#10b981', fontSize: '1rem' }}
                                onClick={handleChargeSavedCard}
                                disabled={cvvInput.length < 3}
                            >
                                🔒 Pagar R$ {formatBRL(getTotalChargeAmount(selectedPlan, billingType))}
                                <span style={{ fontSize: '0.78rem', opacity: 0.85, fontWeight: 500, marginLeft: 6 }}>
                                    ({billingType === 'annual' ? 'Anual' : 'Mensal'})
                                </span>
                            </button>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <button className={styles.btnSecondary} onClick={() => pixData ? setFlow('pix') : setFlow('plans')} style={{ border: 'none', background: 'transparent', color: '#666', flex: 1, textAlign: 'left' }}>
                                    ← Voltar
                                </button>
                                <button
                                    className={styles.btnSecondary}
                                    onClick={() => { setCvvInput(''); setError(''); setFlow('card_form'); }}
                                    style={{ border: '1px solid #444', background: 'transparent', color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                    💳 Trocar cartão
                                </button>
                            </div>
                        </div>
                    )}


                    {/* ETAPA PIX: QR CODE — Material Design */}
                    {flow === 'pix' && pixData && selectedPlan && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>

                            {/* Plan name */}
                            <p style={{ margin: '0 0 2px 0', fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                                {selectedPlan.name}
                            </p>

                            {/* Amount */}
                            <p style={{ margin: '0 0 16px 0', fontSize: '2rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
                                R$ {pixData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>

                            {/* Billing toggle — só se plano tiver opção anual */}
                            {hasAnnualOption(selectedPlan) && (
                                <div
                                    role="tablist"
                                    aria-label="Periodicidade"
                                    style={{
                                        display: 'flex',
                                        background: 'var(--color-surface)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        padding: '3px',
                                        gap: '3px',
                                        marginBottom: '16px',
                                        width: '100%',
                                    }}
                                >
                                    {(['monthly', 'annual'] as const).map(b => (
                                        <button
                                            key={b}
                                            type="button"
                                            role="tab"
                                            aria-selected={billingType === b}
                                            onClick={() => handlePixBillingChange(b)}
                                            style={{
                                                flex: 1,
                                                padding: '8px 10px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                fontWeight: billingType === b ? 700 : 500,
                                                color: billingType === b ? '#fff' : 'var(--color-text-muted)',
                                                background: billingType === b ? (b === 'annual' ? '#10b981' : '#1a73e8') : 'transparent',
                                                transition: 'all 0.15s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '5px',
                                            }}
                                        >
                                            {b === 'monthly' ? 'Mensal' : 'Anual'}
                                            {b === 'annual' && annualSavingsPct(selectedPlan) && (
                                                <span style={{
                                                    background: billingType === 'annual' ? 'rgba(255,255,255,0.2)' : 'rgba(16,185,129,0.2)',
                                                    color: billingType === 'annual' ? '#fff' : '#10b981',
                                                    fontSize: '0.68rem',
                                                    padding: '1px 6px',
                                                    borderRadius: '999px',
                                                    fontWeight: 700,
                                                }}>-{annualSavingsPct(selectedPlan)}%</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* QR Code card */}
                            <div style={{
                                background: '#fff',
                                borderRadius: '16px',
                                padding: '18px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                                marginBottom: '12px',
                                display: 'inline-block',
                            }}>
                                <img
                                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                                    alt="QR Code PIX"
                                    style={{ width: '200px', height: '200px', display: 'block' }}
                                />
                            </div>

                            {/* PIX logo + label */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                                <span style={{ fontSize: '1.1rem' }}>⚡</span>
                                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                                    Escaneie com o app do seu banco · aprovação imediata
                                </span>
                            </div>

                            {/* Copy code row */}
                            <div style={{ width: '100%', display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                <input
                                    type="text"
                                    readOnly
                                    value={pixData.qrCode}
                                    style={{
                                        flex: 1,
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        background: 'var(--color-surface)',
                                        color: 'var(--color-text-muted)',
                                        fontSize: '0.68rem',
                                        textOverflow: 'ellipsis',
                                        minWidth: 0,
                                    }}
                                />
                                <button
                                    onClick={handleCopyPix}
                                    style={{
                                        padding: '9px 18px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: pixCopied ? '#10b981' : '#1a73e8',
                                        color: '#fff',
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        transition: 'background 0.2s',
                                        letterSpacing: '0.02em',
                                    }}
                                >
                                    {pixCopied ? '✓ Copiado' : 'Copiar'}
                                </button>
                            </div>

                            {/* Polling indicator */}
                            {pixPolling && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a73e8', fontSize: '0.82rem', marginBottom: '10px' }}>
                                    <div style={{ width: '14px', height: '14px', border: '2px solid #1a73e8', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                    Aguardando confirmação do pagamento...
                                </div>
                            )}

                            {/* Divider */}
                            <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.08)', margin: '6px 0 14px 0' }} />

                            {!pixOnly && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '6px' }}>
                                    <button
                                        onClick={() => {
                                            if (hasCard) { setCvvInput(''); setError(''); setFlow('cvv_confirm'); }
                                            else { setFlow('card_form'); }
                                        }}
                                        disabled={checkingCard}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid rgba(26,115,232,0.5)',
                                            borderRadius: '20px',
                                            color: '#1a73e8',
                                            fontSize: '0.78rem',
                                            padding: '6px 18px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            letterSpacing: '0.02em',
                                        }}
                                    >
                                        💳 Pagar com cartão
                                        {checkingCard && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>...</span>}
                                    </button>
                                    <button
                                        onClick={handleBoletoPayment}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid rgba(148,163,184,0.5)',
                                            borderRadius: '20px',
                                            color: '#94a3b8',
                                            fontSize: '0.78rem',
                                            padding: '6px 18px',
                                            cursor: 'pointer',
                                            letterSpacing: '0.02em',
                                        }}
                                    >
                                        Boleto
                                    </button>
                                </div>
                            )}

                            {!locked && (
                                <button
                                    onClick={() => { setFlow('plans'); setPixData(null); }}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.75rem', cursor: 'pointer', padding: '4px 8px' }}
                                >
                                    ← Voltar aos planos
                                </button>
                            )}

                            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {/* ETAPA BOLETO */}
                    {flow === 'boleto' && boletoData && selectedPlan && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                                {selectedPlan.name}
                            </p>
                            <p style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
                                R$ {boletoData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>

                            {boletoData.expiresAt && (
                                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                    Vencimento: {new Date(boletoData.expiresAt).toLocaleDateString('pt-BR')}
                                </p>
                            )}

                            {boletoData.boletoUrl && (
                                <a
                                    href={boletoData.boletoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.btnPrimary}
                                    style={{ textDecoration: 'none', textAlign: 'center', width: '100%', padding: '14px', backgroundColor: '#2563eb' }}
                                >
                                    Abrir boleto
                                </a>
                            )}

                            <div style={{ width: '100%', display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    readOnly
                                    value={boletoData.boletoBarcode || boletoData.boletoUrl || ''}
                                    style={{
                                        flex: 1,
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        background: 'var(--color-surface)',
                                        color: 'var(--color-text-muted)',
                                        fontSize: '0.68rem',
                                        textOverflow: 'ellipsis',
                                        minWidth: 0,
                                    }}
                                />
                                <button
                                    onClick={handleCopyBoleto}
                                    style={{
                                        padding: '9px 18px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: boletoCopied ? '#10b981' : '#64748b',
                                        color: '#fff',
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {boletoCopied ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>

                            {boletoPolling && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.82rem' }}>
                                    <div style={{ width: '14px', height: '14px', border: '2px solid #64748b', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                    Aguardando compensação do boleto...
                                </div>
                            )}

                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                                Após a compensação pelo Mercado Pago, seu acesso é renovado automaticamente.
                            </p>

                            <button
                                onClick={() => { setFlow('pix'); setBoletoData(null); }}
                                style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.75rem', cursor: 'pointer', padding: '4px 8px' }}
                            >
                                ← Voltar ao PIX
                            </button>

                            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {/* ETAPA CARD_PENDING: cobrança aceita, emissor analisando.
                         Polling a cada 5s. Se aprovar → redireciona. Se recusar → volta ao método.
                         Usuário pode fechar — o webhook libera o acesso quando o MP confirmar. */}
                    {flow === 'card_pending' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem 0' }}>
                            <div style={{
                                width: '56px', height: '56px',
                                border: '4px solid rgba(59,130,246,0.2)',
                                borderTop: '4px solid #3b82f6',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                            <h3 style={{ margin: 0, fontSize: '1.15rem', textAlign: 'center' }}>
                                Assinatura em ativação
                            </h3>
                            <p style={{ margin: 0, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.95rem', lineHeight: 1.5, maxWidth: '420px' }}>
                                O Mercado Pago está autorizando a cobrança recorrente no cartão.
                                Verificamos o status automaticamente e liberamos seu acesso
                                assim que a assinatura for autorizada.
                            </p>

                            {cardPending && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    fontSize: '0.85rem',
                                    color: cardPending.pollingActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                    background: 'rgba(59,130,246,0.08)',
                                    padding: '8px 14px',
                                    borderRadius: '999px',
                                }}>
                                    {cardPending.pollingActive ? (
                                        <>
                                            <span style={{
                                                width: '8px', height: '8px', borderRadius: '50%',
                                                background: '#3b82f6',
                                                animation: 'pulse 1.2s ease-in-out infinite',
                                            }} />
                                            Aguardando confirmação… ({Math.floor(cardPending.elapsedSec / 60)}m{String(cardPending.elapsedSec % 60).padStart(2, '0')}s)
                                        </>
                                    ) : (
                                        <>A autorização ainda não foi concluída. Você pode fechar esta janela e tentar novamente mais tarde.</>
                                    )}
                                </div>
                            )}

                            {!locked && (
                                <button
                                    className={styles.btnSecondary}
                                    onClick={onClose}
                                    style={{ border: 'none', background: 'transparent', color: 'var(--color-text-muted)', marginTop: '8px' }}
                                >
                                    Fechar
                                </button>
                            )}

                            <style>{`
                                @keyframes spin { 100% { transform: rotate(360deg); } }
                                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                            `}</style>
                        </div>
                    )}

                    {flow === 'processing' && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                            <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
