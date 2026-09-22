import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import { mpPost } from '@/lib/mercadopago';
import Plan from '@/models/Plan';
import User from '@/models/User';
import { DEALERSHIP_PROFILES, resolveDealershipScope } from '@/lib/services/dealershipScope';
import { buildDealerPlanReference } from '@/lib/services/planoRepasseService';
import { isPlanoConcessionaria, precoPlano } from '@/lib/utils/planoRepasse';
import { validateCNPJ, validateCPF } from '@/lib/utils/cpf';

/**
 * POST /api/checkout/plano-repasse/pix  { planId, billingType }
 *
 * A concessionária paga o plano de repasse por PIX. A ativação acontece no
 * webhook (lib/services/planoRepasseService.ts), igual ao banner: esta rota só
 * gera a cobrança. Equipe interna não paga por aqui; ativa manualmente.
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        if (!DEALERSHIP_PROFILES.has(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Somente a concessionária contrata o plano de repasse.' }, { status: 403 });
        }

        await connectDB();
        const scope = await resolveDealershipScope(session, request);
        const concessionaria = scope.concessionaria;
        if (!concessionaria) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const body = await request.json().catch(() => ({}));
        const billingType: 'monthly' | 'annual' = body?.billingType === 'annual' ? 'annual' : 'monthly';
        const plan = body?.planId ? await Plan.findById(body.planId).lean() as any : null;
        if (!plan || !plan.active || !isPlanoConcessionaria(plan)) {
            return NextResponse.json({ error: 'Plano de repasse indisponível.' }, { status: 400 });
        }
        if (billingType === 'annual' && !(typeof plan.annualPrice === 'number' && plan.annualPrice > 0)) {
            return NextResponse.json({ error: 'Este plano não tem opção anual.' }, { status: 400 });
        }

        const user = await User.findOne({ email: session.user.email }).select('_id email displayName cpf');
        if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

        // Quem compra é a loja: usa o CNPJ. Sem CNPJ válido, cai no CPF do usuário.
        const cnpj = String(concessionaria.cnpj || '').replace(/\D/g, '');
        const cpf = String(user.cpf || '').replace(/\D/g, '');
        const identification = cnpj.length === 14 && validateCNPJ(cnpj)
            ? { type: 'CNPJ', number: cnpj }
            : cpf.length === 11 && validateCPF(cpf)
                ? { type: 'CPF', number: cpf }
                : null;
        if (!identification) {
            return NextResponse.json({
                error: 'Para emitir o PIX, cadastre o CNPJ da concessionária ou um CPF válido no seu perfil.',
                code: 'DOCUMENTO_OBRIGATORIO',
            }, { status: 400 });
        }

        const amount = precoPlano(plan, billingType);
        const externalReference = buildDealerPlanReference(concessionaria._id.toString(), plan._id.toString(), billingType, user._id.toString());
        const host = request.headers.get('host') || 'www.cnv0km.com.br';
        const baseUrl = `${host.includes('localhost') ? 'http' : 'https'}://${host}`;
        const clientIp = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '').split(',')[0].trim();

        const payRes = await mpPost('/v1/payments', {
            transaction_amount: amount,
            description: `Plano de Repasse ${plan.name} (${billingType === 'annual' ? 'Anual' : 'Mensal'}) — ${concessionaria.nome || 'Concessionária'}`,
            payment_method_id: 'pix',
            payer: {
                email: user.email || session.user.email,
                ...(concessionaria.razaoSocial || concessionaria.nome ? { first_name: concessionaria.razaoSocial || concessionaria.nome } : {}),
                identification,
            },
            external_reference: externalReference,
            notification_url: `${baseUrl}/api/webhooks/mercadopago`,
            statement_descriptor: 'CNV REPASSE',
            metadata: {
                type: 'dealer-plan',
                concessionaria_id: concessionaria._id.toString(),
                plan_id: plan._id.toString(),
                billing_type: billingType,
            },
        }, undefined, clientIp ? { 'X-Forwarded-For': clientIp } : {});

        if (!payRes.ok) {
            console.error('[plano-repasse] Erro ao gerar PIX:', JSON.stringify(payRes.data));
            return NextResponse.json({ error: payRes.data?.message || 'Erro ao gerar PIX' }, { status: 400 });
        }

        const tx = payRes.data?.point_of_interaction?.transaction_data;
        return NextResponse.json({
            ok: true,
            paymentId: payRes.data.id,
            qrCode: tx?.qr_code || null,
            qrCodeBase64: tx?.qr_code_base64 || null,
            amount,
        });
    } catch (error: any) {
        console.error('[plano-repasse] POST pix', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
