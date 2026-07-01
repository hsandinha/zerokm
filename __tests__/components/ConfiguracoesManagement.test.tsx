import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfiguracoesManagement } from '@/components/admin/ConfiguracoesManagement';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const MOCK_CONFIG = {
    whatsapp: '5511926384826',
    email_support: 'suporte@test.com',
    email_sales: 'vendas@test.com',
    email_general: 'geral@test.com',
    address: 'São Paulo, SP',
    business_hours: 'Seg-Sex: 09-18',
    cnpj: '12.345.678/0001-90',
};

describe('ConfiguracoesManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Teste de Componente — Carregamento ──
    it('should show loading state initially', () => {
        mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
        render(<ConfiguracoesManagement />);
        expect(screen.getByText('Carregando configurações...')).toBeInTheDocument();
    });

    it('should render the form after loading data from API', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => MOCK_CONFIG })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ price_cents: 5000, duration_days: 7 }) });

        render(<ConfiguracoesManagement />);

        await waitFor(() => {
            expect(screen.getByText('Painel de Contatos e Rodapé Global')).toBeInTheDocument();
        });
    });

    // ── Teste de Integração — Input preenchido com dados da API ──
    it('should populate inputs with data fetched from API', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => MOCK_CONFIG })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ price_cents: 5000, duration_days: 7 }) });

        render(<ConfiguracoesManagement />);

        await waitFor(() => {
            const whatsappInput = screen.getByPlaceholderText(/Apenas números com DDI/i);
            expect(whatsappInput).toHaveValue('5511926384826');
        });
    });

    // ── Teste de Segurança — WhatsApp aceita somente números ──
    it('should strip non-numeric characters from WhatsApp input', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ...MOCK_CONFIG, whatsapp: '' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ price_cents: 5000, duration_days: 7 }) });

        render(<ConfiguracoesManagement />);

        await waitFor(() => {
            expect(screen.getByText('Painel de Contatos e Rodapé Global')).toBeInTheDocument();
        });

        const whatsappInput = screen.getByPlaceholderText(/Apenas números com DDI/i) as HTMLInputElement;
        fireEvent.change(whatsappInput, { target: { value: '+55 (11) 92638-4826' } });
        expect(whatsappInput.value).toBe('5511926384826');
    });

    // ── Teste de Integração — Salvar configurações ──
    it('should call PATCH API when form is submitted', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => MOCK_CONFIG }) // GET contato
            .mockResolvedValueOnce({ ok: true, json: async () => ({ price_cents: 5000, duration_days: 7 }) }) // GET banners
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) // PATCH contato
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }); // PATCH banners

        render(<ConfiguracoesManagement />);

        await waitFor(() => {
            expect(screen.getByText('Salvar Alterações Globais')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Salvar Alterações Globais'));

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledTimes(4);
            const patchCall = mockFetch.mock.calls[2]; // 3rd call is PATCH contato
            expect(patchCall[0]).toBe('/api/config/contato');
            expect(patchCall[1].method).toBe('PATCH');
            const patchCall2 = mockFetch.mock.calls[3]; // 4th call is PATCH banners
            expect(patchCall2[0]).toBe('/api/config/banners');
            expect(patchCall2[1].method).toBe('PATCH');
        });
    });

    // ── Teste de UI — Feedback de sucesso ──
    it('should display success message after successful save', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => MOCK_CONFIG })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ price_cents: 5000, duration_days: 7 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

        render(<ConfiguracoesManagement />);

        await waitFor(() => {
            expect(screen.getByText('Salvar Alterações Globais')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Salvar Alterações Globais'));

        await waitFor(() => {
            expect(screen.getByText('Configurações de contato salvas com sucesso!')).toBeInTheDocument();
        });
    });

    // ── Teste de UI — Feedback de erro ──
    it('should display error message when save fails', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => MOCK_CONFIG })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ price_cents: 5000, duration_days: 7 }) })
            .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Sem permissão' }) }) // Erro no contato
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

        render(<ConfiguracoesManagement />);

        await waitFor(() => {
            expect(screen.getByText('Salvar Alterações Globais')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Salvar Alterações Globais'));

        await waitFor(() => {
            expect(screen.getByText('Sem permissão')).toBeInTheDocument();
        });
    });

    // ── Teste de Acessibilidade ──
    it('should have proper label elements for all inputs', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => MOCK_CONFIG })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ price_cents: 5000, duration_days: 7 }) });

        render(<ConfiguracoesManagement />);

        await waitFor(() => {
            expect(screen.getByText('WhatsApp (Link Flutuante e Rodapé)')).toBeInTheDocument();
            expect(screen.getByText('E-mail Geral / Principal')).toBeInTheDocument();
            expect(screen.getByText('E-mail de Suporte')).toBeInTheDocument();
            expect(screen.getByText('E-mail de Vendas (Comercial)')).toBeInTheDocument();
            expect(screen.getByText('Horário de Funcionamento')).toBeInTheDocument();
            expect(screen.getByText('Localização (Cidade/Estado)')).toBeInTheDocument();
            expect(screen.getByText('CNPJ Comercial')).toBeInTheDocument();
        });
    });

    // ── Teste de Snapshot ──
    it('should match snapshot after loading', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => MOCK_CONFIG })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ price_cents: 5000, duration_days: 7 }) });

        const { container } = render(<ConfiguracoesManagement />);

        await waitFor(() => {
            expect(screen.getByText('Painel de Contatos e Rodapé Global')).toBeInTheDocument();
        });

        expect(container).toMatchSnapshot();
    });
});
