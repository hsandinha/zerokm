import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmitirBoletoConcessionariaModal } from '@/components/admin/EmitirBoletoConcessionariaModal';
import { PlanoRepasseCard } from '@/components/dealership/PlanoRepasseCard';

afterEach(() => vi.unstubAllGlobals());

const resp = (body: unknown, okStatus = true) => ({ ok: okStatus, json: async () => body });
const PLANOS = [{ id: 'p1', name: 'Pro', price: 499.9, annualPrice: 4999 }];
const COBRANCA = {
    id: 'c1', mpPaymentId: '9001', tipo: 'plano', tipoLabel: 'Plano de repasse', descricao: 'Plano de Repasse Pro (Mensal)', valor: 499.9, status: 'pending', meio: 'boleto',
    vencimento: '2099-01-10T02:59:59Z', criadoEm: '2026-11-16T12:00:00Z', pagoEm: null, baixaManual: false,
    boletoUrl: 'https://mp/boleto.pdf', boletoBarcode: '23793381286000000000300000000401187650000049990',
};

function mockAdmin(faltando: string[]) {
    const posts: any[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
            posts.push(JSON.parse(String(init.body)));
            return resp({ ok: true, cobranca: COBRANCA, email: { enviado: true, para: 'financeiro@alfa.com.br', erro: null } });
        }
        if (url.includes('concessionariaId=')) {
            return resp({ concessionaria: { id: 'l1', nome: 'Alfa', razaoSocial: 'Alfa Ltda', email: 'financeiro@alfa.com.br' }, faltando, planos: PLANOS, banners: [] });
        }
        return resp({ concessionarias: [{ id: 'l1', nome: 'Alfa', ativo: true }, { id: 'l2', nome: 'Beta', ativo: true }] });
    }));
    return posts;
}

describe('modal de emissão de boleto para concessionária', () => {
    it('escolhe a loja, cobra o plano pelo valor da tabela e mostra o boleto emitido', async () => {
        const posts = mockAdmin([]);
        const onEmitido = vi.fn();
        render(<EmitirBoletoConcessionariaModal onClose={() => { }} onEmitido={onEmitido} />);

        const dialog = screen.getByRole('dialog', { name: 'Emitir boleto para concessionária' });
        const emitir = within(dialog).getByRole('button', { name: 'Emitir boleto' });
        expect(emitir).toBeDisabled();

        await within(dialog).findByRole('option', { name: 'Beta' });
        fireEvent.change(within(dialog).getByLabelText('Concessionária'), { target: { value: 'l1' } });
        await waitFor(() => expect(within(dialog).getByLabelText('Valor (R$)')).toHaveValue('499,90'));
        expect(within(dialog).getByLabelText(/E-mail de destino/)).toHaveValue('financeiro@alfa.com.br');

        fireEvent.change(within(dialog).getByLabelText('Período'), { target: { value: 'annual' } });
        await waitFor(() => expect(within(dialog).getByLabelText('Valor (R$)')).toHaveValue('4.999,00'));
        fireEvent.click(emitir);

        const pronto = await screen.findByRole('dialog', { name: 'Boleto emitido' });
        expect(posts[0]).toMatchObject({ concessionariaId: 'l1', tipo: 'plano', planId: 'p1', billingType: 'annual', valor: '4.999,00', enviarEmail: true, email: 'financeiro@alfa.com.br' });
        expect(within(pronto).getByText(COBRANCA.boletoBarcode)).toBeInTheDocument();
        expect(within(pronto).getByRole('link', { name: 'Abrir boleto (PDF)' })).toHaveAttribute('href', 'https://mp/boleto.pdf');
        expect(within(pronto).getByText('Aguardando pagamento')).toBeInTheDocument();
        expect(within(pronto).getByText(/Boleto enviado para financeiro@alfa.com.br/)).toBeInTheDocument();
        expect(onEmitido).toHaveBeenCalled();
    });

    it('cadastro incompleto: avisa o que falta e não deixa emitir', async () => {
        const posts = mockAdmin(['CNPJ válido', 'CEP']);
        render(<EmitirBoletoConcessionariaModal concessionaria={{ id: 'l1', nome: 'Alfa' }} onClose={() => { }} />);

        const dialog = screen.getByRole('dialog', { name: 'Emitir boleto para concessionária' });
        expect(await within(dialog).findByText('O cadastro desta concessionária está incompleto para emitir boleto.')).toBeInTheDocument();
        expect(within(dialog).getByText('CNPJ válido')).toBeInTheDocument();
        expect(within(dialog).getByText('CEP')).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Emitir boleto' })).toBeDisabled();
        expect(posts).toHaveLength(0);
    });

    it('cobrança avulsa exige descrição', async () => {
        const posts = mockAdmin([]);
        render(<EmitirBoletoConcessionariaModal concessionaria={{ id: 'l1', nome: 'Alfa' }} onClose={() => { }} />);
        const dialog = screen.getByRole('dialog');

        fireEvent.click(await within(dialog).findByLabelText('Cobrança avulsa'));
        fireEvent.change(within(dialog).getByLabelText('Valor (R$)'), { target: { value: '150,00' } });
        const emitir = within(dialog).getByRole('button', { name: 'Emitir boleto' });
        expect(emitir).toBeDisabled();

        fireEvent.change(within(dialog).getByLabelText(/Descrição da cobrança/), { target: { value: 'Taxa de adesão' } });
        expect(emitir).not.toBeDisabled();
        fireEvent.click(emitir);

        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toMatchObject({ tipo: 'avulsa', descricao: 'Taxa de adesão', valor: '150,00' });
        expect(posts[0].planId).toBeUndefined();
    });
});

describe('plano de repasse: a concessionária paga por boleto', () => {
    const mockLoja = (respostaBoleto: any) => {
        const posts: string[] = [];
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
            if (init?.method === 'POST') { posts.push(url); return respostaBoleto; }
            return resp({ plano: { ativo: false, status: 'inactive' }, planos: [{ ...PLANOS[0], description: '', features: [] }] });
        }));
        return posts;
    };

    it('gera o boleto e mostra linha digitável, link e situação em modal', async () => {
        const posts = mockLoja(resp({ ok: true, cobranca: COBRANCA }));
        render(<PlanoRepasseCard />);

        fireEvent.click(await screen.findByRole('button', { name: 'Contratar plano' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pagar com boleto' }));

        const dialog = await screen.findByRole('dialog', { name: 'Boleto do plano de repasse' });
        expect(posts).toEqual(['/api/checkout/plano-repasse/boleto']);
        expect(within(dialog).getByText(COBRANCA.boletoBarcode)).toBeInTheDocument();
        expect(within(dialog).getByRole('link', { name: 'Abrir boleto (PDF)' })).toHaveAttribute('href', 'https://mp/boleto.pdf');
        expect(within(dialog).getByText('Aguardando pagamento')).toBeInTheDocument();
    });

    it('cadastro incompleto: o modal diz o que completar', async () => {
        mockLoja(resp({ error: 'x', faltando: ['CNPJ válido', 'Bairro'] }, false));
        render(<PlanoRepasseCard />);

        fireEvent.click(await screen.findByRole('button', { name: 'Contratar plano' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pagar com boleto' }));

        const dialog = await screen.findByRole('dialog', { name: 'Cadastro incompleto' });
        expect(within(dialog).getByText('CNPJ válido')).toBeInTheDocument();
        expect(within(dialog).getByText('Bairro')).toBeInTheDocument();
    });

    it('a equipe só vê "Emitir boleto" quando o servidor libera', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => resp({ plano: { ativo: false, status: 'inactive' }, planos: [{ ...PLANOS[0], description: '', features: [] }], podeEmitirBoleto: false })));
        render(<PlanoRepasseCard concessionariaId="l1" />);

        fireEvent.click(await screen.findByRole('button', { name: 'Ativar plano' }));
        expect(screen.queryByRole('button', { name: 'Emitir boleto' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Pagar com boleto' })).toBeNull();
    });
});
