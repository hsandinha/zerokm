import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Payment from '@/models/Payment';
import { resolveDealershipScope } from '@/lib/services/dealershipScope';
import { serializarCobrancaConcessionaria } from '@/lib/services/cobrancaConcessionariaService';
import { pagadorDaConcessionaria } from '@/lib/utils/cobrancaConcessionaria';
import { barrarAtendente } from '@/lib/services/acessoLoja';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealership/cobrancas
 *
 * Cobranças da concessionária logada: boletos emitidos pela equipe do CNV e os
 * pagamentos que ela mesma gerou (plano de repasse, banner), com linha
 * digitável, link do boleto e situação.
 *
 * Só o perfil concessionária, e só a loja do usuário logado: a concessionária
 * vem do cadastro do usuário, nunca de parâmetro. A equipe vê tudo na tela de
 * Cobranças do admin.
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        await connectDB();

        // Cobrança é do titular; o atendente só opera.
        const recusa = await barrarAtendente(session, 'cobranca');
        if (recusa) return recusa;
        const scope = await resolveDealershipScope(session, request);
        if (scope.kind !== 'dealership') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        if (!scope.concessionaria) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const pagamentos = await Payment.find({ concessionariaId: scope.concessionaria._id })
            .sort({ createdAt: -1 }).limit(100).lean();

        return NextResponse.json({
            cobrancas: pagamentos.map(serializarCobrancaConcessionaria),
            faltando: pagadorDaConcessionaria(scope.concessionaria).faltando,
        });
    } catch (error: any) {
        console.error('[dealership/cobrancas] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
