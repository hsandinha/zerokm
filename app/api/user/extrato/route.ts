import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const month = searchParams.get('month') ||
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await connectDB();
    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const items: { type: string; description: string; amount: number; status: string; date?: string }[] = [];
    let total = 0;

    // 1. Buscar Transactions reais do mês selecionado
    const transactions = await Transaction.find({
        userId: user._id,
        month: month,
    }).sort({ createdAt: -1 }).lean();

    for (const tx of transactions) {
        items.push({
            type: (tx as any).type,
            description: (tx as any).description,
            amount: (tx as any).amount || 0,
            status: (tx as any).status,
            date: (tx as any).createdAt ? new Date((tx as any).createdAt).toISOString() : undefined,
        });
        if ((tx as any).status === 'paid') {
            total += (tx as any).amount || 0;
        }
    }

    // 2. Buscar Payments do mês (caso não tenham sido registrados como Transaction)
    const [year, mon] = month.split('-').map(Number);
    const startOfMonth = new Date(year, mon - 1, 1);
    const endOfMonth = new Date(year, mon, 0, 23, 59, 59, 999);

    const payments = await Payment.find({
        userId: user._id,
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
    }).sort({ createdAt: -1 }).lean();

    // Evitar duplicatas: só adicionar payments que não tenham Transaction correspondente
    const existingRefs = new Set(transactions.map((t: any) => t.referenceId).filter(Boolean));

    for (const pay of payments) {
        const mpId = String((pay as any).mpPaymentId || '');
        if (existingRefs.has(mpId)) continue; // Já tem Transaction para esse pagamento

        // Mapeamento de status do Payment (MP) para o extrato:
        //   approved                              → paid
        //   pending / in_process / authorized     → pending
        //   rejected / cancelled / refunded / ... → cancelled
        const rawStatus = String((pay as any).status || '');
        const payStatus: 'paid' | 'pending' | 'cancelled' =
            rawStatus === 'approved' ? 'paid' :
            (rawStatus === 'pending' || rawStatus === 'in_process' || rawStatus === 'authorized') ? 'pending' :
            'cancelled';

        const suffix = payStatus === 'pending' ? ' (em análise)' : '';

        items.push({
            type: 'subscription',
            description: `Pagamento via ${(pay as any).methodDetail || (pay as any).method || 'desconhecido'}${suffix}`,
            amount: (pay as any).amount || 0,
            status: payStatus,
            date: (pay as any).createdAt ? new Date((pay as any).createdAt).toISOString() : undefined,
        });
        if (payStatus === 'paid') {
            total += (pay as any).amount || 0;
        }
    }

    if (items.length === 0) {
        items.push({
            type: 'info',
            description: 'Nenhuma transação neste mês.',
            amount: 0,
            status: 'none',
        });
    }

    return NextResponse.json({ month, items, total });
}
