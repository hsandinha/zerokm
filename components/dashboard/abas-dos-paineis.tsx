'use client';

// Abas do menu lateral de cada painel, num lugar só: o painel usa e a área de
// Atendimento também, para o menu continuar o mesmo quando a pessoa entra
// nela (o menu lateral nunca some).

import type { ReactNode } from 'react';
import {
    BookOpen, Building2, CarFront, ContactRound, CreditCard, Funnel, Heart, Images, LayoutDashboard, Megaphone,
    MessageCircle, MessagesSquare, Plug, Receipt, Settings2, SlidersHorizontal, Tag, Truck, UserRound, Users, Warehouse,
} from 'lucide-react';
import type { Recurso } from '@/lib/recursos';

export type AbaDoPainel = { id: string; label: string; icon: ReactNode; recurso?: Recurso; badge?: number };

export const ABAS_CONCESSIONARIA: AbaDoPainel[] = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutDashboard size={20} aria-hidden="true" /> },
    { id: 'veiculos', label: 'Meus veículos', icon: <CarFront size={20} aria-hidden="true" /> },
    { id: 'precos', label: 'Estoque e preços', icon: <Tag size={20} aria-hidden="true" /> },
    { id: 'perfil', label: 'Meu perfil', icon: <Building2 size={20} aria-hidden="true" /> },
    { id: 'crm', label: 'CRM', icon: <ContactRound size={20} aria-hidden="true" />, recurso: 'crm' },
    { id: 'anuncios', label: 'Meus anúncios', icon: <Images size={20} aria-hidden="true" />, recurso: 'anuncios' },
    // Atendimento com IA (WhatsApp/Instagram) da loja: rotas próprias, mesmo menu.
    { id: 'atendimento', label: 'Atendimento', icon: <MessagesSquare size={20} aria-hidden="true" />, recurso: 'atendimento' },
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
    { id: 'visao-geral', label: 'Visão Geral', icon: <LayoutDashboard size={20} aria-hidden="true" /> },
    { id: 'usuarios', label: 'Equipe', icon: <Users size={20} aria-hidden="true" /> },
    { id: 'veiculos', label: 'Veículos', icon: <CarFront size={20} aria-hidden="true" /> },
    { id: 'estoque-concessionarias', label: 'Estoque', icon: <Warehouse size={20} aria-hidden="true" /> },
    { id: 'catalogo', label: 'Catálogo', icon: <BookOpen size={20} aria-hidden="true" /> },
    { id: 'concessionarias', label: 'Concessionárias', icon: <Building2 size={20} aria-hidden="true" /> },
    // O que cada concessionária e cada lojista pode usar (lib/recursos.ts), como no Chatrun.
    { id: 'funcionalidades', label: 'Funcionalidades', icon: <SlidersHorizontal size={20} aria-hidden="true" /> },
    { id: 'transportadoras', label: 'Frete', icon: <Truck size={20} aria-hidden="true" /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings2 size={20} aria-hidden="true" /> },
    { id: 'planos', label: 'Planos', icon: <CreditCard size={20} aria-hidden="true" /> },
    { id: 'cobrancas', label: 'Cobranças', icon: <Receipt size={20} aria-hidden="true" /> },
    { id: 'crm', label: 'CRM', icon: <ContactRound size={20} aria-hidden="true" /> },
    { id: 'funil', label: 'Leads', icon: <Funnel size={20} aria-hidden="true" /> },
    { id: 'integracoes', label: 'Integrações', icon: <Plug size={20} aria-hidden="true" /> },
    { id: 'banners', label: 'Banners', icon: <Images size={20} aria-hidden="true" /> },
    { id: 'avisos', label: 'Avisos', icon: <Megaphone size={20} aria-hidden="true" /> },
    // O WhatsApp tem rotas próprias (/dashboard/admin/whatsapp/*), com as telas
    // dele como subitens no mesmo menu.
    { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={20} aria-hidden="true" />, rota: '/dashboard/admin/whatsapp' },
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
