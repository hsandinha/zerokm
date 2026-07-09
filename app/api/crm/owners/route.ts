import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';

const COMMERCIAL_PROFILES = ['administrador', 'admin', 'marketing', 'gerente', 'vendedor'];

/** Quem pode ser responsável por um lead, dentro do escopo de quem pergunta. */
export async function GET() {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const filter = scope.concessionariaId
            ? { dealershipId: scope.concessionariaId }
            : { allowedProfiles: { $in: COMMERCIAL_PROFILES } };

        const users = await User.find(filter).select('_id displayName email').sort({ displayName: 1 }).lean();

        return NextResponse.json({
            data: users.map((u: any) => ({
                id: u._id.toString(),
                name: u.displayName || u.email || 'Sem nome',
                email: u.email,
            })),
        });
    } catch (error: any) {
        console.error('Erro ao buscar responsáveis:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
