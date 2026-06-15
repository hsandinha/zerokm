import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const profile = (session?.user as any)?.profile;
        if (!profile || !['administrador', 'admin', 'gerente'].includes(profile)) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
        }

        await connectDB();

        const vendedores = await User.find({
            allowedProfiles: { $in: ['vendedor'] }
        }).select('_id displayName email allowedProfiles').lean() as any[];

        const serialized = vendedores.map(u => ({
            id: u._id.toString(),
            _id: u._id.toString(),
            displayName: u.displayName || u.email || 'Sem nome',
            email: u.email,
            allowedProfiles: u.allowedProfiles,
        }));

        return NextResponse.json(serialized);
    } catch (error) {
        console.error('Erro ao buscar vendedores:', error);
        return NextResponse.json({ error: 'Erro ao buscar vendedores' }, { status: 500 });
    }
}
