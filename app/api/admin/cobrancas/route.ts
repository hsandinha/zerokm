import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Payment from '@/models/Payment';
import Plan from '@/models/Plan';
import User from '@/models/User';
import { consultarStatusEmail } from '@/lib/services/boletoEmailService';
import { acharClientePorNome, buscarBoletosNoMP, nomeNaDescricao, sincronizarStatus } from '@/lib/services/cobrancasService';

export const dynamic = 'force-dynamic';

// Sem 'gerente': cobrança é dado financeiro do cliente.
const STAFF = new Set(['admin', 'administrador', 'administrativo', 'operador', 'operator']);
const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Quantos e-mails consultamos no Resend por página. Uma chamada por boleto. */
const LIMITE_STATUS_EMAIL = 30;

/**
 * GET /api/admin/cobrancas?userId=&status=&search=&limit=&tudo=true
 *
 * Cobranças enviadas pelo sistema, com o boleto para reabrir e a situação do
 * e-mail. Serve o atendimento: o cliente liga dizendo que não recebeu, e a
 * equipe vê se saiu, para qual endereço e se foi entregue.
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !STAFF.has(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        }
        await connectDB();

        const { searchParams } = new URL(request.url);
        const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
        const status = searchParams.get('status')?.trim() || '';
        const search = searchParams.get('search')?.trim() || '';
        const semEmail = searchParams.get('semEmail') === 'true';
        const userId = searchParams.get('userId')?.trim() || '';
        // Na aba Financeiro do cliente interessa todo o histórico, não só boleto.
        const tudo = searchParams.get('tudo') === 'true';

        const query: any = tudo ? {} : { method: { $in: ['bolbradesco', 'ticket'] } };
        if (userId) {
            if (!mongoose.Types.ObjectId.isValid(userId)) return NextResponse.json({ data: [], total: 0 });
            query.userId = new mongoose.Types.ObjectId(userId);
        }
        if (status) query.status = status;
        if (semEmail) query.boletoEmailSentAt = { $in: [null, undefined] };

        if (search) {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            const usuarios = await User.find({ $or: [{ email: regex }, { displayName: regex }] }).select('_id').lean();
            query.$or = [
                { userId: { $in: usuarios.map((u: any) => u._id) } },
                { payerEmail: regex },
                { boletoEmailTo: regex },
                { mpPaymentId: search },
            ];
        }

        const pagamentos = await Payment.find(query).sort({ createdAt: -1 }).limit(limit).lean();

        // Mercado Pago é a fonte da verdade do boleto: corrige o status do que
        // temos e traz o que foi emitido no painel, fora do sistema.
        // A consulta ao MP vale para as duas telas: corrigir status importa
        // tanto na lista geral quanto na ficha do cliente.
        const { porId: noMP, erro: erroMP } = await buscarBoletosNoMP();
        const corrigidos = await sincronizarStatus(pagamentos, noMP);
        for (const p of pagamentos as any[]) {
            const mp = noMP.get(String(p.mpPaymentId));
            if (mp) {
                p.status = mp.status;
                p.boletoUrl = p.boletoUrl || mp.boletoUrl;
                p.boletoBarcode = p.boletoBarcode || mp.boletoBarcode;
            }
        }
        const userIds = [...new Set(pagamentos.map((p: any) => p.userId?.toString()).filter(Boolean))];
        const planIds = [...new Set(pagamentos.map((p: any) => p.planId?.toString()).filter(Boolean))];

        const [usuarios, planos] = await Promise.all([
            User.find({ _id: { $in: userIds } }).select('displayName email phoneNumber subscription.expiresAt').lean(),
            Plan.find({ _id: { $in: planIds } }).select('name').lean(),
        ]);
        const mapUser = new Map(usuarios.map((u: any) => [u._id.toString(), u]));
        const mapPlan = new Map(planos.map((p: any) => [p._id.toString(), p]));

        // Situação real da entrega vem do Resend, não do nosso banco.
        const comEmailId = pagamentos.filter((p: any) => p.boletoEmailId).slice(0, LIMITE_STATUS_EMAIL);
        const statusEmails = new Map<string, string | null>();
        await Promise.all(comEmailId.map(async (p: any) => {
            const r = await consultarStatusEmail(p.boletoEmailId);
            statusEmails.set(p.boletoEmailId, r.status);
        }));

        const nossos = pagamentos.map((p: any) => {
                const u = p.userId ? mapUser.get(p.userId.toString()) : null;
                return {
                    id: p._id.toString(),
                    mpPaymentId: p.mpPaymentId,
                    cliente: u?.displayName || p.payerName || '-',
                    clienteEmail: u?.email || p.payerEmail || '',
                    clienteTelefone: u?.phoneNumber || '',
                    assinaturaExpiraEm: u?.subscription?.expiresAt || null,
                    plano: p.planId ? (mapPlan.get(p.planId.toString()) as any)?.name || 'Plano removido' : '-',
                    valor: p.amount,
                    status: p.status,
                    criadoEm: p.createdAt,
                    // O boleto continua acessível mesmo depois de pago ou vencido:
                    // é o documento que o cliente pede de volta.
                    boletoUrl: p.boletoUrl || null,
                    boletoBarcode: p.boletoBarcode || null,
                    origem: 'sistema' as const,
                    podeReenviar: true,
                    email: {
                        enviadoEm: p.boletoEmailSentAt || null,
                        para: p.boletoEmailTo || u?.email || p.payerEmail || '',
                        id: p.boletoEmailId || null,
                        erro: p.boletoEmailError || null,
                        situacao: p.boletoEmailId ? statusEmails.get(p.boletoEmailId) ?? null : null,
                    },
                };
        });

        // Emitidos no painel do MP: aparecem em modo leitura, com o cliente
        // deduzido da descrição ("Cobrança para X"). Sem dono provável, fica
        // "não identificado" — apontar o cliente errado numa cobrança é pior.
        const idsNossos = new Set(pagamentos.map((p: any) => String(p.mpPaymentId)));
        // Só na lista geral: dentro da ficha de um cliente não dá para afirmar
        // que um boleto solto do painel é dele.
        const candidatos = userId ? [] : [...noMP.values()].filter(b => !idsNossos.has(b.id) && !b.externalReference);
        const foraDoSistema = candidatos.length > 0
            ? await (async () => {
                const clientes = await User.find({ displayName: { $exists: true, $ne: '' } })
                    .select('displayName email phoneNumber subscription.expiresAt').lean();
                return candidatos.map((b: any) => {
                    const dono = acharClientePorNome(b.descricao, clientes as any[]);
                    return {
                        id: `mp:${b.id}`,
                        mpPaymentId: b.id,
                        cliente: (dono as any)?.displayName || nomeNaDescricao(b.descricao) || 'Não identificado',
                        clienteEmail: (dono as any)?.email || '',
                        clienteTelefone: (dono as any)?.phoneNumber || '',
                        assinaturaExpiraEm: (dono as any)?.subscription?.expiresAt || null,
                        clienteConfirmado: Boolean(dono),
                        plano: b.descricao || '-',
                        valor: b.valor,
                        status: b.status,
                        criadoEm: b.criadoEm,
                        boletoUrl: b.boletoUrl,
                        boletoBarcode: b.boletoBarcode,
                        origem: 'painel' as const,
                        podeReenviar: false,
                        email: { enviadoEm: null, para: (dono as any)?.email || '', id: null, erro: null, situacao: null },
                    };
                });
            })()
            : [];

        const data = [...nossos, ...foraDoSistema]
            .filter(row => !status || row.status === status)
            .sort((a, b) => new Date(b.criadoEm || 0).getTime() - new Date(a.criadoEm || 0).getTime());

        return NextResponse.json({
            data,
            total: data.length,
            statusEmailConsultados: comEmailId.length,
            statusCorrigidos: corrigidos,
            avisoMP: erroMP || null,
        });
    } catch (error: any) {
        console.error('[cobrancas] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
