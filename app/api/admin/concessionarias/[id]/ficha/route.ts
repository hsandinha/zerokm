import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import User from '@/models/User';
import { WaStore } from '@wa/models/store';
import { storeAccess } from '@wa/lib/store';
import { lerRecursos } from '@/lib/recursos';
import { limiteDeAtendentes } from '@/lib/utils/atendentesLoja';
import { pendenciasDaLoja } from '@/lib/utils/pendenciasDaLoja';
import { permissoesDaFicha } from '@/lib/utils/permissoesDaFicha';
import { numerosDasLojas, numerosSerializados, serializeConcessionaria } from '@/lib/services/fichaConcessionaria';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/concessionarias/:id/ficha
 *
 * Resumo da ficha da concessionária: cadastro, pendências, login do titular,
 * atendentes, situação dos planos e o que o perfil logado pode fazer. Só a
 * equipe do CNV; o operador só abre as lojas da carteira dele (mesma regra da
 * lista). Não devolve senha, token nem o segredo do webhook da loja.
 */
export async function GET(_request: Request, { params }: Params) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const perfil = session.user?.profile as string | undefined;
        const permissoes = permissoesDaFicha(perfil);
        if (!permissoes) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        await connectDB();

        const filtro: Record<string, unknown> = { _id: id };
        if (perfil === 'operador') {
            const uid = (session.user as any)?.uid;
            const eu = uid ? await User.findOne({ firebaseUid: uid }).select('_id').lean() as any : null;
            if (!eu) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 403 });
            filtro.operadorId = eu._id;
        }

        const doc = await Concessionaria.findOne(filtro).select('-webhookSecret');
        if (!doc) return NextResponse.json({ error: 'Concessionária não encontrada' }, { status: 404 });

        const [numeros, store, operador, titulares] = await Promise.all([
            numerosDasLojas([id]),
            WaStore.findOne({ concessionariaId: doc._id }).select('subscription trialEndsAt').lean(),
            doc.operadorId ? User.findById(doc.operadorId).select('displayName email').lean() as Promise<any> : null,
            // Quem é o titular só interessa a quem gerencia os acessos.
            permissoes.gerirAcessos
                ? User.find({ dealershipId: id, papelLoja: { $ne: 'atendente' } }).select('displayName email').limit(10).lean() as Promise<any[]>
                : [],
        ]);

        const n = numeros.de(id);
        const concessionaria = { ...serializeConcessionaria(doc), ...numerosSerializados(n) };
        const recursos = lerRecursos((doc as any).recursos, 'concessionaria');

        // Atendimento por WhatsApp: a loja (WaStore) só nasce no primeiro acesso.
        const acesso = store ? storeAccess(store as any) : null;
        const atendimento = {
            liberado: recursos.atendimento,
            situacao: !recursos.atendimento ? 'nao_liberado' as const
                : !acesso ? 'nao_iniciado' as const
                    : !acesso.active ? 'vencido' as const
                        : acesso.trial ? 'teste' as const : 'assinante' as const,
            plano: acesso && !acesso.trial ? acesso.planName : null,
            ate: acesso ? (acesso.trial ? acesso.trialEndsAt : acesso.expiresAt) : null,
        };

        return NextResponse.json({
            concessionaria,
            operador: operador ? { id: String(operador._id), nome: operador.displayName || operador.email } : null,
            acessos: {
                titulares: (titulares as any[]).map(t => ({ nome: t.displayName || t.email, email: t.email })),
                totalTitulares: n.titulares,
                atendentes: n.atendentes,
                atendentesAtivos: n.atendentesAtivos,
                limiteAtendentes: limiteDeAtendentes(doc as any),
            },
            planoRepasse: concessionaria.planoRepasse,
            atendimento,
            pendencias: pendenciasDaLoja(concessionaria),
            permissoes,
        });
    } catch (error: any) {
        console.error('[ficha concessionária] GET', error);
        return NextResponse.json({ error: 'Não foi possível carregar a ficha.' }, { status: 500 });
    }
}
