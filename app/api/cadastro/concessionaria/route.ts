import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';
import Marca from '@/models/Marca';
import {
    createOrAdoptFirebaseUser,
    firebaseSignupErrorResponse,
    normalizeSignupEmail,
    persistOrRollbackFirebaseUser,
} from '@/lib/utils/signup';

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
            marcaId,
            marca,
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
        if (!email || !password || !nomeFantasia || !cnpj || !nomeResponsavel || !telefoneResponsavel || !marcaId) {
            return NextResponse.json(
                { error: 'Campos obrigatórios não preenchidos' },
                { status: 400 }
            );
        }
        if (typeof password !== 'string' || password.length < 6) {
            return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
        }
        const normalizedEmail = normalizeSignupEmail(email);
        if (!normalizedEmail) {
            return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
        }

        await connectDB();

        // Verificar e-mail duplicado
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado' }, { status: 409 });
        }

        // Verificar CNPJ duplicado
        const cnpjClean = cnpj.replace(/\D/g, '');
        const existingCnpj = await Concessionaria.findOne({ cnpj: cnpjClean });
        if (existingCnpj) {
            return NextResponse.json({ error: 'Este CNPJ já está cadastrado' }, { status: 409 });
        }

        const marcaDoc = await Marca.findById(marcaId);
        if (!marcaDoc) {
            return NextResponse.json({ error: 'Marca selecionada não encontrada' }, { status: 400 });
        }

        // Credencial no Firebase — adota registro órfão de tentativa anterior
        const account = await createOrAdoptFirebaseUser({
            email: normalizedEmail,
            password,
            displayName: String(nomeFantasia).trim(),
        });

        // Concessionária + usuário no Mongo. Se o usuário falhar, a
        // concessionária recém-criada é removida junto e o helper desfaz a
        // credencial: ou o cadastro fica inteiro, ou não sobra rastro.
        await persistOrRollbackFirebaseUser(account, async () => {
        const concessionaria = await Concessionaria.create({
            nome: String(nomeFantasia).trim(),
            razaoSocial: razaoSocial ? String(razaoSocial).trim() : undefined,
            marcaId: marcaDoc._id,
            marca: marcaDoc.nome || (marca ? String(marca).trim() : undefined),
            cnpj: cnpjClean,
            inscricaoEstadual: inscricaoEstadual || undefined,
            email: normalizedEmail,
            telefone: telefone ? String(telefone).replace(/\D/g, '') : '',
            celular: celular ? String(celular).replace(/\D/g, '') : undefined,
            contato: String(nomeResponsavel).trim(),
            nomeResponsavel: String(nomeResponsavel).trim(),
            telefoneResponsavel: String(telefoneResponsavel).replace(/\D/g, ''),
            emailResponsavel: normalizedEmail,
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

        try {
            await User.create({
                firebaseUid: account.uid,
                email: normalizedEmail,
                displayName: String(nomeFantasia).trim(),
                allowedProfiles: ['concessionaria'],
                defaultProfile: 'concessionaria',
                dealershipId: (concessionaria._id as any).toString(),
                forcePasswordChange: false,
                credits: 0,
            });
        } catch (userError) {
            await Concessionaria.deleteOne({ _id: concessionaria._id }).catch(cleanupError => {
                console.error('[signup] Falha ao remover concessionária órfã', cleanupError);
            });
            throw userError;
        }
        });

        return NextResponse.json(
            { success: true, message: 'Concessionária cadastrada com sucesso!' },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Erro ao cadastrar concessionária:', error);
        const mapeado = firebaseSignupErrorResponse(error);
        if (mapeado) {
            return NextResponse.json({ error: mapeado.error }, { status: mapeado.status });
        }
        return NextResponse.json({ error: 'Erro interno ao criar cadastro' }, { status: 500 });
    }
}
