/**
 * Mercado Pago — Utilitário centralizado
 * 
 * Abstrai todas as chamadas à API do Mercado Pago.
 * Usa somente `MP_ACCESS_TOKEN` do .env.
 */

const MP_BASE = 'https://api.mercadopago.com';

function getAccessToken(): string {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
        throw new Error('MP_ACCESS_TOKEN não configurado no .env');
    }
    return token;
}

export async function mpGet<T = any>(path: string): Promise<{ ok: boolean; status: number; data: T }> {
    const res = await fetch(`${MP_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${getAccessToken()}`,
        },
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
}

export async function mpPost<T = any>(
    path: string,
    body: object,
    idempotencyKey?: string,
    extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: T }> {
    const res = await fetch(`${MP_BASE}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${getAccessToken()}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey || crypto.randomUUID(),
            ...(extraHeaders || {}),
        },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
}

export async function mpPut<T = any>(path: string, body: object): Promise<{ ok: boolean; status: number; data: T }> {
    const res = await fetch(`${MP_BASE}${path}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${getAccessToken()}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
}

/**
 * Retorna os métodos de pagamento disponíveis para a conta.
 * Útil para debug e validação.
 */
export async function getPaymentMethods() {
    return mpGet('/v1/payment_methods');
}

/**
 * Busca detalhes de um pagamento pelo ID.
 */
export async function getPayment(paymentId: string | number) {
    return mpGet(`/v1/payments/${paymentId}`);
}

/**
 * Cria uma assinatura recorrente nativa do Mercado Pago (preapproval).
 */
export async function createPreapproval(preapproval: object) {
    return mpPost('/preapproval', preapproval);
}

/**
 * Busca uma assinatura recorrente nativa pelo ID.
 */
export async function getPreapproval(preapprovalId: string) {
    return mpGet(`/preapproval/${preapprovalId}`);
}

/**
 * Atualiza uma assinatura recorrente nativa pelo ID.
 */
export async function updatePreapproval(preapprovalId: string, body: object) {
    return mpPut(`/preapproval/${preapprovalId}`, body);
}

/**
 * Busca uma fatura/cobrança autorizada de assinatura.
 */
export async function getAuthorizedPayment(authorizedPaymentId: string | number) {
    return mpGet(`/authorized_payments/${authorizedPaymentId}`);
}

/**
 * Cria uma preferência de pagamento (Checkout Pro).
 */
export async function createPreference(preference: object) {
    return mpPost('/checkout/preferences', preference);
}

/**
 * Gera um card_token temporário a partir de um cartão salvo (card_id).
 * Passa customer_id na query e security_code no body.
 * O CVV é obrigatório para cada transação com cartão salvo.
 */
export async function createCardToken(cardId: string, customerId?: string, securityCode?: string): Promise<{ ok: boolean; token: string | null; error?: string }> {
    const qs = customerId ? `?customer_id=${customerId}` : '';
    const body: Record<string, string> = { card_id: cardId };
    if (securityCode) {
        body.security_code = securityCode;
    }

    // Retry logic: MP pode rejeitar card_token logo após salvar o cartão (race condition)
    const RETRY_DELAYS = [5000, 3000]; // 5s entre 1ª→2ª, 3s entre 2ª→3ª
    let lastError = '';

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        const res = await mpPost<any>(`/v1/card_tokens${qs}`, body);
        if (res.ok && res.data?.id) {
            return { ok: true, token: res.data.id };
        }

        lastError = res.data?.message || 'Erro ao gerar token do cartão';

        // Se não é a última tentativa, aguardar antes de tentar novamente
        if (attempt < RETRY_DELAYS.length) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        }
    }

    return { ok: false, token: null, error: lastError };
}

/**
 * Cobra um cliente usando o cartão salvo.
 * 1. Gera card_token com CVV + customer_id
 * 2. Cria o pagamento com o token + payment_method_id
 */
export async function chargeCustomerCard(opts: {
    customerId: string;
    cardId: string;
    paymentMethodId: string;
    securityCode?: string;
    email: string;
    amount: number;
    description: string;
    metadata?: Record<string, any>;

    // Token pré-gerado no browser via MP SDK v2 (mp.createCardToken).
    // Quando presente, pula a geração server-side — o token carrega
    // device_id/IP do usuário, reduzindo cc_rejected_high_risk.
    // Fallback: se ausente, gera token server-side com `securityCode`.
    cardToken?: string;

    // Dados adicionais para reduzir rejeição por antifraude (cc_rejected_high_risk)
    firstName?: string;
    lastName?: string;
    cpf?: string;
    phone?: string;                // formato BR (DDD + número) — será splitado
    address?: {
        zipCode?: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
    };
    items?: Array<{
        id: string;
        title: string;
        description?: string;
        quantity: number;
        unit_price: number;
        category_id?: string;
    }>;
    statementDescriptor?: string;
    notificationUrl?: string;
    deviceId?: string;              // MP_DEVICE_SESSION_ID do security.js (front)
    clientIp?: string;              // IP público do cliente (essencial para parear com deviceId)
    externalReference?: string;     // rastreabilidade (formato firebaseUid:planId:billingType)
    registrationDate?: string;      // ISO date do cadastro do usuário (sobe score MP)
    isFirstPurchaseOnline?: boolean; // antifraude / qualidade da integração MP
    issuerId?: string;               // código do banco emissor (BIN lookup) — sobe score MP
}): Promise<{ ok: boolean; status: number; data: any }> {
    // 1. Obter o card_token:
    //    - Se o browser já tokenizou (opts.cardToken), usa direto — melhor pro antifraude.
    //    - Caso contrário, faz fallback server-side com o CVV.
    let finalToken: string;
    if (opts.cardToken) {
        finalToken = opts.cardToken;
    } else {
        const tokenRes = await createCardToken(opts.cardId, opts.customerId, opts.securityCode);
        if (!tokenRes.ok || !tokenRes.token) {
            return { ok: false, status: 400, data: { message: tokenRes.error || 'Falha ao gerar token do cartão' } };
        }
        finalToken = tokenRes.token;
    }

    // Normalizar telefone BR (DDI 55 + DDD + número)
    const phoneDigits = (opts.phone || '').replace(/\D/g, '');
    let phoneObj: { area_code: string; number: string } | undefined;
    if (phoneDigits.length >= 10) {
        // assume DDD (2) + número (8-9)
        const area = phoneDigits.slice(0, 2);
        const number = phoneDigits.slice(2);
        phoneObj = { area_code: area, number };
    }

    const cpfDigits = (opts.cpf || '').replace(/\D/g, '');

    // Payer para cobrança com cartão salvo:
    // - type:'customer' + id são obrigatórios para o MP validar o token (que é vinculado ao customer)
    // - email + identification são enviados JUNTO para o motor antifraude usar os dados reais
    //   (sem eles o MP usa o perfil do customer, que pode estar vazio)
    const payer: Record<string, any> = {
        type: 'customer' as const,
        id: opts.customerId,
        email: opts.email,
    };
    if (opts.firstName) payer.first_name = opts.firstName;
    if (opts.lastName) payer.last_name = opts.lastName;
    if (cpfDigits.length === 11) {
        payer.identification = { type: 'CPF', number: cpfDigits };
    }
    if (phoneObj) payer.phone = phoneObj;

    // Payer "rico" dentro de additional_info (usado pelo antifraude)
    const additionalInfoPayer: Record<string, any> = {};
    if (opts.firstName) additionalInfoPayer.first_name = opts.firstName;
    if (opts.lastName) additionalInfoPayer.last_name = opts.lastName;
    if (phoneObj) additionalInfoPayer.phone = phoneObj;
    if (opts.registrationDate) additionalInfoPayer.registration_date = opts.registrationDate;
    if (typeof opts.isFirstPurchaseOnline === 'boolean') {
        additionalInfoPayer.is_first_purchase_online = opts.isFirstPurchaseOnline;
    }
    if (opts.address && (opts.address.zipCode || opts.address.street)) {
        additionalInfoPayer.address = {
            zip_code: (opts.address.zipCode || '').replace(/\D/g, ''),
            street_name: opts.address.street || '',
            street_number: opts.address.number || '',
        };
    }

    const additionalInfo: Record<string, any> = {};
    if (Object.keys(additionalInfoPayer).length > 0) additionalInfo.payer = additionalInfoPayer;
    if (opts.items && opts.items.length > 0) {
        additionalInfo.items = opts.items.map(it => ({
            id: it.id,
            title: it.title,
            description: it.description || it.title,
            quantity: it.quantity,
            unit_price: it.unit_price,
            category_id: it.category_id || 'services',
        }));
    }
    if (opts.address && opts.address.state) {
        additionalInfo.shipments = {
            receiver_address: {
                zip_code: (opts.address.zipCode || '').replace(/\D/g, ''),
                street_name: opts.address.street || '',
                street_number: opts.address.number || '',
                city_name: opts.address.city || '',
                state_name: opts.address.state || '',
            },
        };
    }

    // 2. Criar pagamento com o token
    const chargeBody: Record<string, any> = {
        transaction_amount: opts.amount,
        description: opts.description,
        token: finalToken,
        payment_method_id: opts.paymentMethodId,
        installments: 1,
        // binary_mode: false → permite status in_process (análise); true forçaria aprovação/rejeição imediata
        binary_mode: false,
        payer,
        metadata: opts.metadata || {},
    };
    if (opts.statementDescriptor) chargeBody.statement_descriptor = opts.statementDescriptor.slice(0, 22).toUpperCase();
    if (opts.notificationUrl) chargeBody.notification_url = opts.notificationUrl;
    if (opts.externalReference) chargeBody.external_reference = opts.externalReference;
    if (opts.issuerId) chargeBody.issuer_id = opts.issuerId;
    if (Object.keys(additionalInfo).length > 0) chargeBody.additional_info = additionalInfo;

    // Header X-Meli-Session-Id com device_id do security.js → crítico para antifraude
    const extraHeaders: Record<string, string> = {};
    if (opts.deviceId) extraHeaders['X-Meli-Session-Id'] = opts.deviceId;
    if (opts.clientIp) extraHeaders['X-Forwarded-For'] = opts.clientIp;

    return mpPost('/v1/payments', chargeBody, undefined, extraHeaders);
}
