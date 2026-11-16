import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { adminAuth } from '@/lib/firebase-admin';
import { gerarSenhaProvisoria } from '@/lib/utils/senhaProvisoria';

export const dynamic = 'force-dynamic';

/**
 * Senha provisória do lojista, definida pela equipe (cadastro guiado e ficha do
 * cliente). Grava a senha no login e marca a troca obrigatória no próximo acesso:
 * o mesmo mecanismo do cadastro pelo CRM (forcePasswordChange).
 * Body: { userId, senha? }. Sem `senha`, o servidor gera uma.
 */
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    const profile = (session?.user as any)?.profile;
    // Mesma regra das outras rotas do CRM.
    if (!profile || !['administrador', 'admin'].includes(profile)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { userId?: string; senha?: string } | null;
    if (!body?.userId || !mongoose.isValidObjectId(body.userId)) {
        return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
    }
    const informada = typeof body.senha === 'string' ? body.senha.trim() : '';
    if (informada && informada.length < 6) {
        return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 });
    }

    try {
        await connectDB();
        const user = await User.findById(body.userId).select('firebaseUid allowedProfiles email').lean() as any;
        if (!user) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
        // Só conta de lojista: senha de equipe e de concessionária não passa por aqui.
        const perfis: string[] = user.allowedProfiles ?? [];
        const soLojista = perfis.length > 0 && perfis.every(p => p === 'cliente' || p === 'gratis');
        if (!soLojista) {
            return NextResponse.json({ error: 'Este usuário não é só cliente: a senha de equipe e de concessionária não se troca por aqui.' }, { status: 400 });
        }
        if (!user.firebaseUid) {
            return NextResponse.json({ error: 'Este cliente não tem login para receber senha.' }, { status: 400 });
        }

        const senha = informada || gerarSenhaProvisoria();
        await adminAuth.updateUser(user.firebaseUid, { password: senha });
        await User.updateOne({ _id: user._id }, { $set: { forcePasswordChange: true } });

        return NextResponse.json({ ok: true, senhaProvisoria: senha, email: user.email });
    } catch (err: any) {
        console.error('POST /api/admin/crm/acesso error:', err);
        return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
    }
}
