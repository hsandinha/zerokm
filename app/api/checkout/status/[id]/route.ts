import { NextRequest, NextResponse } from 'next/server';
import { getPayment } from '@/lib/mercadopago';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const paymentId = params.id;
    if (!paymentId) return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });

    try {
        const mpRes = await getPayment(paymentId);
        if (!mpRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
        }
        return NextResponse.json({ status: mpRes.data.status });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
