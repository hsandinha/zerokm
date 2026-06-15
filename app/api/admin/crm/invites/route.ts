import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/authOptions';
import connectDB from '../../../../../lib/mongodb';
import User from '../../../../../models/User';
import Invite from '../../../../../models/Invite';
import Plan from '../../../../../models/Plan';
import { adminAuth } from '../../../../../lib/firebase-admin';
import { createFreeTrialWindow } from '../../../../../lib/utils/freeTrial';

function generatePassword(length = 8): string {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < length; i++) {
        pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    return pwd;
}

// GET - list invites for a given inviter email
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const email = req.nextUrl.searchParams.get('email');
    if (!email) return NextResponse.json([]);

    await connectDB();

    const inviter = await User.findOne({ email: email.toLowerCase().trim() });
    if (!inviter) return NextResponse.json([]);

    const invites = await Invite.find({ inviterId: inviter._id }).sort({ createdAt: -1 }).lean();

    return NextResponse.json(
        invites.map((inv: any) => ({
            id: inv._id.toString(),
            nome: inv.inviteeName,
            email: inv.inviteeEmail,
            telefone: inv.inviteePhone || '',
            status: inv.status,
            monthlyPrice: inv.monthlyPrice ?? 0,
            createdAt: inv.createdAt?.toISOString?.() || '',
        }))
    );
}

// POST - create invite on behalf of a client
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { nome, email, telefone, inviterEmail } = await req.json();
    if (!nome || !email || !inviterEmail) {
        return NextResponse.json({ error: 'Campos obrigatórios não preenchidos.' }, { status: 400 });
    }

    await connectDB();

    const inviter = await User.findOne({ email: inviterEmail.toLowerCase().trim() });
    if (!inviter) {
        return NextResponse.json({ error: 'Usuário principal não encontrado.' }, { status: 404 });
    }

    // Check if invitee email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
        return NextResponse.json({ error: 'Este e-mail já está cadastrado na plataforma.' }, { status: 409 });
    }

    const tempPassword = generatePassword();

    // Create Firebase user
    const userRecord = await adminAuth.createUser({
        email: email.toLowerCase().trim(),
        password: tempPassword,
        displayName: nome.trim(),
        emailVerified: false,
        disabled: false,
    });

    // Create MongoDB user
    const freeTrial = createFreeTrialWindow();

    const newUser = await User.create({
        firebaseUid: userRecord.uid,
        email: email.toLowerCase().trim(),
        displayName: nome.trim(),
        phoneNumber: telefone?.replace(/\D/g, '') || undefined,
        allowedProfiles: ['gratis'],
        defaultProfile: 'gratis',
        forcePasswordChange: true,
        credits: 0,
        ...freeTrial,
        isInvitee: true,
    });

    // Get inviter's plan invite price
    let monthlyPrice = 0;
    if (inviter.subscription?.planId) {
        const plan = await Plan.findById(inviter.subscription.planId).lean() as any;
        if (plan?.invitePrice) monthlyPrice = plan.invitePrice;
    }

    // Create Invite record
    await Invite.create({
        inviterId: inviter._id,
        inviteeName: nome.trim(),
        inviteeEmail: email.toLowerCase().trim(),
        inviteePhone: telefone || undefined,
        inviteeUserId: newUser._id,
        status: 'accepted',
        monthlyPrice,
    });

    return NextResponse.json({ ok: true, tempPassword });
}

// DELETE - cancel an invite
export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });

    await connectDB();
    const invite = await Invite.findById(id);
    if (!invite) return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 });

    await Invite.findByIdAndUpdate(id, { $set: { status: 'cancelled' } });

    // Downgrade invitee to gratis
    if (invite.inviteeUserId) {
        await User.findByIdAndUpdate(invite.inviteeUserId, {
            $set: {
                allowedProfiles: ['gratis'],
                defaultProfile: 'gratis',
                'subscription.status': 'inactive',
            },
            $unset: {
                'subscription.planId': '',
                'subscription.expiresAt': '',
            },
        });
    }

    return NextResponse.json({ ok: true });
}

// PATCH - update invite details
export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    try {
    const { id, nome, email, telefone, reactivate } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });

    await connectDB();

    const invite = await Invite.findById(id);
    if (!invite) return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 });

    // Reactivate a cancelled invite
    if (reactivate) {
        await Invite.findByIdAndUpdate(id, { $set: { status: 'accepted' } });

        // Restore invitee profile based on inviter's current profile
        if (invite.inviteeUserId) {
            const inviter = await User.findById(invite.inviterId).lean() as any;
            const inviterIsCliente = inviter?.allowedProfiles?.includes('cliente');
            const subFields = (inviterIsCliente && inviter.subscription) ? {
                'subscription.planId': inviter.subscription.planId,
                'subscription.status': inviter.subscription.status,
                'subscription.expiresAt': inviter.subscription.expiresAt,
            } : {
                'subscription.status': 'inactive'
            };

            const updateOptions: any = {
                $set: {
                    allowedProfiles: [inviterIsCliente ? 'cliente' : 'gratis'],
                    defaultProfile: inviterIsCliente ? 'cliente' : 'gratis',
                    ...subFields,
                },
            };

            if (!inviterIsCliente || !inviter.subscription) {
                updateOptions.$unset = {
                    'subscription.planId': '',
                    'subscription.expiresAt': '',
                };
            }

            await User.findByIdAndUpdate(invite.inviteeUserId, updateOptions);
        }

        return NextResponse.json({ ok: true });
    }

    // Update invite record
    const updateData: any = {};
    if (nome) updateData.inviteeName = nome.trim();
    if (email) updateData.inviteeEmail = email.toLowerCase().trim();
    if (telefone !== undefined) updateData.inviteePhone = telefone;

    await Invite.findByIdAndUpdate(id, { $set: updateData });

    // Also update the linked user if exists
    if (invite.inviteeUserId) {
        const userUpdate: any = {};
        if (nome) userUpdate.displayName = nome.trim();
        if (telefone !== undefined) userUpdate.phoneNumber = telefone.replace(/\D/g, '');

        if (email && email.toLowerCase().trim() !== invite.inviteeEmail) {
            // Update email in MongoDB
            userUpdate.email = email.toLowerCase().trim();
            // Update email in Firebase
            try {
                const linkedUser = await User.findById(invite.inviteeUserId);
                if (linkedUser?.firebaseUid) {
                    await adminAuth.updateUser(linkedUser.firebaseUid, {
                        email: email.toLowerCase().trim(),
                        displayName: nome?.trim() || undefined,
                    });
                }
            } catch (fbErr) {
                console.error('Firebase email update failed:', fbErr);
                return NextResponse.json({ error: 'Erro ao atualizar email no Firebase.' }, { status: 500 });
            }
        }

        if (Object.keys(userUpdate).length > 0) {
            await User.findByIdAndUpdate(invite.inviteeUserId, { $set: userUpdate });
        }
    }

    return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('PATCH /api/admin/crm/invites error:', err);
        return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
    }
}
