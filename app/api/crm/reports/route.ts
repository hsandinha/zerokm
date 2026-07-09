import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';
import LeadEvent from '@/models/LeadEvent';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { periodFilter, resolvePeriodFromRequest } from '@/lib/utils/period';
import { lostReasonLabel } from '@/lib/utils/crmFunnel';

const SEM_ORIGEM = 'Sem origem';

const count = (facet: { n: number }[] | undefined) => facet?.[0]?.n ?? 0;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

/**
 * Radar comercial e relatórios do funil.
 *
 * Tudo é contado sobre `LeadEvent`, não sobre a fase atual do lead: um lead que já chegou
 * em "Venda Ganha" ainda precisa ser contado como proposta enviada no mês em que passou
 * por lá. A fase atual sozinha não guarda essa informação.
 */
export async function GET(request: Request) {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const period = resolvePeriodFromRequest(new URL(request.url));

        // Pipelines de agregação não passam pelo cast do Mongoose: o ObjectId vai na mão.
        const concessionariaId = scope.concessionariaId
            ? new mongoose.Types.ObjectId(scope.concessionariaId)
            : null;

        const stages = await LeadStage.find({ concessionariaId: scope.concessionariaId }).sort({ order: 1 });
        const idsOfType = (type: string) => stages.filter(s => s.type === type).map(s => s._id as any);
        const proposalIds = idsOfType('proposal');
        const wonIds = idsOfType('won');
        const lostIds = idsOfType('lost');

        const eventMatch = { concessionariaId, ...periodFilter(period) };
        const leadMatch = { concessionariaId, ativo: true, ...periodFilter(period) };

        const distinctLeads = (stageIds: any[]) => [
            { $match: { toStageId: { $in: stageIds } } },
            { $group: { _id: '$leadId' } },
            { $count: 'n' },
        ];

        const [facets] = await LeadEvent.aggregate([
            { $match: eventMatch },
            {
                $facet: {
                    criados: [{ $match: { type: 'created' } }, { $group: { _id: '$leadId' } }, { $count: 'n' }],
                    propostas: distinctLeads(proposalIds),
                    ganhas: distinctLeads(wonIds),
                    perdidas: distinctLeads(lostIds),
                    entradasPorEtapa: [
                        { $group: { _id: '$toStageId', leads: { $addToSet: '$leadId' } } },
                        { $project: { entradas: { $size: '$leads' } } },
                    ],
                    motivosPerda: [
                        { $match: { toStageId: { $in: lostIds }, lostReason: { $ne: null } } },
                        { $group: { _id: '$lostReason', total: { $sum: 1 } } },
                        { $sort: { total: -1 } },
                    ],
                },
            },
        ]);

        const leadsCriados = count(facets?.criados);
        const propostasEnviadas = count(facets?.propostas);
        const vendasGanhas = count(facets?.ganhas);
        const vendasPerdidas = count(facets?.perdidas);

        const entradas = new Map<string, number>(
            (facets?.entradasPorEtapa ?? []).map((e: any) => [e._id.toString(), e.entradas]),
        );

        const atuais = new Map<string, number>(
            (await Lead.aggregate([{ $match: leadMatch }, { $group: { _id: '$stageId', n: { $sum: 1 } } }]))
                .map((e: any) => [e._id.toString(), e.n]),
        );

        // Conversão por origem: junta cada evento ao lead para saber de que tag ele veio.
        const porOrigem = await LeadEvent.aggregate([
            { $match: eventMatch },
            { $lookup: { from: 'leads', localField: 'leadId', foreignField: '_id', as: 'lead' } },
            { $unwind: '$lead' },
            {
                $addFields: {
                    origens: {
                        $cond: [
                            { $gt: [{ $size: { $ifNull: ['$lead.tags', []] } }, 0] },
                            '$lead.tags',
                            [SEM_ORIGEM],
                        ],
                    },
                },
            },
            { $unwind: '$origens' },
            {
                $group: {
                    _id: '$origens',
                    // $addToSet ignora duplicatas: cada lead conta uma vez por métrica.
                    criados: { $addToSet: { $cond: [{ $eq: ['$type', 'created'] }, '$leadId', null] } },
                    propostas: { $addToSet: { $cond: [{ $in: ['$toStageId', proposalIds] }, '$leadId', null] } },
                    ganhas: { $addToSet: { $cond: [{ $in: ['$toStageId', wonIds] }, '$leadId', null] } },
                },
            },
            {
                $project: {
                    _id: 0,
                    tag: '$_id',
                    criados: { $size: { $setDifference: ['$criados', [null]] } },
                    propostas: { $size: { $setDifference: ['$propostas', [null]] } },
                    ganhas: { $size: { $setDifference: ['$ganhas', [null]] } },
                },
            },
            { $sort: { criados: -1, tag: 1 } },
        ]);

        return NextResponse.json({
            data: {
                period: { preset: period.preset, from: period.from, to: period.to },
                radar: { leadsCriados, propostasEnviadas, vendasGanhas, vendasPerdidas },
                conversao: {
                    leadParaProposta: pct(propostasEnviadas, leadsCriados),
                    propostaParaVenda: pct(vendasGanhas, propostasEnviadas),
                    geral: pct(vendasGanhas, leadsCriados),
                },
                porEtapa: stages.map(stage => {
                    const id = (stage._id as any).toString();
                    const entradasNaEtapa = entradas.get(id) ?? 0;
                    return {
                        id,
                        name: stage.name,
                        color: stage.color,
                        type: stage.type,
                        order: stage.order,
                        entradas: entradasNaEtapa,
                        atuais: atuais.get(id) ?? 0,
                        conversao: pct(entradasNaEtapa, leadsCriados),
                    };
                }),
                porOrigem: porOrigem.map((o: any) => ({
                    ...o,
                    conversao: pct(o.ganhas, o.criados),
                })),
                motivosPerda: (facets?.motivosPerda ?? []).map((m: any) => ({
                    reason: m._id,
                    label: lostReasonLabel(m._id),
                    total: m.total,
                    percentual: pct(m.total, vendasPerdidas),
                })),
            },
        });
    } catch (error: any) {
        console.error('Erro ao gerar relatórios do CRM:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
