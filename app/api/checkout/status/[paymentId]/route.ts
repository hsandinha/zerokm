import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/authOptions';
import { getPayment } from '../../../../../lib/mercadopago';

/**
 * GET /api/checkout/status/[paymentId]
 * 
 * Consulta o status de um pagamento no Mercado Pago em tempo real.
 * Usado para polling de PIX e boleto (que são assíncronos).
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ paymentId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.uid) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { paymentId } = await params;

    if (!paymentId) {
        return NextResponse.json({ error: 'paymentId é obrigatório' }, { status: 400 });
    }

    try {
        const mpRes = await getPayment(paymentId);

        if (!mpRes.ok) {
            return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });
        }

        const payment = mpRes.data;

        return NextResponse.json({
            id: payment.id,
            status: payment.status,
            statusDetail: payment.status_detail,
            method: payment.payment_method_id,
            methodType: payment.payment_type_id,
            amount: payment.transaction_amount,
            dateCreated: payment.date_created,
            dateApproved: payment.date_approved,
            // PIX info
            pixQrCode: payment.point_of_interaction?.transaction_data?.qr_code,
            pixQrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64,
            // Boleto info
            boletoUrl: payment.transaction_details?.external_resource_url,
        });
    } catch {
        return NextResponse.json({ error: 'Erro ao consultar pagamento' }, { status: 500 });
    }
}
