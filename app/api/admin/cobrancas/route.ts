import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Payment from '@/models/Payment';
import Plan from '@/models/Plan';
import User from '@/models/User';
import { consultarStatusEmail } from '@/lib/services/boletoEmailService';

export const dynamic = 'force-dynamic';

const STAFF = new Set(['admin', 'administrador', 'administrativo', 'gerente', 'operador', 'operator']);
const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Quantos e-mails consultamos no Resend por página. Uma chamada por boleto. */
const LIMITE_STATUS_EMAIL = 30;

/**
 * GET /api/admin/cobrancas?tipo=boleto&status=&search=&limit=
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

        const query: any = { method: { $in: ['bolbradesco', 'ticket'] } };
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

        return NextResponse.json({
            data: pagamentos.map((p: any) => {
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
                    email: {
                        enviadoEm: p.boletoEmailSentAt || null,
                        para: p.boletoEmailTo || u?.email || p.payerEmail || '',
                        id: p.boletoEmailId || null,
                        erro: p.boletoEmailError || null,
                        situacao: p.boletoEmailId ? statusEmails.get(p.boletoEmailId) ?? null : null,
                    },
                };
            }),
            total: pagamentos.length,
            statusEmailConsultados: comEmailId.length,
        });
    } catch (error: any) {
        console.error('[cobrancas] GET', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
