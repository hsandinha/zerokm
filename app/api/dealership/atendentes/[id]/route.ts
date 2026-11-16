import { NextResponse } from 'next/server';
import { escopoDosAtendentes } from '@/lib/services/atendentesLojaEscopo';
import {
    definirPapelNaLoja, definirSituacaoDoAtendente, editarAtendente, removerAtendente,
} from '@/lib/services/atendentesLojaService';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH { nome, telefone }                      edita
 * PATCH { acao: 'desativar' | 'reativar' }      bloqueia/libera o login (desativar derruba a sessão)
 * PATCH { acao: 'tornar-atendente' | 'tornar-titular' }  só a equipe do CNV (lojas com mais de um login antigo)
 * DELETE                                        remove o login
 *
 * O `id` só vale dentro da concessionária do escopo: atendente de outra loja dá 404.
 */
export async function PATCH(request: Request, { params }: Params) {
    try {
        const escopo = await escopoDosAtendentes(request);
        if (!escopo.ok) return NextResponse.json({ error: escopo.error }, { status: escopo.status });
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const acao = typeof body?.acao === 'string' ? body.acao : '';

        if (acao === 'tornar-atendente' || acao === 'tornar-titular') {
            if (!escopo.comoEquipeCnv) {
                return NextResponse.json({ error: 'Somente a equipe do CNV muda o titular da concessionária.' }, { status: 403 });
            }
            const r = await definirPapelNaLoja(escopo.concessionariaId, id, acao === 'tornar-atendente' ? 'atendente' : 'titular');
            if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
            return NextResponse.json({ papel: r.papel });
        }

        const r = acao === 'desativar' || acao === 'reativar'
            ? await definirSituacaoDoAtendente(escopo.concessionariaId, id, acao === 'reativar')
            : acao
                ? { ok: false as const, status: 400, error: 'Ação inválida.' }
                : await editarAtendente(escopo.concessionariaId, id, body);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
        return NextResponse.json({ atendente: r.atendente });
    } catch (error) {
        console.error('[atendentes] PATCH', error);
        return NextResponse.json({ error: 'Não foi possível atualizar o atendente.' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: Params) {
    try {
        const escopo = await escopoDosAtendentes(request);
        if (!escopo.ok) return NextResponse.json({ error: escopo.error }, { status: escopo.status });
        const { id } = await params;
        const r = await removerAtendente(escopo.concessionariaId, id);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[atendentes] DELETE', error);
        return NextResponse.json({ error: 'Não foi possível remover o atendente.' }, { status: 500 });
    }
}
