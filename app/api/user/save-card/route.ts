import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/authOptions';
import connectDB from '../../../../lib/mongodb';
import { mpPost, mpGet, mpPut } from '../../../../lib/mercadopago';
import User from '../../../../models/User';

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    await connectDB();
    const user = await User.findOne({ firebaseUid: session.user.uid }).lean();
    if (!user || !user.creditCard?.mpCardId) {
        return NextResponse.json({ hasCard: false });
    }
    return NextResponse.json({
        hasCard: true,
        lastFour: user.creditCard.lastFour,
        brand: user.creditCard.brand,
        // mpCardId é necessário pra que o browser tokenize o cartão salvo
        // via MP SDK v2 (gera token com device_id/IP reais do usuário,
        // reduzindo cc_rejected_high_risk). Só é útil combinado com CVV,
        // que só o usuário tem.
        mpCardId: user.creditCard.mpCardId,
    });
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
        // ── Novo fluxo (Secure Fields / PCI Compliance) ────────────────────
        // Front tokeniza via mp.fields.createCardToken() e envia o token.
        // O backend NUNCA recebe PAN/CVV. Recomendado.
        cardToken,
        // ── Legacy (deprecated, removido após migração completa) ───────────
        cardNumber, expiryMonth: legacyExpMonth, expiryYear: legacyExpYear, cvv,
        // ── Campos comuns aos dois fluxos ──────────────────────────────────
        holderName, cpf, cardType,
    } = body;

    let tokenId: string;

    if (cardToken && typeof cardToken === 'string') {
        // Secure Fields: o token já foi gerado no browser via mp.fields.createCardToken.
        // Apenas o token id chega aqui. Usamos direto na rota /v1/customers/{id}/cards.
        tokenId = cardToken;

        if (!holderName) {
            return NextResponse.json({ error: 'Nome do titular obrigatório.' }, { status: 400 });
        }
    } else {
        // Fluxo legacy — manter por 1 release enquanto front é migrado.
        if (!cardNumber || !legacyExpMonth || !legacyExpYear || !cvv || !holderName) {
            return NextResponse.json({ error: 'Dados do cartão incompletos.' }, { status: 400 });
        }

        const tokenRes = await mpPost('/v1/card_tokens', {
            card_number: cardNumber.replace(/\s/g, ''),
            expiration_year: String(legacyExpYear),
            expiration_month: String(legacyExpMonth).padStart(2, '0'),
            security_code: String(cvv),
            cardholder: {
                name: holderName,
                ...(cpf ? { identification: { type: 'CPF', number: cpf.replace(/\D/g, '') } } : {}),
            },
        });

        if (!tokenRes.ok || !tokenRes.data?.id) {
            const msg = tokenRes.data?.cause?.[0]?.description
                || tokenRes.data?.message
                || 'Dados do cartão inválidos.';
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        tokenId = tokenRes.data.id;
    }

    await connectDB();
    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    // 2 — Find or create MP Customer
    //
    // Helper: cria ou acha customer por email. Usado tanto no caminho feliz
    // (sem mpCustomerId) quanto na recuperação de customers stale (quando o
    // ID guardado no MongoDB foi criado sob um ACCESS_TOKEN diferente — por
    // exemplo, após trocar de app MP CheckoutPro→CheckoutTransparente).
    async function findOrCreateCustomer(): Promise<string> {
        const searchRes = await mpGet(
            `/v1/customers/search?email=${encodeURIComponent(session!.user.email ?? '')}`
        );
        if (searchRes.ok && searchRes.data?.results?.length > 0) {
            return searchRes.data.results[0].id;
        }
        const createRes = await mpPost('/v1/customers', {
            email: session!.user.email,
        });
        if (!createRes.ok) {
            throw new Error('Erro ao criar perfil de pagamento.');
        }
        return createRes.data.id;
    }

    let mpCustomerId: string = user.mpCustomerId ?? '';
    let mpCustomerIdWasStale = false;

    if (!mpCustomerId) {
        try {
            mpCustomerId = await findOrCreateCustomer();
        } catch (err: any) {
            return NextResponse.json(
                { error: err?.message || 'Erro ao criar perfil de pagamento.' },
                { status: 500 }
            );
        }
    } else {
        // Valida rapidamente se o customer ainda é acessível neste ACCESS_TOKEN.
        // Se não for (404), ele é "stale" (criado em outra app MP) — descartamos
        // e criamos/reaproveitamos um novo no escopo correto. Sem isso, o PUT e
        // o POST /cards abaixo vão falhar com "Customer not found" e o usuário
        // fica eternamente travado com um cartão que não pode ser salvo.
        const validateRes = await mpGet(`/v1/customers/${mpCustomerId}`);
        if (!validateRes.ok && validateRes.status === 404) {
            console.warn('[save-card] mpCustomerId stale detectado — recriando no escopo atual:', {
                stale: mpCustomerId,
            });
            mpCustomerIdWasStale = true;
            try {
                mpCustomerId = await findOrCreateCustomer();
            } catch (err: any) {
                return NextResponse.json(
                    { error: err?.message || 'Erro ao criar perfil de pagamento.' },
                    { status: 500 }
                );
            }
        }
    }

    // 2b — Atualizar o perfil do customer no MP com email + CPF + nome.
    // CRÍTICO: quando cobramos com type:'customer', o MP usa os dados
    // armazenados no perfil do customer para preencher payer.email,
    // payer.identification, etc. Se o perfil estiver vazio (customer
    // criado só com email), esses campos vêm null na resposta do
    // /v1/payments e o antifraude rejeita com cc_rejected_high_risk.
    //
    // ATENÇÃO: esta chamada precisa ser AWAITED (não fire-and-forget).
    // Se falhar silenciosamente, o perfil do customer fica vazio e
    // todas as cobranças subsequentes são rejeitadas pelo antifraude.
    const cpfRaw = (user as any).cpf || '';
    const displayName = (user as any).displayName || '';
    const phoneRaw = (user as any).phoneNumber || '';
    const nameParts = displayName.trim().split(/\s+/);
    // NÃO incluir `email` aqui — o MP trata email como imutável em
    // PUT /v1/customers/{id} e retorna 400 "invalid parameters" se enviar.
    // Campos editáveis suportados: first_name, last_name, phone,
    // identification, address, description, default_card, default_address.
    const profileUpdate: Record<string, any> = {
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
    };
    const cpfDigits = cpfRaw.replace(/\D/g, '');
    if (cpfDigits.length === 11) {
        profileUpdate.identification = { type: 'CPF', number: cpfDigits };
    }
    const phoneDigits = phoneRaw.replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
        profileUpdate.phone = { area_code: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) };
    }

    // Alerta antecipado: se faltarem campos críticos no perfil do User,
    // a cobrança quase certamente será rejeitada por antifraude.
    const missingFields: string[] = [];
    if (!profileUpdate.first_name) missingFields.push('first_name');
    if (!profileUpdate.identification) missingFields.push('identification (CPF)');
    if (!profileUpdate.phone) missingFields.push('phone');
    if (missingFields.length > 0) {
        console.warn('[save-card] Perfil incompleto — campos ausentes no User:', missingFields);
    }

    try {
        const putRes = await mpPut(`/v1/customers/${mpCustomerId}`, profileUpdate);
        if (!putRes.ok) {
            console.error('[save-card] Falha ao atualizar perfil do customer MP:', {
                customerId: mpCustomerId,
                status: putRes.status,
                response: putRes.data,
                sent: profileUpdate,
            });
        } else {
            console.log('[save-card] Perfil do customer MP atualizado com sucesso:', {
                customerId: mpCustomerId,
                email: (putRes.data as any)?.email,
                first_name: (putRes.data as any)?.first_name,
                last_name: (putRes.data as any)?.last_name,
                identification: (putRes.data as any)?.identification,
                phone: (putRes.data as any)?.phone,
            });
        }
    } catch (err) {
        console.error('[save-card] Exceção ao atualizar perfil do customer MP:', err);
    }

    // 3 — Add card to MP Customer
    const cardRes = await mpPost(`/v1/customers/${mpCustomerId}/cards`, {
        token: tokenId,
    });

    if (!cardRes.ok) {
        console.error('[save-card] MP recusou POST /cards:', {
            customerId: mpCustomerId,
            status: cardRes.status,
            response: cardRes.data,
            tokenIdPrefix: tokenId.slice(0, 8),
        });
        const mpMsg = cardRes.data?.cause?.[0]?.description
            || cardRes.data?.message
            || cardRes.data?.error
            || 'Erro ao salvar cartão no processador de pagamento.';
        return NextResponse.json(
            { error: mpMsg, mpStatus: cardRes.status, mpCode: cardRes.data?.cause?.[0]?.code },
            { status: 500 }
        );
    }

    const mpCardId: string = cardRes.data.id;
    // O MP retorna o payment_method.id base (ex: visa, master)
    // Se o usuário escolheu débito, ajustar para o ID correto (debvisa, debmaster)
    let brand: string = cardRes.data.payment_method?.id ?? '';
    if (cardType === 'debit' && brand && !brand.startsWith('deb')) {
        brand = `deb${brand}`;
    }
    // lastFour / expiry: extraídos da resposta canônica do MP
    // (independe de o cliente ter usado Secure Fields ou legacy).
    const lastFour: string = cardRes.data.last_four_digits
        ?? (cardNumber ? String(cardNumber).replace(/\s/g, '').slice(-4) : '');
    const expMonthFinal: number | string = cardRes.data.expiration_month ?? legacyExpMonth ?? '';
    const expYearFinal: number | string = cardRes.data.expiration_year ?? legacyExpYear ?? '';
    const expiry = `${String(expMonthFinal).padStart(2, '0')}/${expYearFinal}`;
    const savedCardType = cardType || 'credit';

    // 4 — Persist only token references + display info — never the raw number/CVV
    await User.findOneAndUpdate(
        { firebaseUid: session.user.uid },
        {
            $set: {
                mpCustomerId,
                creditCard: { holderName, lastFour, brand, expiry, mpCardId, cardType: savedCardType },
            },
        }
    );

    return NextResponse.json({ ok: true, lastFour, brand });
}
