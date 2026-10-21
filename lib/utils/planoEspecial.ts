/**
 * Plano especial: criado para um cliente específico (condição negociada), fora
 * do checkout e da landing. Só a equipe ativa pelo CRM; a renovação segue
 * normal (boleto, PIX e cartão), porque o plano continua ativo.
 *
 * Arquivo puro: usado pelo servidor e pela tela.
 */
export function isPlanoEspecial(plan: { especial?: unknown } | null | undefined): boolean {
    return plan?.especial === true;
}

/**
 * O usuário pode pagar este plano sozinho (checkout)? Especial só quem já está
 * nele, para renovar. Sem isso, qualquer um que descobrisse o id compraria o
 * plano com o preço negociado de outro cliente.
 */
export function podeContratarPlano(
    plan: { especial?: unknown; _id?: unknown; id?: unknown } | null | undefined,
    user: { subscription?: { planId?: unknown } | null } | null | undefined,
): boolean {
    if (!isPlanoEspecial(plan)) return true;
    const planoDoUsuario = String(user?.subscription?.planId ?? '');
    return Boolean(planoDoUsuario) && planoDoUsuario === String(plan?._id ?? plan?.id ?? '');
}

export const MSG_PLANO_ESPECIAL = 'Este plano é uma condição especial e só é ativado pela equipe do CNV.';
