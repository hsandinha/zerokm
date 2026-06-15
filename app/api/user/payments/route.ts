import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/authOptions';
import connectDB from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Payment from '../../../../models/Payment';
import Plan from '../../../../models/Plan';

/**
 * GET /api/user/payments
 * 
 * Retorna o histórico de pagamentos do usuário logado.
 * Inclui informação do plano e status do pagamento.
 * Aceita ?month=YYYY-MM para filtrar por mês.
 */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    await connectDB();

    const user = await User.findOne({ firebaseUid: session.user.uid }).select('_id');
    if (!user) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Build query with optional month filter
    const query: Record<string, unknown> = { userId: user._id };
    const monthParam = req.nextUrl.searchParams.get('month');
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        const [year, month] = monthParam.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1); // first day of next month
        query.createdAt = { $gte: startDate, $lt: endDate };
    }

    const payments = await Payment.find(query)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

    // Buscar nomes dos planos
    const planIds = [...new Set(payments.map(p => p.planId?.toString()).filter((id): id is string => !!id))];
    const plans = await Plan.find({ _id: { $in: planIds } }).select('name type').lean();
    const planMap = new Map(plans.map(p => [p._id.toString(), p]));

    const result = payments.map(p => {
        const plan = p.planId ? planMap.get(p.planId.toString()) : null;
        return {
            id: p._id,
            mpPaymentId: p.mpPaymentId,
            method: p.method,
            methodDetail: p.methodDetail,
            status: p.status,
            statusDetail: p.statusDetail,
            amount: p.amount,
            currency: p.currency,
            installments: p.installments,
            billingType: p.billingType,
            planName: plan?.name || 'Plano removido',
            planType: plan?.type,
            // PIX/Boleto info para pagamentos pendentes
            pixQrCode: p.status === 'pending' ? p.pixQrCode : undefined,
            pixQrCodeBase64: p.status === 'pending' ? p.pixQrCodeBase64 : undefined,
            boletoUrl: p.status === 'pending' ? p.boletoUrl : undefined,
            boletoBarcode: p.status === 'pending' ? p.boletoBarcode : undefined,
            payerEmail: p.payerEmail,
            createdAt: p.createdAt,
            mpDateApproved: p.mpDateApproved,
        };
    });

    return NextResponse.json(result);
}
