import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';

interface ConfigDocument {
    key: string;
    value: any;
    [key: string]: any;
}

const DEFAULT_BANNER_CONFIG = {
    price_cents: 5000, // R$ 50,00
    duration_days: 7
};

export async function GET(request: NextRequest) {
    try {
        await connectDB();
        
        const db = mongoose.connection.useDb('zerokm');
        const configCollection = db.collection('configs');

        const bannerConfig = await configCollection.findOne({ key: 'banners' }) as ConfigDocument | null;

        if (!bannerConfig) {
            return NextResponse.json(DEFAULT_BANNER_CONFIG);
        }

        return NextResponse.json({
            price_cents: bannerConfig.price_cents || DEFAULT_BANNER_CONFIG.price_cents,
            duration_days: bannerConfig.duration_days || DEFAULT_BANNER_CONFIG.duration_days,
        });
    } catch (error) {
        return NextResponse.json({ error: 'Erro ao buscar configuração de banners' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        
        // @ts-ignore
        const profile = session?.user?.profile || '';
        if (!['admin', 'administrador'].includes(profile)) {
            return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
        }

        const body = await request.json();
        await connectDB();
        
        const db = mongoose.connection.useDb('zerokm');
        const configCollection = db.collection('configs');

        await configCollection.updateOne(
            { key: 'banners' },
            { 
                $set: { 
                    key: 'banners',
                    price_cents: body.price_cents,
                    duration_days: body.duration_days
                } 
            },
            { upsert: true }
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
    }
}
