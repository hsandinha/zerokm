import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';

// Define structure of the config document directly as it doesn't have a rigid mongoose schema exported globally
interface ConfigDocument {
    key: string;
    value: any;
    [key: string]: any;
}

const DEFAULT_CONTATO = {
    whatsapp: '11926384826',
    email_support: 'suporte@meuzerokilometro.com.br',
    email_sales: 'comercial@meuzerokilometro.com.br',
    email_general: 'cnv0kmsp@gmail.com',
    address: 'São Paulo, SP',
    business_hours: 'Seg–Sex: 09:00–18:00',
    cnpj: '64.467.246/0001-50'
};

export async function GET(request: NextRequest) {
    try {
        await connectDB();
        
        const db = mongoose.connection.useDb('zerokm');
        const configCollection = db.collection('configs');

        // Buscar configuração de contato
        const contatoConfig = await configCollection.findOne({ key: 'contato' }) as ConfigDocument | null;

        if (!contatoConfig) {
            // Retorna contato padrão se não existir
            return NextResponse.json(DEFAULT_CONTATO);
        }

        return NextResponse.json({
            whatsapp: contatoConfig.whatsapp || DEFAULT_CONTATO.whatsapp,
            email_support: contatoConfig.email_support || DEFAULT_CONTATO.email_support,
            email_sales: contatoConfig.email_sales || DEFAULT_CONTATO.email_sales,
            email_general: contatoConfig.email_general || DEFAULT_CONTATO.email_general,
            address: contatoConfig.address || DEFAULT_CONTATO.address,
            business_hours: contatoConfig.business_hours || DEFAULT_CONTATO.business_hours,
            cnpj: contatoConfig.cnpj || DEFAULT_CONTATO.cnpj,
        });
    } catch (error) {
        console.error('Erro ao buscar configuração de contato:', error);
        return NextResponse.json(
            { error: 'Erro ao buscar configuração de contato' },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        
        // Verificar se usuário está logado
        if (!session?.user?.email) {
            return NextResponse.json(
                { error: 'Não autorizado. Faça login.' },
                { status: 401 }
            );
        }

        // Verificar se o usuário tem permissão (admin/administrador/gerente)
        const profile = (session.user as any).profile || '';
        if (!['admin', 'administrador', 'gerente'].includes(profile)) {
            return NextResponse.json(
                { error: 'Sem permissão para alterar configurações' },
                { status: 403 }
            );
        }

        const body = await request.json();
        
        await connectDB();
        
        const db = mongoose.connection.useDb('zerokm');
        const configCollection = db.collection('configs');

        // Atualizar ou criar configuração de contato
        await configCollection.updateOne(
            { key: 'contato' },
            { 
                $set: { 
                    key: 'contato',
                    whatsapp: body.whatsapp || '',
                    email_support: body.email_support || '',
                    email_sales: body.email_sales || '',
                    email_general: body.email_general || '',
                    address: body.address || '',
                    business_hours: body.business_hours || '',
                    cnpj: body.cnpj || ''
                } 
            },
            { upsert: true }
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Erro ao salvar configuração de contato:', error);
        return NextResponse.json(
            { error: 'Erro ao salvar configuração de contato' },
            { status: 500 }
        );
    }
}
