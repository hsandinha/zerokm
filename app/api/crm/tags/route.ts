import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Lead from '@/models/Lead';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { resolveCrmScope } from '@/lib/utils/crmScope';
import { KNOWN_LEAD_TAGS } from '@/lib/utils/leadTags';

/** Tags disponíveis para filtro: as automáticas conhecidas + as que já existem nos leads. */
export async function GET() {
    try {
        await connectDB();

        const session = await getServerSession(authOptions);
        const scope = await resolveCrmScope(session);
        if (!scope.ok) {
            return NextResponse.json({ error: scope.error }, { status: scope.status });
        }

        const used: string[] = await Lead.distinct('tags', {
            concessionariaId: scope.concessionariaId,
            ativo: true,
        });

        const all = Array.from(new Set([...KNOWN_LEAD_TAGS, ...used])).sort();

        return NextResponse.json({ data: all });
    } catch (error: any) {
        console.error('Erro ao buscar tags:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
