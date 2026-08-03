import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createFreeTrialWindow } from '@/lib/utils/freeTrial';
import {
    createOrAdoptFirebaseUser,
    firebaseSignupErrorResponse,
    normalizeSignupEmail,
    persistOrRollbackFirebaseUser,
} from '@/lib/utils/signup';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { displayName, email, password } = body;

        if (!email || !password || !displayName) {
            return NextResponse.json({ error: 'Nome, e-mail e senha são obrigatórios' }, { status: 400 });
        }
        if (typeof password !== 'string' || password.length < 6) {
            return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
        }
        const normalizedEmail = normalizeSignupEmail(email);
        if (!normalizedEmail) {
            return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
        }

        await connectDB();

        const normalizedName = String(displayName).trim();

        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado' }, { status: 409 });
        }

        const account = await createOrAdoptFirebaseUser({
            email: normalizedEmail,
            password,
            displayName: normalizedName,
        });

        const freeTrial = createFreeTrialWindow();

        await persistOrRollbackFirebaseUser(account, () => User.create({
            firebaseUid: account.uid,
            email: normalizedEmail,
            displayName: normalizedName,
            allowedProfiles: ['gratis'],
            defaultProfile: 'gratis',
            forcePasswordChange: false,
            credits: 0,
            ...freeTrial
        }));

        return NextResponse.json({ success: true, message: 'Conta criada com sucesso!' }, { status: 201 });
    } catch (error: any) {
        console.error('Erro ao registrar usuário:', error);
        const mapeado = firebaseSignupErrorResponse(error);
        if (mapeado) {
            return NextResponse.json({ error: mapeado.error }, { status: mapeado.status });
        }
        return NextResponse.json({ error: 'Erro interno ao criar conta' }, { status: 500 });
    }
}
