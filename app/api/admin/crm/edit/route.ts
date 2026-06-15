import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/authOptions';
import connectDB from '../../../../../lib/mongodb';
import User from '../../../../../models/User';

export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
    }

    const { userId, displayName, phoneNumber, cpf, address } = body;
    if (!userId) {
        return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 });
    }

    await connectDB();

    const updateFields: Record<string, any> = {};
    if (displayName !== undefined) updateFields.displayName = displayName.trim();
    if (phoneNumber !== undefined) updateFields.phoneNumber = phoneNumber.trim();
    if (cpf !== undefined) updateFields.cpf = cpf.trim();
    if (address !== undefined) {
        updateFields['address.street'] = address.street || '';
        updateFields['address.number'] = address.number || '';
        updateFields['address.complement'] = address.complement || '';
        updateFields['address.neighborhood'] = address.neighborhood || '';
        updateFields['address.city'] = address.city || '';
        updateFields['address.state'] = address.state || '';
        updateFields['address.zipCode'] = address.zipCode || '';
    }

    const user = await User.findByIdAndUpdate(userId, { $set: updateFields }, { new: true }).lean();
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

    return NextResponse.json({ ok: true });
}
