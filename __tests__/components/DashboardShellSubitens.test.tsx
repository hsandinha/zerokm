import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// O menu lateral não pode sumir ao entrar numa área com várias telas
// (Atendimento, WhatsApp): as telas dela aparecem como subitens.
vi.mock('next-auth/react', () => ({ signOut: vi.fn(), useSession: () => ({ data: null }) }));
vi.mock('next/image', () => ({ default: (p: { alt: string }) => <span>{p.alt}</span> }));
vi.mock('@/components/UserMenu', () => ({ default: () => <span>menu do usuário</span> }));
vi.mock('@/components/profile/MeuPerfil', () => ({ MeuPerfil: () => null }));
vi.mock('@/components/mobile/MobileTabBar', () => ({
    MobileTabBar: ({ items }: { items: Array<{ id: string; label: string }> }) => (
        <ul aria-label="barra do celular">{items.map(i => <li key={i.id}>{i.label}</li>)}</ul>
    ),
}));

import { DashboardShell } from '../../components/dashboard/DashboardShell';

const tabs = [
    { id: 'visao-geral', label: 'Visão geral', icon: <i /> },
    {
        id: 'atendimento',
        label: 'Atendimento',
        icon: <i />,
        children: [
            { id: 'at:central', label: 'Central', icon: <i />, badge: 3 },
            { id: 'at:pipeline', label: 'Funil', icon: <i /> },
        ],
    },
];

function montar(activeId: string, onSelect = vi.fn()) {
    render(
        <DashboardShell sectionLabel="Concessionária" tabs={tabs} activeId={activeId} onSelect={onSelect} user={{ name: 'Ana', role: 'Concessionária' }}>
            <p>conteúdo</p>
        </DashboardShell>,
    );
    return onSelect;
}

describe('menu lateral com subitens', () => {
    it('numa tela do atendimento, as abas do painel continuam e as telas aparecem abaixo de Atendimento', () => {
        const onSelect = montar('at:pipeline');
        const menu = screen.getByRole('navigation', { name: 'Concessionária' });
        expect(within(menu).getByRole('button', { name: 'Visão geral' })).toBeInTheDocument();
        const grupo = within(menu).getByRole('group', { name: 'Atendimento' });
        expect(within(grupo).getByRole('button', { name: 'Funil' })).toHaveAttribute('aria-current', 'page');
        expect(within(grupo).getByRole('button', { name: 'Central, 3' })).toBeInTheDocument();
        // Trilha do topo: seção › área › tela.
        expect(screen.getByRole('navigation', { name: 'Você está em' })).toHaveTextContent('ConcessionáriaAtendimentoFunil');
        fireEvent.click(within(grupo).getByRole('button', { name: 'Central, 3' }));
        expect(onSelect).toHaveBeenCalledWith('at:central');
    });

    it('fora da área, os subitens ficam fechados', () => {
        montar('visao-geral');
        expect(screen.queryByRole('group', { name: 'Atendimento' })).not.toBeInTheDocument();
    });

    it('no celular, a barra mostra as telas da área aberta', () => {
        montar('at:central');
        const barra = screen.getByRole('list', { name: 'barra do celular' });
        expect(barra).toHaveTextContent('Central');
        expect(barra).toHaveTextContent('Funil');
        expect(barra).not.toHaveTextContent('Atendimento');
    });
});
