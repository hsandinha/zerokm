import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Favorito from '@/models/Favorito';

export const dynamic = 'force-dynamic';

/** POST /api/user/favoritos/visto -> o cliente abriu Favoritos: zera as novidades. */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        const email = session?.user?.email?.toLowerCase().trim();
        if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        await connectDB();
        await Favorito.updateMany({ userEmail: email }, { $set: { lastSeenAt: new Date() } });
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[favoritos/visto] POST', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
