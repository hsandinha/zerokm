import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = (session.user as any)?.profile;
        if (!['vendedor'].includes(profile)) {
            return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 });
        }

        const uid = (session.user as any)?.uid;
        if (!uid) {
            return NextResponse.json({ error: 'Sessão inválida' }, { status: 403 });
        }

        await connectDB();

        // Buscar o _id do vendedor pelo firebaseUid
        const vendedor = await User.findOne({ firebaseUid: uid }).select('_id').lean() as any;
        if (!vendedor) {
            return NextResponse.json({ error: 'Vendedor não encontrado' }, { status: 403 });
        }

        const url = new URL(request.url);
        const tipo = url.searchParams.get('tipo');

        let query: any = {
            allowedProfiles: { $in: ['cliente', 'gratis'] }
        };

        if (tipo === 'oportunidades') {
            query.$or = [
                { vendedorId: vendedor._id.toString() },
                {
                    $and: [
                        { $or: [{ vendedorId: { $exists: false } }, { vendedorId: null }, { vendedorId: '' }] },
                        { 'subscription.status': { $nin: ['active'] } }
                    ]
                }
            ];
        } else {
            query.vendedorId = vendedor._id.toString();
        }

        // Buscar clientes vinculados a este vendedor ou livres
        const clientes = await User.find(query)
            .select('displayName email phoneNumber cpf allowedProfiles subscription createdAt vendedorId')
            .sort({ createdAt: -1 })
            .lean() as any[];

        const serialized = clientes.map(c => ({
            id: c._id.toString(),
            nome: c.displayName || c.email || 'Sem nome',
            email: c.email || '',
            telefone: c.phoneNumber || '',
            cpf: c.cpf || '',
            perfis: c.allowedProfiles || [],
            plano: c.subscription?.planId || null,
            statusPlano: c.subscription?.status || 'inactive',
            vencimento: c.subscription?.expiresAt || null,
            dataCadastro: c.createdAt,
            vendedorId: c.vendedorId || null,
        }));

        return NextResponse.json(serialized);
    } catch (error) {
        console.error('Erro ao listar clientes do vendedor:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = (session.user as any)?.profile;
        if (!['vendedor', 'admin', 'administrador', 'gerente'].includes(profile)) {
            return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 });
        }

        const uid = (session.user as any)?.uid;
        await connectDB();

        const vendedor = await User.findOne({ firebaseUid: uid }).select('_id').lean() as any;
        if (!vendedor) {
            return NextResponse.json({ error: 'Vendedor não encontrado' }, { status: 403 });
        }

        const body = await request.json();

        // Vincular o vendedorId ao cliente sendo atualizado
        const cliente = await User.findByIdAndUpdate(
            body.clienteId,
            { vendedorId: vendedor._id.toString() },
            { returnDocument: 'after' }
        ).lean() as any;

        if (!cliente) {
            return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
        }

        return NextResponse.json({ success: true, clienteId: body.clienteId });
    } catch (error) {
        console.error('Erro ao vincular cliente ao vendedor:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
