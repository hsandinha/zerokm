import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            // Acesso
            email,
            password,
            // Empresa
            nomeFantasia,
            razaoSocial,
            cnpj,
            inscricaoEstadual,
            // Endereço
            cep,
            endereco,
            numero,
            complemento,
            bairro,
            cidade,
            uf,
            // Contato
            telefone,
            celular,
            nomeResponsavel,
            telefoneResponsavel,
        } = body;

        // Validações básicas
        if (!email || !password || !nomeFantasia || !cnpj || !nomeResponsavel || !telefoneResponsavel) {
            return NextResponse.json(
                { error: 'Campos obrigatórios não preenchidos' },
                { status: 400 }
            );
        }
        if (typeof password !== 'string' || password.length < 6) {
            return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
        }

        await connectDB();

        // Verificar e-mail duplicado
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado' }, { status: 409 });
        }

        // Verificar CNPJ duplicado
        const cnpjClean = cnpj.replace(/\D/g, '');
        const existingCnpj = await Concessionaria.findOne({ cnpj: cnpjClean });
        if (existingCnpj) {
            return NextResponse.json({ error: 'Este CNPJ já está cadastrado' }, { status: 409 });
        }

        // Criar usuário no Firebase
        const userRecord = await adminAuth.createUser({
            email: email.toLowerCase().trim(),
            password,
            displayName: String(nomeFantasia).trim(),
            emailVerified: false,
            disabled: false,
        });

        // Criar concessionária no MongoDB
        const concessionaria = await Concessionaria.create({
            nome: String(nomeFantasia).trim(),
            razaoSocial: razaoSocial ? String(razaoSocial).trim() : undefined,
            cnpj: cnpjClean,
            inscricaoEstadual: inscricaoEstadual || undefined,
            email: email.toLowerCase().trim(),
            telefone: telefone ? String(telefone).replace(/\D/g, '') : '',
            celular: celular ? String(celular).replace(/\D/g, '') : undefined,
            contato: String(nomeResponsavel).trim(),
            nomeResponsavel: String(nomeResponsavel).trim(),
            telefoneResponsavel: String(telefoneResponsavel).replace(/\D/g, ''),
            emailResponsavel: email.toLowerCase().trim(),
            endereco: endereco ? String(endereco).trim() : '',
            numero: numero ? String(numero).trim() : '',
            complemento: complemento || undefined,
            bairro: bairro ? String(bairro).trim() : '',
            cidade: cidade ? String(cidade).trim() : '',
            uf: uf ? String(uf).toUpperCase().trim() : '',
            cep: cep ? String(cep).replace(/\D/g, '') : '',
            ativo: true,
            dataCadastro: new Date(),
        });

        // Criar usuário no MongoDB vinculado à concessionária
        await User.create({
            firebaseUid: userRecord.uid,
            email: email.toLowerCase().trim(),
            displayName: String(nomeFantasia).trim(),
            allowedProfiles: ['concessionaria'],
            defaultProfile: 'concessionaria',
            dealershipId: (concessionaria._id as any).toString(),
            forcePasswordChange: false,
            credits: 0,
        });

        return NextResponse.json(
            { success: true, message: 'Concessionária cadastrada com sucesso!' },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Erro ao cadastrar concessionária:', error);
        if (error.code === 'auth/email-already-exists') {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Erro interno ao criar cadastro' }, { status: 500 });
    }
}
