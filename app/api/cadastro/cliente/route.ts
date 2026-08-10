import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createFreeTrialWindow } from '@/lib/utils/freeTrial';
import { validateDocumento } from '@/lib/utils/cpf';
import {
    createOrAdoptFirebaseUser,
    firebaseSignupErrorResponse,
    normalizeSignupEmail,
    persistOrRollbackFirebaseUser,
} from '@/lib/utils/signup';

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
        const normalizedEmail = normalizeSignupEmail(email);
        if (!normalizedEmail) {
            return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
        }

        // Conferir só a quantidade de dígitos deixava passar qualquer sequência
        // (inclusive 111.111.111-11). O documento é usado depois para emitir
        // cobrança no Mercado Pago, que recusa CPF inválido — a conta nascia
        // impossível de cobrar.
        const docClean = cleanDigits(documento);
        const docError = validateDocumento(tipo === 'pj' ? 'pj' : 'pf', docClean);
        if (docError) {
            return NextResponse.json({ error: docError }, { status: 400 });
        }

        await connectDB();

        const existingEmail = await User.findOne({ email: normalizedEmail });
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
            email: normalizedEmail,
            password,
            displayName: String(nome).trim(),
        });

        const freeTrial = createFreeTrialWindow();

        await persistOrRollbackFirebaseUser(account, () => User.create({
            firebaseUid: account.uid,
            email: normalizedEmail,
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
        const mapeado = firebaseSignupErrorResponse(error);
        if (mapeado) {
            return NextResponse.json({ error: mapeado.error }, { status: mapeado.status });
        }
        return NextResponse.json({ error: 'Erro interno ao criar conta' }, { status: 500 });
    }
}
