import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Payment from '@/models/Payment';
import Plan from '@/models/Plan';
import User from '@/models/User';
import { enviarBoletoPorEmail } from '@/lib/services/boletoEmailService';

// Sem 'gerente': cobrança é dado financeiro do cliente.
const STAFF = new Set(['admin', 'administrador', 'administrativo', 'operador', 'operator']);

/**
 * POST /api/admin/cobrancas/:id/reenviar  { email? }
 *
 * Reenvia o mesmo e-mail do boleto. `email` permite corrigir o endereço quando
 * o cliente informa outro; o novo endereço fica gravado como último destino.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !STAFF.has(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        }
        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });

        await connectDB();
        const payment = await Payment.findById(id);
        if (!payment) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });
        if (!payment.boletoUrl) {
            return NextResponse.json({ error: 'Esta cobrança não tem boleto para enviar.' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        const user = payment.userId ? await User.findById(payment.userId).select('displayName email subscription.expiresAt') : null;
        const destino = String(body?.email || '').trim() || payment.boletoEmailTo || user?.email || payment.payerEmail || '';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
            return NextResponse.json({ error: 'Informe um e-mail válido para o reenvio.' }, { status: 400 });
        }

        const plan = payment.planId ? await Plan.findById(payment.planId).select('name').lean() as any : null;
        const res = await enviarBoletoPorEmail({
            payment,
            para: destino,
            nomeCliente: user?.displayName || payment.payerName,
            nomePlano: plan?.name || 'Assinatura CNV',
            vencimento: user?.subscription?.expiresAt || payment.mpDateCreated || null,
        });

        if (!res.ok) {
            return NextResponse.json({ error: res.error || 'Falha ao enviar o e-mail', configuracaoAusente: res.skipped === true }, { status: 502 });
        }

        console.log('[cobrancas] Boleto reenviado', { paymentId: id, destino, por: session.user?.email });
        return NextResponse.json({ ok: true, para: destino, emailId: res.id });
    } catch (error: any) {
        console.error('[cobrancas] reenviar', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
