import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Invite from '@/models/Invite';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        await connectDB();

        const user = await User.findOne({ email: session.user.email }).lean() as any;
        if (!user) {
            return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        }

        let marginConfig = user.marginConfig || { mode: 'percent', percentValue: 0, fixedValue: 0 };

        // If the user is an invitee, fetch the margin from their inviter (the principal)
        if (user.isInvitee) {
            const invite = await Invite.findOne({ inviteeUserId: user._id, status: 'accepted' }).lean() as any;
            if (invite?.inviterId) {
                const inviter = await User.findById(invite.inviterId).lean() as any;
                if (inviter && inviter.marginConfig) {
                    marginConfig = inviter.marginConfig;
                }
            }
        }

        return NextResponse.json({
            margem: marginConfig.percentValue || 0,
            fixedMargin: marginConfig.fixedValue || 0,
            marginMode: marginConfig.mode || 'percent',
            isInvitee: !!user.isInvitee
        });
    } catch (error) {
        console.error('Erro ao listar margem do cliente:', error);
        return NextResponse.json({ error: 'Erro ao carregar configurações.' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        await connectDB();

        const user = await User.findOne({ email: session.user.email }) as any;
        if (!user) {
            return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        }

        // Only the principal can update the margin
        if (user.isInvitee) {
            return NextResponse.json({ error: 'Convidados não podem alterar a margem' }, { status: 403 });
        }

        const { margem, marginMode, fixedMargin } = await req.json();

        // Validate
        if (typeof margem !== 'number' || margem < 0) {
            return NextResponse.json({ error: 'Margem percentual inválida.' }, { status: 400 });
        }
        if (typeof fixedMargin !== 'number' || fixedMargin < 0) {
            return NextResponse.json({ error: 'Margem em valor inválida.' }, { status: 400 });
        }
        if (marginMode !== 'percent' && marginMode !== 'fixed') {
            return NextResponse.json({ error: 'Modo de margem inválido.' }, { status: 400 });
        }

        user.marginConfig = {
            mode: marginMode,
            percentValue: margem,
            fixedValue: fixedMargin
        };

        await user.save();

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Erro ao atualizar margem do cliente:', error);
        return NextResponse.json({ error: 'Erro interno ao salvar margem' }, { status: 500 });
    }
}
