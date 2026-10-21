import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Invite from '@/models/Invite';
import ClienteLogo from '@/models/ClienteLogo';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/logo — logo da loja de quem está logado, para o orçamento.
 * Tela extra (convidado) usa a logo da conta principal.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        await connectDB();
        const user = await User.findOne({ email: session.user.email.toLowerCase().trim() }).select('_id isInvitee').lean() as any;
        if (!user) return NextResponse.json({ logo: null });

        let donoId = user._id;
        if (user.isInvitee) {
            const convite = await Invite.findOne({ inviteeUserId: user._id, status: { $in: ['accepted', 'pending'] } })
                .select('inviterId').lean() as any;
            if (convite?.inviterId) donoId = convite.inviterId;
        }

        const registro = await ClienteLogo.findOne({ userId: donoId }).select('logo').lean() as any;
        return NextResponse.json({ logo: registro?.logo || null });
    } catch (error: any) {
        console.error('[user/logo] GET', error);
        return NextResponse.json({ logo: null });
    }
}
