/**
 * O que falta para o lojista estar em dia: aparece como selo na lista do CRM e
 * no cabeçalho da ficha. Função pura sobre o que a listagem do CRM já devolve
 * (GET /api/admin/crm), então não custa nenhuma consulta a mais por cliente.
 */

export type CodigoDePendencia =
    | 'sem_login'
    | 'sem_plano'
    | 'teste_vencido'
    | 'plano_vencido'
    | 'sem_creditos'
    | 'cadastro_incompleto';

/** Aba da ficha onde a pendência se resolve. */
export type AbaDaPendencia = 'dados' | 'acessos' | 'planos';

export interface PendenciaDoCliente {
    codigo: CodigoDePendencia;
    rotulo: string;
    detalhe: string;
    tom: 'negative' | 'warning';
    aba: AbaDaPendencia;
}

export interface ClienteParaPendencias {
    firebaseUid?: string | null;
    /** Só a ficha sabe (vem do Firebase); a lista não consulta para não fazer uma chamada por cliente. */
    loginDesativado?: boolean | null;
    displayName?: string | null;
    phoneNumber?: string | null;
    cpf?: string | null;
    address?: { city?: string | null; state?: string | null } | null;
    profileType?: 'cliente' | 'gratis' | null;
    status?: 'active' | 'expired' | 'no_plan' | null;
    planType?: string | null;
    credits?: number | null;
    freeTrialExpired?: boolean | null;
    /** Tela extra: o plano é o da conta principal. */
    isInvitee?: boolean | null;
}

const vazio = (valor?: string | null) => !valor || !String(valor).trim();

/** Campos do cadastro que a equipe precisa para cobrar e falar com o lojista. */
export function camposQueFaltam(cliente: ClienteParaPendencias): string[] {
    const faltam: string[] = [];
    if (vazio(cliente.displayName)) faltam.push('nome');
    if (vazio(cliente.phoneNumber)) faltam.push('telefone');
    if (vazio(cliente.cpf)) faltam.push('CPF ou CNPJ');
    if (vazio(cliente.address?.city)) faltam.push('cidade');
    if (vazio(cliente.address?.state)) faltam.push('UF');
    return faltam;
}

export function pendenciasDoCliente(cliente: ClienteParaPendencias): PendenciaDoCliente[] {
    const pendencias: PendenciaDoCliente[] = [];

    if (vazio(cliente.firebaseUid)) {
        pendencias.push({ codigo: 'sem_login', rotulo: 'Sem login', detalhe: 'Este cadastro não tem login para entrar na plataforma.', tom: 'negative', aba: 'acessos' });
    } else if (cliente.loginDesativado === true) {
        pendencias.push({ codigo: 'sem_login', rotulo: 'Sem login', detalhe: 'O login está desativado: o lojista não consegue entrar.', tom: 'negative', aba: 'acessos' });
    }

    // Tela extra usa o plano da conta principal: a pendência de plano fica lá.
    if (!cliente.isInvitee) {
        const creditos = cliente.credits ?? 0;
        if (cliente.status === 'expired') {
            pendencias.push({ codigo: 'plano_vencido', rotulo: 'Plano vencido', detalhe: 'A assinatura venceu e o acesso à consulta está bloqueado.', tom: 'negative', aba: 'planos' });
        } else if (cliente.status !== 'active') {
            if (cliente.profileType === 'cliente' && cliente.planType === 'credits') {
                // Plano de créditos não tem vencimento: vale enquanto houver saldo.
                if (creditos <= 0) {
                    pendencias.push({ codigo: 'sem_creditos', rotulo: 'Sem créditos', detalhe: 'O pacote de créditos acabou.', tom: 'warning', aba: 'planos' });
                }
            } else if (cliente.freeTrialExpired === true) {
                pendencias.push({ codigo: 'teste_vencido', rotulo: 'Teste vencido', detalhe: 'O teste grátis acabou e nenhum plano foi ativado.', tom: 'negative', aba: 'planos' });
            } else {
                pendencias.push({ codigo: 'sem_plano', rotulo: 'Sem plano', detalhe: 'Nenhum plano de zero km ativo nesta conta.', tom: 'warning', aba: 'planos' });
            }
        }
    }

    const faltam = camposQueFaltam(cliente);
    if (faltam.length > 0) {
        pendencias.push({ codigo: 'cadastro_incompleto', rotulo: 'Cadastro incompleto', detalhe: `Falta ${faltam.join(', ')}.`, tom: 'warning', aba: 'dados' });
    }

    return pendencias;
}

export const temPendencia = (cliente: ClienteParaPendencias) => pendenciasDoCliente(cliente).length > 0;
