import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockReminderModal } from '@/components/dealership/StockReminderModal';

const ok = (body: unknown) => ({ ok: true, json: async () => body });

function mockApi({ falhar = false } = {}) {
    const chamadas: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        chamadas.push({ url, method: init?.method || 'GET' });
        if (url.startsWith('/api/dealership/estoque/confirmar')) {
            return falhar ? { ok: false, json: async () => ({ error: 'Concessionária não encontrada' }) } : ok({ ok: true, novos: 40, repasse: 2, total: 42 });
        }
        if (url.startsWith('/api/dealership/metrics')) return ok({ veiculosCadastrados: 42, daysSinceUpdate: 9, statusBreakdown: { verde: 0, amarelo: 0, vermelho: 42 } });
        if (url.startsWith('/api/config/sistema')) return ok({ diasEstoqueDesatualizado: 3 });
        return ok({});
    }));
    return chamadas;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('lembrete de estoque da concessionária', () => {
    it('confirmar grava no servidor: é o que atualiza a data vista pelo lojista', async () => {
        const chamadas = mockApi();
        const onUpdateStock = vi.fn();
        const onConfirmado = vi.fn();
        render(<StockReminderModal onUpdateStock={onUpdateStock} onConfirmado={onConfirmado} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Confirmar estoque atualizado' }));

        await screen.findByRole('dialog', { name: 'Estoque confirmado' });
        expect(chamadas).toContainEqual({ url: '/api/dealership/estoque/confirmar', method: 'POST' });
        expect(screen.getByText(/42 veículos receberam a data de hoje/)).toBeInTheDocument();
        expect(onConfirmado).toHaveBeenCalledTimes(1);
        // Confirmar não tira a loja da tela em que ela está.
        expect(onUpdateStock).not.toHaveBeenCalled();
    });

    it('"Revisar preços" só leva à aba de preços e deixa isso claro no rótulo', async () => {
        const chamadas = mockApi();
        const onUpdateStock = vi.fn();
        render(<StockReminderModal onUpdateStock={onUpdateStock} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Revisar preços' }));

        expect(onUpdateStock).toHaveBeenCalledTimes(1);
        expect(chamadas.some(c => c.method === 'POST')).toBe(false);
        // O rótulo antigo prometia uma atualização que não acontecia.
        expect(screen.queryByRole('button', { name: /Atualizar estoque agora/ })).toBeNull();
    });

    it('falha ao confirmar aparece na tela e o lembrete continua aberto', async () => {
        mockApi({ falhar: true });
        const onConfirmado = vi.fn();
        render(<StockReminderModal onUpdateStock={() => { }} onConfirmado={onConfirmado} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Confirmar estoque atualizado' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Concessionária não encontrada');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar estoque atualizado' })).not.toBeDisabled());
        expect(onConfirmado).not.toHaveBeenCalled();
    });
});
