import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Invite from '@/models/Invite';
import User from '@/models/User';
import Plan from '@/models/Plan';
import { adminAuth } from '@/lib/firebase-admin';
import { createFreeTrialWindow } from '@/lib/utils/freeTrial';

function generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pw = 'CNV@';
    for (let i = 0; i < 6; i++) {
        pw += chars[Math.floor(Math.random() * chars.length)];
    }
    return pw;
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectDB();
    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const invites = await Invite.find({ inviterId: user._id }).sort({ createdAt: -1 });
    return NextResponse.json(invites.map(i => ({
        id: i._id.toString(),
        nome: i.inviteeName,
        email: i.inviteeEmail,
        telefone: i.inviteePhone || '',
        status: i.status,
        monthlyPrice: i.monthlyPrice,
        createdAt: i.createdAt,
    })));
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectDB();
    const body = await request.json();
    const nome = (body.nome || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const telefone = (body.telefone || '').replace(/\D/g, '');

    if (!nome) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 });
    if (!email || !email.includes('@')) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });

    const inviter = await User.findOne({ firebaseUid: session.user.uid });
    if (!inviter) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    if (inviter.email.toLowerCase() === email) {
        return NextResponse.json({ error: 'Você não pode convidar a si mesmo.' }, { status: 400 });
    }

    // Check if already invited and not cancelled
    const existing = await Invite.findOne({
        inviterId: inviter._id,
        inviteeEmail: email,
        status: { $ne: 'cancelled' },
    });
    if (existing) {
        return NextResponse.json({ error: 'Este e-mail já foi convidado.' }, { status: 409 });
    }

    // Check if email already exists as a user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return NextResponse.json({ error: 'Este e-mail já possui uma conta.' }, { status: 409 });
    }

    // Get plan invitePrice
    let invitePrice = 0;
    if (inviter.subscription?.planId) {
        const plan = await Plan.findById(inviter.subscription.planId);
        if (plan?.invitePrice) invitePrice = plan.invitePrice;
    }

    // Create Firebase + MongoDB user with temp password
    const tempPassword = generateTempPassword();
    const userRecord = await adminAuth.createUser({
        email,
        password: tempPassword,
        displayName: nome,
        emailVerified: false,
        disabled: false,
    });

    const freeTrial = createFreeTrialWindow();

    const newUser = await User.create({
        firebaseUid: userRecord.uid,
        email,
        displayName: nome,
        phoneNumber: telefone || undefined,
        allowedProfiles: ['gratis'],
        forcePasswordChange: true,
        credits: 0,
        ...freeTrial,
    });

    const invite = await Invite.create({
        inviterId: inviter._id,
        inviteeName: nome,
        inviteeEmail: email,
        inviteePhone: telefone || undefined,
        inviteeUserId: newUser._id,
        status: 'accepted',
        monthlyPrice: invitePrice,
    });

    return NextResponse.json({
        id: invite._id.toString(),
        nome: invite.inviteeName,
        email: invite.inviteeEmail,
        telefone: invite.inviteePhone || '',
        status: invite.status,
        monthlyPrice: invite.monthlyPrice,
        createdAt: invite.createdAt,
        tempPassword,
    }, { status: 201 });
}

export async function DELETE(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });

    await connectDB();
    const user = await User.findOne({ firebaseUid: session.user.uid });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const invite = await Invite.findOneAndUpdate(
        { _id: id, inviterId: user._id },
        { status: 'cancelled' },
        { returnDocument: 'after' }
    );
    if (!invite) return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 });

    return NextResponse.json({ ok: true });
}
