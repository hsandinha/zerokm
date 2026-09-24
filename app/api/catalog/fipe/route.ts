import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { fipePath, queryFipe } from '@/lib/services/fipeService';
import { DEALERSHIP_PROFILES, STAFF_PROFILES } from '@/lib/services/dealershipScope';
// Equipe interna (catálogo) e concessionárias (cadastro de repasse).
const profiles = new Set([...STAFF_PROFILES, ...DEALERSHIP_PROFILES]);
export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!profiles.has(session.user?.profile || '')) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    const params = new URL(request.url).searchParams;
    try { fipePath(params); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    try { return NextResponse.json(await queryFipe(params)); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 502 }); }
}
