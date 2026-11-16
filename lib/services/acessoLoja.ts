import { NextResponse } from 'next/server';
import User from '@/models/User';
import {
    acessoLiberado, ehPerfilDaLoja, papelDoUsuario, recusaDoTitular, type AcaoDoTitular, type PapelLoja,
} from '@/lib/utils/atendentesLoja';

/**
 * Papel de quem está logado dentro da concessionária, lido do banco a cada
 * chamada (a sessão não carrega o papel: mudou no cadastro, vale na hora).
 * Regras em lib/utils/atendentesLoja.ts. Chame depois do connectDB().
 */
export type AcessoLoja = { userId: string; concessionariaId: string; papel: PapelLoja; nome: string | null; email: string };

const CAMPOS = '_id email displayName dealershipId papelLoja atendenteInativo';

/** Quem é da loja e pode operar. `null`: outro perfil, sem loja ou atendente desativado. */
export async function acessoDaLoja(session: any): Promise<AcessoLoja | null> {
    const email = session?.user?.email;
    if (!email || !ehPerfilDaLoja(session?.user?.profile)) return null;
    const usuario = await User.findOne({ email }).select(CAMPOS).lean() as any;
    if (!usuario?.dealershipId || !acessoLiberado(usuario)) return null;
    return {
        userId: String(usuario._id),
        concessionariaId: String(usuario.dealershipId),
        papel: papelDoUsuario(usuario),
        nome: usuario.displayName || null,
        email: usuario.email,
    };
}

/**
 * Para as rotas que só o titular usa (cobrança, plano, dados cadastrais,
 * integrações): devolve a resposta 403 quando quem chama é atendente da loja,
 * ou `null` para seguir. Outros perfis não são afetados.
 */
export async function barrarAtendente(session: any, acao: AcaoDoTitular): Promise<NextResponse | null> {
    const perfil = session?.user?.profile;
    if (!ehPerfilDaLoja(perfil)) return null;
    const usuario = session?.user?.email
        ? await User.findOne({ email: session.user.email }).select(CAMPOS).lean() as any
        : null;
    const recusa = recusaDoTitular(perfil, usuario, acao);
    return recusa ? NextResponse.json({ error: recusa.error }, { status: recusa.status }) : null;
}
