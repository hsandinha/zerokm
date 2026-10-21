import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

/** Valor combinado do próprio cliente, para a tela de pagamento mostrar o que vai ser cobrado. */
export async function GET() {
    const session = await getServerSession(authOptions);
    const uid = (session?.user as any)?.uid;
    if (!uid) return NextResponse.json({ valorCombinado: null });
    await connectDB();
    const user = await User.findOne({ firebaseUid: uid }).select('valorCombinado').lean() as any;
    const vc = user?.valorCombinado;
    if (!vc?.valor || !vc.planId) return NextResponse.json({ valorCombinado: null });
    return NextResponse.json({ valorCombinado: { valor: vc.valor, periodicidade: vc.periodicidade || 'monthly', planId: vc.planId } });
}
