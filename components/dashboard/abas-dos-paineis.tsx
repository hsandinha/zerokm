'use client';

// Abas do menu lateral de cada painel, num lugar só: o painel usa e a área de
// Atendimento também, para o menu continuar o mesmo quando a pessoa entra
// nela (o menu lateral nunca some).

import type { ReactNode } from 'react';
import {
    BookOpen, Building2, CarFront, ContactRound, CreditCard, Funnel, Headset, Heart, Images, LayoutDashboard, Megaphone,
    MessageCircle, MessagesSquare, Plug, Receipt, Settings2, SlidersHorizontal, Tag, Truck, UserRound, Users, Warehouse,
} from 'lucide-react';
import type { Recurso } from '@/lib/recursos';

export type AbaDoPainel = {
    id: string;
    label: string;
    icon: ReactNode;
    recurso?: Recurso;
    badge?: number;
    /** Só o titular da concessionária vê (lib/utils/atendentesLoja.ts). */
    soTitular?: boolean;
    /**
     * Assunto da aba: o menu lateral junta as abas seguidas do mesmo grupo sob um
     * título (ex.: CADASTROS). A ordem da lista é a ordem do menu.
     */
    grupo?: string;
};

/** Títulos dos grupos do menu lateral, iguais em todos os painéis. */
export const GRUPOS_DO_MENU = {
    cadastros: 'Cadastros',
    veiculos: 'Veículos',
    estoque: 'Estoque',
    vendas: 'Vendas e atendimento',
    financeiro: 'Financeiro',
    divulgacao: 'Divulgação',
    sistema: 'Sistema',
    loja: 'Minha loja',
} as const;
const G = GRUPOS_DO_MENU;

export const ABAS_CONCESSIONARIA: AbaDoPainel[] = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutDashboard size={20} aria-hidden="true" /> },
    { id: 'veiculos', label: 'Meus veículos', icon: <CarFront size={20} aria-hidden="true" />, grupo: G.estoque },
    { id: 'precos', label: 'Estoque e preços', icon: <Tag size={20} aria-hidden="true" />, grupo: G.estoque },
    { id: 'crm', label: 'CRM', icon: <ContactRound size={20} aria-hidden="true" />, recurso: 'crm', grupo: G.vendas },
    // Atendimento com IA (WhatsApp/Instagram) da loja: rotas próprias, mesmo menu.
    { id: 'atendimento', label: 'Atendimento', icon: <MessagesSquare size={20} aria-hidden="true" />, recurso: 'atendimento', grupo: G.vendas },
    { id: 'anuncios', label: 'Meus anúncios', icon: <Images size={20} aria-hidden="true" />, recurso: 'anuncios', grupo: G.vendas },
    { id: 'perfil', label: 'Meu perfil', icon: <Building2 size={20} aria-hidden="true" />, grupo: G.loja },
    { id: 'atendentes', label: 'Atendentes', icon: <Headset size={20} aria-hidden="true" />, soTitular: true, grupo: G.loja },
    // Boletos e pagamentos da loja (plano de repasse, banners, cobranças avulsas).
    { id: 'cobrancas', label: 'Cobranças', icon: <Receipt size={20} aria-hidden="true" />, soTitular: true, grupo: G.loja },
];

/** Abas do cliente (lojista). Favoritos depende do plano e do CNV. */
export function abasDoCliente(opts: { podeFavoritar: boolean; novosFavoritos: number; podeAtendimento: boolean }): AbaDoPainel[] {
    return [
        { id: 'veiculos', label: 'Veículos', icon: <CarFront size={20} aria-hidden="true" /> },
        ...(opts.podeFavoritar
            ? [{ id: 'favoritos', label: 'Favoritos', icon: <Heart size={20} aria-hidden="true" />, badge: opts.novosFavoritos }]
            : []),
        { id: 'perfil', label: 'Meu perfil', icon: <UserRound size={20} aria-hidden="true" /> },
        ...(opts.podeAtendimento
            ? [{ id: 'atendimento', label: 'Atendimento', icon: <MessagesSquare size={20} aria-hidden="true" /> }]
            : []),
    ];
}

/** Abas da Administração. `rota`: abre fora das abas (o WhatsApp tem rotas próprias). */
export type AbaDoAdmin = AbaDoPainel & { rota?: string };

export const ABAS_ADMIN: AbaDoAdmin[] = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutDashboard size={20} aria-hidden="true" /> },

    { id: 'concessionarias', label: 'Concessionárias', icon: <Building2 size={20} aria-hidden="true" />, grupo: G.cadastros },
    // Lojistas e revendas com plano (a tela se chama Clientes).
    { id: 'crm', label: 'Clientes', icon: <ContactRound size={20} aria-hidden="true" />, grupo: G.cadastros },
    { id: 'usuarios', label: 'Equipe', icon: <Users size={20} aria-hidden="true" />, grupo: G.cadastros },

    // Consulta de preços (o que o lojista vê), estoque das lojas, versões e frete.
    { id: 'veiculos', label: 'Consulta', icon: <CarFront size={20} aria-hidden="true" />, grupo: G.veiculos },
    { id: 'estoque-concessionarias', label: 'Estoque', icon: <Warehouse size={20} aria-hidden="true" />, grupo: G.veiculos },
    { id: 'catalogo', label: 'Catálogo', icon: <BookOpen size={20} aria-hidden="true" />, grupo: G.veiculos },
    { id: 'transportadoras', label: 'Frete', icon: <Truck size={20} aria-hidden="true" />, grupo: G.veiculos },

    { id: 'funil', label: 'Leads', icon: <Funnel size={20} aria-hidden="true" />, grupo: G.vendas },
    // O WhatsApp tem rotas próprias (/dashboard/admin/whatsapp/*), com as telas
    // dele como subitens no mesmo menu.
    { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={20} aria-hidden="true" />, rota: '/dashboard/admin/whatsapp', grupo: G.vendas },

    { id: 'planos', label: 'Planos', icon: <CreditCard size={20} aria-hidden="true" />, grupo: G.financeiro },
    { id: 'cobrancas', label: 'Cobranças', icon: <Receipt size={20} aria-hidden="true" />, grupo: G.financeiro },

    { id: 'banners', label: 'Banners', icon: <Images size={20} aria-hidden="true" />, grupo: G.divulgacao },
    { id: 'avisos', label: 'Avisos', icon: <Megaphone size={20} aria-hidden="true" />, grupo: G.divulgacao },

    // O que cada concessionária e cada lojista pode usar (lib/recursos.ts), como no Chatrun.
    { id: 'funcionalidades', label: 'Funcionalidades', icon: <SlidersHorizontal size={20} aria-hidden="true" />, grupo: G.sistema },
    { id: 'integracoes', label: 'Integrações', icon: <Plug size={20} aria-hidden="true" />, grupo: G.sistema },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings2 size={20} aria-hidden="true" />, grupo: G.sistema },
];

// Gerente não vê equipe, planos, carteira de clientes, leads, cobranças nem
// integrações. A API de cada uma também recusa o perfil: esconder o menu
// sozinho não protege nada.
const OCULTAS_GERENTE = new Set(['usuarios', 'planos', 'crm', 'funil', 'cobrancas', 'integracoes', 'whatsapp', 'avisos', 'funcionalidades']);

/** Abas da Administração que o perfil vê. */
export function abasDoAdmin(perfil: string | null | undefined): AbaDoAdmin[] {
    if (perfil === 'marketing') return ABAS_ADMIN.filter(t => t.id === 'funil' || t.id === 'integracoes');
    if (perfil === 'gerente') return ABAS_ADMIN.filter(t => !OCULTAS_GERENTE.has(t.id));
    return ABAS_ADMIN;
}
