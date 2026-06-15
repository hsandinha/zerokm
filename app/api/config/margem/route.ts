import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

interface ConfigDocument {
    _id?: string;
    key: string;
    value: number; // percent value
    mode?: 'percent' | 'fixed';
    fixedMargin?: number; // absolute addition when mode === 'fixed'
    updatedAt: Date;
    updatedBy?: string;
}

export async function GET() {
    try {
        await connectDB();
        const db = mongoose.connection.db;
        if (!db) {
            return NextResponse.json(
                { error: 'Erro de conexão com o banco de dados' },
                { status: 500 }
            );
        }
        const configCollection = db.collection('config');

        const margemConfig = await configCollection.findOne({ key: 'margem' }) as ConfigDocument | null;

        if (!margemConfig) {
            // Retorna margem padrão se não existir
            return NextResponse.json({ margem: 0, marginMode: 'percent', fixedMargin: 0 });
        }

        return NextResponse.json({
            margem: margemConfig.value,
            marginMode: margemConfig.mode || 'percent',
            fixedMargin: margemConfig.fixedMargin || 0
        });
    } catch (error) {
        console.error('Erro ao buscar margem:', error);
        return NextResponse.json(
            { error: 'Erro ao buscar configuração de margem' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json(
                { error: 'Não autenticado' },
                { status: 401 }
            );
        }

        // Verificar se o usuário tem permissão para alterar a margem
        const allowedProfiles = ['admin', 'administrador', 'gerente', 'operator', 'operador'];
        const userProfile = (session.user as any).profile;

        if (!allowedProfiles.includes(userProfile)) {
            return NextResponse.json(
                { error: 'Sem permissão para alterar margem' },
                { status: 403 }
            );
        }

        const { margem, marginMode = 'percent', fixedMargin = 0 } = await request.json();

        if (marginMode === 'percent') {
            if (typeof margem !== 'number' || margem < 0 || margem > 100) {
                return NextResponse.json(
                    { error: 'Valor de margem inválido. Deve ser um número entre 0 e 100.' },
                    { status: 400 }
                );
            }
        } else if (marginMode === 'fixed') {
            if (typeof fixedMargin !== 'number' || fixedMargin < 0) {
                return NextResponse.json(
                    { error: 'Valor fixo inválido. Deve ser um número maior ou igual a 0.' },
                    { status: 400 }
                );
            }
        } else {
            return NextResponse.json(
                { error: 'Modo de margem inválido. Use "percent" ou "fixed".' },
                { status: 400 }
            );
        }

        await connectDB();
        const db = mongoose.connection.db;
        if (!db) {
            return NextResponse.json(
                { error: 'Erro de conexão com o banco de dados' },
                { status: 500 }
            );
        }
        const configCollection = db.collection('config');

        await configCollection.updateOne(
            { key: 'margem' },
            {
                $set: {
                    value: margem,
                    mode: marginMode,
                    fixedMargin: fixedMargin,
                    updatedAt: new Date(),
                    updatedBy: session.user.email || session.user.name || 'unknown'
                }
            },
            { upsert: true }
        );

        return NextResponse.json({
            success: true,
            margem,
            marginMode,
            fixedMargin,
            message: 'Margem atualizada com sucesso'
        });
    } catch (error) {
        console.error('Erro ao salvar margem:', error);
        return NextResponse.json(
            { error: 'Erro ao salvar configuração de margem' },
            { status: 500 }
        );
    }
}
