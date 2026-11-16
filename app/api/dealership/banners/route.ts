import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Banner from '@/models/Banner';
import { deactivateExpiredBanners } from '@/lib/services/bannerService';
import { sessaoPodeUsar } from '@/lib/services/recursosConta';
import { MSG_RECURSO_DESLIGADO } from '@/lib/recursos';
import User from '@/models/User';
import { acessoDaLoja } from '@/lib/services/acessoLoja';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!(await sessaoPodeUsar(session, 'anuncios'))) {
            return NextResponse.json({ error: MSG_RECURSO_DESLIGADO }, { status: 403 });
        }

        await connectDB();
        await deactivateExpiredBanners();
        // O banner é gravado com o uid de quem contratou. Na concessionária a
        // equipe inteira (titular e atendentes) vê os anúncios da loja.
        let donos: string[] = [session.user.uid];
        const acesso = await acessoDaLoja(session);
        if (acesso) {
            const equipe = await User.find({ dealershipId: acesso.concessionariaId }).select('firebaseUid').limit(200).lean();
            donos = Array.from(new Set([session.user.uid, ...equipe.map(u => u.firebaseUid).filter(Boolean)]));
        }
        const banners = await Banner.find({ dealershipId: { $in: donos } }).lean() as any[];
        
        // Sort in memory to bypass MongoDB 32MB sort limit
        banners.sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        return NextResponse.json(banners);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
