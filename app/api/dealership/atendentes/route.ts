import { NextResponse } from 'next/server';
import { escopoDosAtendentes } from '@/lib/services/atendentesLojaEscopo';
import { criarAtendente, definirLimiteDeAtendentes, listarAtendentes } from '@/lib/services/atendentesLojaService';

export const dynamic = 'force-dynamic';

/**
 * Atendentes da concessionária (lib/utils/atendentesLoja.ts).
 * Titular: os da loja dele. Equipe do CNV: `?concessionariaId=`.
 *
 * GET  lista, com o limite e quantos estão ativos.
 * POST { nome, email, telefone } cria o login e devolve a senha provisória.
 * PUT  { limite } muda o limite da loja (só a equipe do CNV).
 */
export async function GET(request: Request) {
    try {
        const escopo = await escopoDosAtendentes(request);
        if (!escopo.ok) return NextResponse.json({ error: escopo.error }, { status: escopo.status });
        const r = await listarAtendentes(escopo.concessionariaId);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
        const { ok: _ok, ...dados } = r;
        return NextResponse.json({ ...dados, podeMudarLimite: escopo.comoEquipeCnv });
    } catch (error) {
        console.error('[atendentes] GET', error);
        return NextResponse.json({ error: 'Não foi possível carregar os atendentes.' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const escopo = await escopoDosAtendentes(request);
        if (!escopo.ok) return NextResponse.json({ error: escopo.error }, { status: escopo.status });
        const body = await request.json().catch(() => ({}));
        const r = await criarAtendente(escopo.concessionariaId, body, escopo.email);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
        return NextResponse.json({ atendente: r.atendente, senhaProvisoria: r.senhaProvisoria }, { status: 201 });
    } catch (error) {
        console.error('[atendentes] POST', error);
        return NextResponse.json({ error: 'Não foi possível cadastrar o atendente.' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const escopo = await escopoDosAtendentes(request);
        if (!escopo.ok) return NextResponse.json({ error: escopo.error }, { status: escopo.status });
        if (!escopo.comoEquipeCnv) {
            return NextResponse.json({ error: 'Somente a equipe do CNV altera o limite de atendentes.' }, { status: 403 });
        }
        const body = await request.json().catch(() => ({}));
        const r = await definirLimiteDeAtendentes(escopo.concessionariaId, body?.limite);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
        return NextResponse.json({ limite: r.limite });
    } catch (error) {
        console.error('[atendentes] PUT', error);
        return NextResponse.json({ error: 'Não foi possível salvar o limite.' }, { status: 500 });
    }
}
