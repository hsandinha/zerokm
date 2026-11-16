/**
 * Tipos e textos do lojista (cliente), compartilhados pela lista do CRM, pela
 * ficha do cliente e pelo cadastro guiado. O formato é o de GET /api/admin/crm.
 */
import type { BadgeTone } from '@/components/ui/Page';

/** Tela extra (convidado) de uma conta: aparece dentro do cliente principal. */
export interface TelaExtra {
    id: string;
    nome: string;
    email: string;
}

export interface CRMClient {
    id: string;
    displayName: string;
    email: string;
    phoneNumber: string;
    cpf: string;
    instagram?: string;
    address: {
        street: string;
        number: string;
        complement?: string;
        neighborhood: string;
        city: string;
        state: string;
        zipCode: string;
    } | null;
    profileType: 'cliente' | 'gratis';
    credits: number;
    status: 'active' | 'expired' | 'no_plan';
    planId?: string | null;
    planName: string | null;
    planType: string | null;
    /** Valor do plano que o cliente paga (tabela ou combinado), sem telas extras. */
    valorPlano?: number | null;
    valorTabela?: number | null;
    valorCombinadoAtivo?: boolean;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    activationMethod: 'manual' | 'cortesia' | 'card' | 'pix' | 'boleto' | null;
    paymentMethod?: 'pix' | 'boleto' | 'card' | null;
    billingType: 'monthly' | 'annual' | null;
    createdAt: string;
    firebaseUid?: string | null;
    hasCard: boolean;
    cardBrand?: string | null;
    cardLastFour?: string | null;
    profileCompletion: number;
    inviteCount: number;
    /** Telas extras ativas desta conta (não aparecem como clientes à parte). */
    telasExtras?: TelaExtra[];
    isInvitee: boolean;
    vendedorId?: string | null;
    vendedorNome?: string | null;
    freeTrialExpiresAt?: string | null;
    freeTrialExpired?: boolean;
}

export interface PlanoDoLojista {
    id: string;
    name: string;
    type: 'monthly' | 'credits';
    credits: number | null;
    price: number;
    annualPrice?: number | null;
    active: boolean;
    /** Condição especial: fora do checkout, só atribuída pela equipe. */
    especial?: boolean;
}

export const STATUS_LABELS: Record<CRMClient['status'], string> = {
    active: 'Ativo',
    expired: 'Expirado',
    no_plan: 'Sem plano',
};

export const STATUS_TONE: Record<CRMClient['status'], BadgeTone> = {
    active: 'positive',
    expired: 'negative',
    no_plan: 'warning',
};

export type PaymentInfo = {
    kind: 'courtesy' | 'pix' | 'boleto' | 'card' | 'unlinked';
    label: string;
};

export function getPaymentInfo(client: Pick<CRMClient, 'status' | 'activationMethod' | 'paymentMethod'>): PaymentInfo | null {
    if (client.status !== 'active' && client.status !== 'expired') return null;
    if (client.activationMethod === 'cortesia') return { kind: 'courtesy', label: 'Cortesia' };
    if (client.paymentMethod === 'pix' || client.activationMethod === 'pix') return { kind: 'pix', label: 'PIX' };
    if (client.paymentMethod === 'boleto' || client.activationMethod === 'boleto') return { kind: 'boleto', label: 'Boleto' };
    if (client.paymentMethod === 'card' || client.activationMethod === 'card') return { kind: 'card', label: 'Cartão' };
    return { kind: 'unlinked', label: 'Não associado' };
}

export const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('pt-BR');
};

export const brl = (valor: number) => `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export function whatsappLink(phone: string, name: string, status: CRMClient['status']) {
    const clean = (phone || '').replace(/\D/g, '');
    if (!clean) return null;
    let msg = '';
    if (status === 'no_plan') {
        msg = encodeURIComponent(`Olá ${name}, vi que você se cadastrou em nossa plataforma. Posso te ajudar a encontrar o plano ideal?`);
    } else if (status === 'expired') {
        msg = encodeURIComponent(`Olá ${name}, seu plano na ZeroKM expirou. Que tal renovar e continuar com acesso completo?`);
    } else {
        msg = encodeURIComponent(`Olá ${name}, tudo bem?`);
    }
    return `https://wa.me/55${clean}?text=${msg}`;
}

export function emailLink(email: string, name: string, status: CRMClient['status']) {
    let subject = '', body = '';
    if (status === 'no_plan') {
        subject = encodeURIComponent('Bem-vindo à ZeroKM: conheça nossos planos');
        body = encodeURIComponent(`Olá ${name},\n\nVimos que você se cadastrou em nossa plataforma e gostaríamos de apresentar nossos planos para acesso completo.\n\nAcesse: ${window.location.origin}/dashboard/cliente\n\nAtenciosamente,\nEquipe ZeroKM`);
    } else if (status === 'expired') {
        subject = encodeURIComponent('Renove seu plano ZeroKM');
        body = encodeURIComponent(`Olá ${name},\n\nSeu plano expirou. Renove agora para continuar aproveitando todos os recursos.\n\nAtenciosamente,\nEquipe ZeroKM`);
    }
    return `mailto:${email}?subject=${subject}&body=${body}`;
}

export const toDateInputValue = (value?: string | null) => {
    const date = value ? new Date(value) : new Date();
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const year = safeDate.getFullYear();
    const month = String(safeDate.getMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const mascaraTelefone = (valor: string) => {
    const d = valor.replace(/\D/g, '').slice(0, 11);
    return d.length <= 10
        ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
        : d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
};

/** Planos que o lojista pode assinar: os de concessionária e de atendimento ficam de fora. */
export async function carregarPlanosDoLojista(): Promise<PlanoDoLojista[]> {
    const res = await fetch('/api/admin/plans');
    const data = await res.json();
    return (Array.isArray(data) ? data : []).filter((p: PlanoDoLojista & { publico?: string }) => p.active && !['concessionaria', 'atendimento'].includes(p.publico || ''));
}
