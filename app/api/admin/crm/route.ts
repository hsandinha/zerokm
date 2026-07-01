import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/authOptions';
import connectDB from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Plan from '../../../../models/Plan';
import Invite from '../../../../models/Invite';
import Payment from '../../../../models/Payment';
import { calculateProfileCompletion } from '../../../../lib/utils/profileCompletion';
import { calculateSubscriptionExpiry, parseSubscriptionStartDate } from '../../../../lib/utils/subscriptionDates';
import { isFreeTrialExpired } from '../../../../lib/utils/freeTrial';

export async function GET() {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    await connectDB();

    // Fetch all plans as a map for quick lookup
    const plans = await Plan.find({}).lean();
    const planMap = new Map(plans.map((p: any) => [p._id.toString(), p]));

    // Fetch all users that are gratis or cliente (ignore ops/admin/etc)
    const users = await User.find({
        allowedProfiles: { $in: ['gratis', 'cliente'] },
    })
        .select('displayName email phoneNumber allowedProfiles credits subscription createdAt creditCard address cpf isInvitee vendedorId freeTrialStartedAt freeTrialExpiresAt')
        .sort({ createdAt: -1 })
        .lean();

    const now = new Date();

    // Build invite count map: userId → number of invites
    const invites = await Invite.find({ status: { $in: ['accepted', 'pending'] } }).lean();
    const inviteCountMap = new Map<string, number>();
    for (const inv of invites) {
        const key = (inv as any).inviterId.toString();
        inviteCountMap.set(key, (inviteCountMap.get(key) || 0) + 1);
    }

    const clients = users.map((u: any) => {
        const isCliente = u.allowedProfiles?.includes('cliente');
        const isGratis = u.allowedProfiles?.includes('gratis') && !isCliente;

        const sub = u.subscription;
        const plan = sub?.planId ? planMap.get(sub.planId.toString()) : null;

        let status: 'active' | 'expired' | 'no_plan' = 'no_plan';
        let daysUntilExpiry: number | null = null;

        if (isCliente && sub?.expiresAt) {
            const expiry = new Date(sub.expiresAt);
            const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            daysUntilExpiry = diff;
            status = diff >= 0 ? 'active' : 'expired';
        } else if (isGratis) {
            status = 'no_plan';
        }

        const profileCompletion = calculateProfileCompletion({
            displayName: u.displayName,
            phoneNumber: u.phoneNumber,
            cpf: u.cpf,
            address: u.address,
            creditCard: u.creditCard,
        });

        return {
            id: u._id.toString(),
            displayName: u.displayName || '',
            email: u.email,
            phoneNumber: u.phoneNumber || '',
            cpf: u.cpf || '',
            address: u.address || null,
            profileType: isCliente ? 'cliente' : 'gratis',
            credits: u.credits ?? 0,
            status,
            planName: plan ? (plan as any).name : null,
            planType: plan ? (plan as any).type : null,
            expiresAt: sub?.expiresAt ? new Date(sub.expiresAt).toISOString() : null,
            daysUntilExpiry,
            activationMethod: sub?.activationMethod || null,
            paymentMethod: sub?.paymentMethod || null,
            billingType: sub?.billingType || null,
            createdAt: u.createdAt,
            hasCard: !!(u.creditCard?.mpCardId),
            cardBrand: u.creditCard?.brand || null,
            cardLastFour: u.creditCard?.lastFour || null,
            profileCompletion,
            inviteCount: inviteCountMap.get(u._id.toString()) || 0,
            isInvitee: u.isInvitee === true,
            vendedorId: u.vendedorId || null,
            freeTrialExpiresAt: isGratis && u.freeTrialExpiresAt ? new Date(u.freeTrialExpiresAt).toISOString() : null,
            freeTrialExpired: isGratis ? isFreeTrialExpired(u.freeTrialExpiresAt, now) : false,
        };
    });

    const summary = {
        total: clients.length,
        active: clients.filter(c => c.status === 'active').length,
        expired: clients.filter(c => c.status === 'expired').length,
        no_plan: clients.filter(c => c.status === 'no_plan').length,
        cortesia: clients.filter(c => c.activationMethod === 'cortesia' && c.status === 'active').length,
    };

    return NextResponse.json({ clients, summary });
}

export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
    }
    const { userId, planId, activationMethod, paymentFrequency, paymentMethod, startDate } = body;
    if (!userId || !planId) {
        return NextResponse.json({ error: 'userId e planId são obrigatórios.' }, { status: 400 });
    }

    try {
    await connectDB();

    // Handle downgrade to gratis
    if (planId === '__gratis__') {
        const user = await User.findById(userId).lean() as any;
        if (!user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

        await User.findByIdAndUpdate(userId, {
            $pull: { allowedProfiles: 'cliente' },
            $set: { 'subscription.status': 'inactive' },
            $unset: { 'subscription.planId': '', 'subscription.expiresAt': '' },
        });
        await User.findByIdAndUpdate(userId, {
            $addToSet: { allowedProfiles: 'gratis' },
            $inc: { profileVersion: 1 },
        });

        // Propagate downgrade to invitees
        const invites = await Invite.find({
            inviterId: userId,
            status: { $in: ['accepted', 'pending'] },
        }).lean();
        const inviteeIds = invites.map((inv: any) => inv.inviteeUserId).filter(Boolean);
        if (inviteeIds.length > 0) {
            await User.updateMany(
                { _id: { $in: inviteeIds } },
                {
                    $pull: { allowedProfiles: 'cliente' },
                    $set: { 'subscription.status': 'inactive' }
                }
            );
            await User.updateMany(
                { _id: { $in: inviteeIds } },
                { $addToSet: { allowedProfiles: 'gratis' }, $inc: { profileVersion: 1 } }
            );
        }

        return NextResponse.json({ ok: true });
    }

    const plan = await Plan.findById(planId).lean() as any;
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });

    const isAnnual = paymentFrequency === 'annual';
    const durationDays = plan.type === 'monthly' ? (isAnnual ? 365 : 30) : null;
    const selectedStartDate = durationDays
        ? (startDate === undefined ? new Date() : parseSubscriptionStartDate(startDate))
        : null;

    if (durationDays && !selectedStartDate) {
        return NextResponse.json({ error: 'Data de início inválida.' }, { status: 400 });
    }

    const expiresAt = durationDays && selectedStartDate
        ? calculateSubscriptionExpiry(selectedStartDate, durationDays)
        : null;

    const updateFields: Record<string, any> = {
        'subscription.planId': planId,
        'subscription.status': 'active',
        'subscription.activationMethod': activationMethod === 'cortesia' ? 'cortesia' : 'manual',
        'subscription.paymentMethod': activationMethod === 'cortesia' ? null : (paymentMethod || 'pix')
    };
    if (expiresAt) updateFields['subscription.expiresAt'] = expiresAt;

    const user = await User.findById(userId).lean() as any;
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

    const profiles: string[] = user.allowedProfiles ?? [];
    const newProfiles = profiles.includes('cliente')
        ? profiles
        : [...profiles.filter((p: string) => p !== 'gratis'), 'cliente'];

    let creditsToAdd = 0;
    if (plan.type === 'credits' && plan.credits) {
        creditsToAdd = plan.credits;
    }

    await User.findByIdAndUpdate(userId, {
        $set: { ...updateFields, allowedProfiles: newProfiles },
        $inc: { profileVersion: 1, ...(creditsToAdd > 0 ? { credits: creditsToAdd } : {}) },
    });

    // Propagate profile to all active invitees
    const invites = await Invite.find({
        inviterId: userId,
        status: { $in: ['accepted', 'pending'] },
    }).lean();

    if (invites.length > 0) {
        const inviteeIds = invites
            .map((inv: any) => inv.inviteeUserId)
            .filter(Boolean);

        if (inviteeIds.length > 0) {
            await User.updateMany(
                { _id: { $in: inviteeIds } },
                {
                    $addToSet: { allowedProfiles: 'cliente' },
                    $set: {
                        ...updateFields,
                        defaultProfile: 'cliente',
                    },
                }
            );
            await User.updateMany(
                { _id: { $in: inviteeIds } },
                { $pull: { allowedProfiles: 'gratis' } }
            );
            await User.updateMany(
                { _id: { $in: inviteeIds } },
                { $inc: { profileVersion: 1 } }
            );
        }
    }

    // Gerar Registros no Extrato (Payment) para este upgrade manual!
    let inviteesFee = 0;
    if (invites.length > 0 && plan.invitePrice) {
        inviteesFee = plan.invitePrice * invites.length;
    }
    const basePlanPrice = isAnnual && plan.annualPrice ? plan.annualPrice : plan.price;
    const finalAmount = activationMethod === 'cortesia' ? 0 : (basePlanPrice + inviteesFee);

    await Payment.create({
        userId: user._id,
        planId: plan._id,
        mpPaymentId: `MANUAL-${Date.now()}`,
        externalReference: `CRM-OVERRIDE-${user._id}-${Date.now()}`,
        method: activationMethod === 'cortesia' ? 'cortesia' : (paymentMethod || 'pix'),
        status: 'approved',
        amount: finalAmount,
        currency: 'BRL',
        payerEmail: user.email
    });

    return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('PATCH /api/admin/crm error:', err);
        return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
    }
    const { nome, email, telefone, cpf, address } = body;
    if (!nome || !email) {
        return NextResponse.json({ error: 'Nome e email são obrigatórios.' }, { status: 400 });
    }

    try {
        await connectDB();

        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado na plataforma.' }, { status: 409 });
        }

        const { adminAuth } = await import('../../../../lib/firebase-admin');
        const tempPassword = '123456';

        const userRecord = await adminAuth.createUser({
            email: email.toLowerCase().trim(),
            password: tempPassword,
            displayName: nome.trim(),
            emailVerified: false,
            disabled: false,
        });

        const newUser = await User.create({
            firebaseUid: userRecord.uid,
            email: email.toLowerCase().trim(),
            displayName: nome.trim(),
            phoneNumber: telefone?.replace(/\D/g, '') || undefined,
            cpf: cpf?.replace(/\D/g, '') || undefined,
            address: address || undefined,
            allowedProfiles: ['gratis'],
            defaultProfile: 'gratis',
            forcePasswordChange: true,
            credits: 0,
            isInvitee: false,
        });

        return NextResponse.json({ ok: true, tempPassword });
    } catch (err: any) {
        console.error('POST /api/admin/crm error:', err);
        return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
    }
}
