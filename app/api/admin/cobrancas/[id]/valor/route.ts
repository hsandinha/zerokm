import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Payment from '@/models/Payment';
import Transaction from '@/models/Transaction';
import { PERFIS_VALOR_COMBINADO } from '@/lib/services/valorCombinadoService';
import { LIMITE_VALOR_COMBINADO, lerValorEmReais } from '@/lib/utils/valorCombinado';
import { valorEditavel } from '@/lib/utils/cobrancaManual';

export const dynamic = 'force-dynamic';

/**
 * Corrige o valor de um registro manual (ativação pelo CRM ou baixa manual):
 * o cliente pagou um valor combinado e o extrato ficou com o preço da tabela.
 * Cobrança gerada no Mercado Pago não muda aqui: o valor dela é o do banco.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !PERFIS_VALOR_COMBINADO.has(session.user.profile as string)) {
        return NextResponse.json({ error: 'Seu perfil não pode alterar valores.' }, { status: 403 });
    }
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const valor = lerValorEmReais(body?.valor);
    if (valor === null || valor < 0) return NextResponse.json({ error: 'Informe o valor recebido.' }, { status: 400 });
    if (valor > LIMITE_VALOR_COMBINADO) return NextResponse.json({ error: 'Valor alto demais. Confira o número.' }, { status: 400 });

    await connectDB();
    const pagamento = await Payment.findById(id).lean() as any;
    if (!pagamento) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });
    if (!valorEditavel(pagamento)) {
        return NextResponse.json({ error: 'Esta cobrança foi gerada no Mercado Pago e o valor dela não muda aqui. Para cobrar outro valor, gere uma nova cobrança.' }, { status: 409 });
    }

    await Payment.updateOne({ _id: pagamento._id }, {
        $set: {
            amount: valor,
            valorEditado: {
                // Guarda o primeiro valor, mesmo depois de várias correções.
                valorOriginal: pagamento.valorEditado?.valorOriginal ?? pagamento.amount,
                por: session.user.email || 'equipe',
                em: new Date(),
            },
        },
    });
    if (pagamento.mpPaymentId) {
        await Transaction.updateMany({ referenceId: pagamento.mpPaymentId }, { $set: { amount: valor } });
    }
    return NextResponse.json({ ok: true, valor });
}
