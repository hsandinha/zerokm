import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createFreeTrialWindow } from '@/lib/utils/freeTrial';

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
        if (typeof email !== 'string' || !email.includes('@')) {
            return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
        }

        await connectDB();

        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado' }, { status: 409 });
        }

        const userRecord = await adminAuth.createUser({
            email: email.toLowerCase().trim(),
            password,
            displayName: String(displayName).trim(),
            emailVerified: false,
            disabled: false
        });

        const freeTrial = createFreeTrialWindow();

        await User.create({
            firebaseUid: userRecord.uid,
            email: email.toLowerCase().trim(),
            displayName: String(displayName).trim(),
            allowedProfiles: ['gratis'],
            defaultProfile: 'gratis',
            forcePasswordChange: false,
            credits: 0,
            ...freeTrial
        });

        return NextResponse.json({ success: true, message: 'Conta criada com sucesso!' }, { status: 201 });
    } catch (error: any) {
        console.error('Erro ao registrar usuário:', error);
        if (error.code === 'auth/email-already-exists') {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Erro interno ao criar conta' }, { status: 500 });
    }
}
