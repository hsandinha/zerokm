/** Cliente da carteira do vendedor, como vem de /api/vendedor/clientes. */
export interface ClienteCarteira {
    id: string;
    nome?: string;
    email?: string;
    telefone?: string;
    plano?: string | null;
    statusPlano?: string | null;
    vencimento?: string | null;
    dataCadastro?: string | null;
    vendedorId?: string | null;
}

export type Farol = 'expired' | 'no_plan' | 'expiring_soon' | 'active';

export const DIA = 86_400_000;

/** Situação do plano para o farol: vencido, sem plano, vence em até 5 dias ou regular. */
export function farolDe(c: ClienteCarteira, agora = Date.now()): { farol: Farol; dias: number | null } {
    if (c.vencimento) {
        const dias = Math.ceil((new Date(c.vencimento).getTime() - agora) / DIA);
        if (dias < 0) return { farol: 'expired', dias };
        if (dias <= 5) return { farol: 'expiring_soon', dias };
        return { farol: 'active', dias };
    }
    return { farol: c.statusPlano === 'active' ? 'active' : 'no_plan', dias: null };
}

export function linkWhatsApp(telefone: string | undefined, mensagem: string) {
    const n = (telefone ?? '').replace(/\D/g, '');
    if (n.length < 10) return null;
    return `https://wa.me/${n.startsWith('55') ? n : `55${n}`}?text=${encodeURIComponent(mensagem)}`;
}
