import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createFreeTrialWindow } from '@/lib/utils/freeTrial';
import { createOrAdoptFirebaseUser, persistOrRollbackFirebaseUser } from '@/lib/utils/signup';

function cleanDigits(v: string) {
    return v.replace(/\D/g, '');
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            tipo,           // 'pf' | 'pj'
            nome,           // nome completo (PF) ou nome fantasia (PJ)
            razaoSocial,    // PJ only
            documento,      // CPF (PF) ou CNPJ (PJ) — digits only
            telefone,
            celular,
            // Endereço
            cep,
            endereco,
            numero,
            complemento,
            bairro,
            cidade,
            uf,
            // Acesso
            email,
            password,
        } = body;

        if (!nome || !documento || !email || !password) {
            return NextResponse.json({ error: 'Campos obrigatórios não preenchidos' }, { status: 400 });
        }
        if (typeof password !== 'string' || password.length < 6) {
            return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
        }
        if (typeof email !== 'string' || !email.includes('@')) {
            return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
        }

        const docClean = cleanDigits(documento);
        if (tipo === 'pf' && docClean.length !== 11) {
            return NextResponse.json({ error: 'CPF deve ter 11 dígitos' }, { status: 400 });
        }
        if (tipo === 'pj' && docClean.length !== 14) {
            return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 });
        }

        await connectDB();

        const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingEmail) {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado' }, { status: 409 });
        }

        const existingDoc = await User.findOne({ cpf: docClean });
        if (existingDoc) {
            return NextResponse.json(
                { error: tipo === 'pf' ? 'Este CPF já está cadastrado' : 'Este CNPJ já está cadastrado' },
                { status: 409 }
            );
        }

        const account = await createOrAdoptFirebaseUser({
            email: email.toLowerCase().trim(),
            password,
            displayName: String(nome).trim(),
        });

        const freeTrial = createFreeTrialWindow();

        await persistOrRollbackFirebaseUser(account, () => User.create({
            firebaseUid: account.uid,
            email: email.toLowerCase().trim(),
            displayName: String(nome).trim(),
            phoneNumber: cleanDigits(celular || telefone || '') || undefined,
            cpf: docClean,     // stores CPF or CNPJ
            allowedProfiles: ['gratis'],
            defaultProfile: 'gratis',
            forcePasswordChange: false,
            credits: 0,
            ...freeTrial,
            address: endereco ? {
                street: String(endereco).trim(),
                number: String(numero || '').trim(),
                complement: complemento || undefined,
                neighborhood: String(bairro || '').trim(),
                city: String(cidade || '').trim(),
                state: String(uf || '').toUpperCase().trim(),
                zipCode: cleanDigits(cep || ''),
            } : undefined,
        }));

        return NextResponse.json({ success: true, message: 'Conta criada com sucesso!' }, { status: 201 });
    } catch (error: any) {
        console.error('Erro ao cadastrar cliente:', error);
        if (error.code === 'auth/email-already-exists') {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Erro interno ao criar conta' }, { status: 500 });
    }
}
