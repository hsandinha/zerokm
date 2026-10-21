import { NextResponse } from 'next/server';
import { withApiRoute } from '@/lib/apiRouteWrapper';

import User from '@/models/User';
import Plan from '@/models/Plan';
import { precoDoCliente } from '@/lib/utils/valorCombinado';

/** Receita mensal equivalente da assinatura, com o valor combinado do cliente quando houver. */
function monthlyValue(plan: any, billingType?: string | null, user?: any): number {
    if (!plan) return 0;
    const periodicidade = billingType === 'annual' ? 'annual' : 'monthly';
    const preco = precoDoCliente(plan, periodicidade, user);
    // Anual é o total do ano (combinado ou annualPrice); sem preço anual, a tabela é a mensal.
    if (periodicidade === 'annual' && (preco.combinado || (plan.annualPrice && plan.annualPrice > 0))) return preco.valor / 12;
    return preco.valor || 0;
}

export const GET = withApiRoute(async (_request) => {
    try {
        const plans = await Plan.find({}).lean() as any[];
        const users = await User.find({}).lean() as any[];

        const planMap = new Map(plans.map(p => [p._id.toString(), p]));
        const operatorNamesMap = new Map<string, string>();
        users.forEach(u => {
            if (u.allowedProfiles?.includes('operador') || u.allowedProfiles?.includes('vendedor')) {
                operatorNamesMap.set(u._id.toString(), u.displayName || u.email);
            }
        });

        let receitaCativa = 0;
        let receitaRisco = 0;
        let receitaPerdida = 0;

        let totalAtivos = 0;
        let totalRisco = 0;
        let totalBloqueados = 0;
        let totalCortesia = 0;
        let totalInvitees = 0;

        // Debug counters — returned so admin can diagnose
        const debugSkipped: { reason: string; email: string; activationMethod: string | null }[] = [];

        const operatorStats: Record<string, {
            nome: string;
            verde: number;
            amarelo: number;
            vermelho: number;
            cortesia: number;
            receitaGerida: number;
        }> = {};

        const now = new Date();

        const clientUsers = users.filter(u =>
            u.allowedProfiles?.includes('cliente') && u.subscription?.planId
        );

        clientUsers.forEach(user => {
            const activationMethod: string | null = user.subscription?.activationMethod || null;
            const isCortesia = activationMethod === 'cortesia';
            const isInvitee = user.isInvitee === true;

            const plan = planMap.get(user.subscription.planId?.toString());
            const planValue = monthlyValue(plan, user.subscription?.billingType, user);

            const opId = user.operadorId?.toString() || user.vendedorId?.toString();
            if (opId && !operatorStats[opId]) {
                operatorStats[opId] = {
                    nome: operatorNamesMap.get(opId) || 'Operador não encontrado',
                    verde: 0,
                    amarelo: 0,
                    vermelho: 0,
                    cortesia: 0,
                    receitaGerida: 0,
                };
            }

            // ── Cortesia: sem receita real ──────────────────────────
            if (isCortesia) {
                totalCortesia++;
                debugSkipped.push({ reason: 'cortesia', email: user.email, activationMethod });
                if (opId) operatorStats[opId].cortesia++;
                return;
            }

            // ── Convidado: acesso bundled, receita já no titular ────
            if (isInvitee) {
                totalInvitees++;
                debugSkipped.push({ reason: 'invitee', email: user.email, activationMethod });
                return;
            }

            // ── Clientes pagantes ───────────────────────────────────
            if (user.subscription?.expiresAt) {
                const expiry = new Date(user.subscription.expiresAt);
                const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                if (diff < 0) {
                    totalBloqueados++;
                    receitaPerdida += planValue;
                    if (opId) operatorStats[opId].vermelho++;
                } else if (diff <= 5) {
                    totalRisco++;
                    receitaRisco += planValue;
                    receitaCativa += planValue;
                    if (opId) {
                        operatorStats[opId].amarelo++;
                        operatorStats[opId].receitaGerida += planValue;
                    }
                } else {
                    totalAtivos++;
                    receitaCativa += planValue;
                    if (opId) {
                        operatorStats[opId].verde++;
                        operatorStats[opId].receitaGerida += planValue;
                    }
                }
            } else if (user.subscription?.status === 'active') {
                // Ativo sem data de expiração (ex.: plano de créditos)
                totalAtivos++;
                receitaCativa += planValue;
                if (opId) {
                    operatorStats[opId].verde++;
                    operatorStats[opId].receitaGerida += planValue;
                }
            } else {
                totalBloqueados++;
                if (opId) operatorStats[opId].vermelho++;
            }
        });

        const operatorRanking = Object.values(operatorStats)
            .sort((a, b) => b.receitaGerida - a.receitaGerida);

        return NextResponse.json({
            globalValues: {
                receitaCativa,
                receitaRisco,
                receitaPerdida,
                totalAtivos,
                totalRisco,
                totalBloqueados,
                totalCortesia,
                totalInvitees,
            },
            operatorRanking,
            // Debug: lista de clientes excluídos do cálculo de receita
            debug: {
                totalClientUsers: clientUsers.length,
                skippedCount: debugSkipped.length,
                skipped: debugSkipped,
            },
        });

    } catch (error) {
        console.error('Erro na métrica de churn:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}, { allowedProfiles: ['administrador', 'admin', 'gerente'] });
