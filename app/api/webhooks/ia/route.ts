import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Lead from '@/models/Lead';
import { resolveWebhookAccount } from '@/lib/utils/webhookAuth';
import {
    BUSINESS_END_HOUR,
    BUSINESS_START_HOUR,
    canIaAct,
    computeIaResumeAt,
    isBusinessHours,
} from '@/lib/utils/iaSchedule';

export const dynamic = 'force-dynamic';

/**
 * Busca o lead pelo telefone tolerando diferenças de formatação:
 * tenta o valor exato e depois um casamento pelos últimos dígitos,
 * aceitando separadores (espaço, hífen, parênteses) entre eles.
 */
async function findLeadByPhone(concessionariaId: string | null, phone: string) {
    const exact = await Lead.findOne({ concessionariaId, phone, ativo: true }).sort({ createdAt: -1 });
    if (exact) return exact;

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) return null;

    const pattern = digits.slice(-9).split('').join('\\D*') + '\\D*$';
    return Lead.findOne({ concessionariaId, phone: { $regex: pattern }, ativo: true }).sort({ createdAt: -1 });
}

/**
 * GET /api/webhooks/ia?phone=...
 * O bot consulta antes de responder um contato: pode atuar agora? Se não, quando volta?
 */
export async function GET(req: Request) {
    try {
        await dbConnect();

        const account = await resolveWebhookAccount(req);
        if (!account.ok) {
            return NextResponse.json({ error: 'Token inválido ou conta não encontrada' }, { status: 401 });
        }

        const url = new URL(req.url);
        const phone = (url.searchParams.get('phone') || '').trim();
        if (!phone) {
            return NextResponse.json({ error: 'Parâmetro phone é obrigatório' }, { status: 400 });
        }

        const now = new Date();
        const lead = await findLeadByPhone(account.concessionariaId, phone);

        return NextResponse.json({
            canAct: lead ? canIaAct(lead.iaResumeAt, now) : true,
            resumeAt: lead?.iaResumeAt ?? null,
            pausedAt: lead?.iaPausedAt ?? null,
            leadId: lead ? (lead._id as any).toString() : null,
            isBusinessHours: isBusinessHours(now),
            businessHours: { start: BUSINESS_START_HOUR, end: BUSINESS_END_HOUR },
            now,
        });
    } catch (error: any) {
        console.error('Erro no status da IA:', error);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}

/**
 * POST /api/webhooks/ia — body: { phone } ou { leadId }
 * Pausa a IA para o lead (ex.: um humano assumiu a conversa no WhatsApp).
 * A retomada é calculada com a regra do horário comercial.
 */
export async function POST(req: Request) {
    try {
        await dbConnect();

        const account = await resolveWebhookAccount(req);
        if (!account.ok) {
            return NextResponse.json({ error: 'Token inválido ou conta não encontrada' }, { status: 401 });
        }

        let body;
        try {
            body = await req.json();
        } catch (e) {
            return NextResponse.json({ error: 'Body deve ser um JSON válido' }, { status: 400 });
        }

        const { phone, leadId } = body;
        if (!phone && !leadId) {
            return NextResponse.json({ error: 'Informe phone ou leadId' }, { status: 400 });
        }

        const lead = leadId
            ? await Lead.findOne({ _id: leadId, concessionariaId: account.concessionariaId, ativo: true })
            : await findLeadByPhone(account.concessionariaId, String(phone));

        if (!lead) {
            return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        lead.iaPausedAt = new Date();
        lead.iaResumeAt = computeIaResumeAt(lead.iaPausedAt);
        await lead.save();

        return NextResponse.json({
            success: true,
            leadId: (lead._id as any).toString(),
            pausedAt: lead.iaPausedAt,
            resumeAt: lead.iaResumeAt,
        });
    } catch (error: any) {
        console.error('Erro ao pausar IA:', error);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
