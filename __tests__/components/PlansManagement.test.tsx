import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PlansManagement } from '@/components/settings/PlansManagement';

const PLANO_EXISTENTE = {
    id: 'p1',
    name: 'Consultas Ilimitadas',
    description: 'Acesso total',
    type: 'monthly',
    credits: null,
    price: 699,
    annualPrice: null,
    invitePrice: 0,
    features: ['Visualização completa do estoque'],
    popular: true,
    active: true,
};

let requisicoes: Array<{ url: string; method: string; body: any }>;

const mockFetch = (respostaEscrita?: { ok: boolean; body: any }) =>
    vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(init.body as string) : null;
        requisicoes.push({ url, method, body });
        if (method === 'GET') return { ok: true, json: async () => [PLANO_EXISTENTE] } as Response;
        if (respostaEscrita) {
            return { ok: respostaEscrita.ok, json: async () => respostaEscrita.body } as Response;
        }
        return { ok: true, json: async () => ({ ...PLANO_EXISTENTE, ...body }) } as Response;
    });

beforeEach(() => {
    requisicoes = [];
    vi.stubGlobal('fetch', mockFetch());
});

afterEach(() => vi.unstubAllGlobals());

const abrirNovoPlano = async () => {
    render(<PlansManagement />);
    await screen.findByText('Consultas Ilimitadas');
    fireEvent.click(screen.getByRole('button', { name: /Novo Plano/i }));
};

const campo = (placeholder: string | RegExp) => screen.getByPlaceholderText(placeholder) as HTMLInputElement;
const digitar = (el: HTMLElement, valor: string) => fireEvent.change(el, { target: { value: valor } });
const enviado = () => requisicoes.find(r => r.method === 'POST' || r.method === 'PUT');

describe('PlansManagement — formulário de plano', () => {
    it('nasce com o preço vazio e aceita apagar o conteúdo', async () => {
        await abrirNovoPlano();
        const preco = campo('Ex: 699,90');
        // Antes o campo vinha com "0" que voltava sozinho a cada tentativa de apagar.
        expect(preco.value).toBe('');

        digitar(preco, '699');
        expect(preco.value).toBe('699');
        digitar(preco, '');
        expect(preco.value).toBe('');
    });

    it('preserva o separador decimal enquanto o valor é digitado', async () => {
        await abrirNovoPlano();
        const preco = campo('Ex: 699,90');
        // "699," era normalizado para 699 e o separador sumia antes dos centavos.
        digitar(preco, '699,');
        expect(preco.value).toBe('699,');
        digitar(preco, '699,90');
        expect(preco.value).toBe('699,90');
    });

    it('preserva espaço no fim da linha nos recursos', async () => {
        await abrirNovoPlano();
        const recursos = screen.getByPlaceholderText(/Um recurso por linha/) as HTMLTextAreaElement;
        // O trim a cada tecla apagava o espaço recém-digitado: a palavra
        // seguinte grudava na anterior.
        digitar(recursos, 'Estoque ');
        expect(recursos.value).toBe('Estoque ');
        digitar(recursos, 'Estoque completo');
        expect(recursos.value).toBe('Estoque completo');
    });

    it('preserva a linha em branco criada pelo Enter', async () => {
        await abrirNovoPlano();
        const recursos = screen.getByPlaceholderText(/Um recurso por linha/) as HTMLTextAreaElement;
        // filter(Boolean) engolia a linha vazia e o Enter não tinha efeito.
        digitar(recursos, 'Recurso A\n');
        expect(recursos.value).toBe('Recurso A\n');
    });

    it('converte vírgula decimal e apara os recursos ao salvar', async () => {
        await abrirNovoPlano();
        digitar(campo('Ex: Plano Profissional'), 'Plano Teste');
        digitar(campo('Ex: 10'), '25');
        digitar(campo('Ex: 699,90'), '1.234,56');
        digitar(screen.getByPlaceholderText(/Um recurso por linha/), '  Recurso A  \n\nRecurso B');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

        await waitFor(() => expect(enviado()).toBeTruthy());
        expect(enviado()!.body).toMatchObject({
            name: 'Plano Teste',
            credits: 25,
            price: 1234.56,
            features: ['Recurso A', 'Recurso B'],
        });
    });

    // Vazio é barrado pelo `required` do próprio navegador, antes do handler.
    // O que chega ao handleSave é texto que não vira número — o campo passou a
    // ser type="text" para aceitar vírgula.
    it('bloqueia o envio quando o preço não é um número', async () => {
        await abrirNovoPlano();
        digitar(campo('Ex: Plano Profissional'), 'Preço inválido');
        digitar(campo('Ex: 10'), '5');
        digitar(campo('Ex: 699,90'), 'abc');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/preço válido/i);
        expect(enviado()).toBeUndefined();
    });

    it('mostra o erro da API e mantém o modal aberto', async () => {
        vi.stubGlobal('fetch', mockFetch({ ok: false, body: { error: 'Nome já utilizado' } }));
        await abrirNovoPlano();
        digitar(campo('Ex: Plano Profissional'), 'Duplicado');
        digitar(campo('Ex: 10'), '5');
        digitar(campo('Ex: 699,90'), '10');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Nome já utilizado');
        expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    });

    it('carrega o plano existente para edição sem perder os recursos', async () => {
        render(<PlansManagement />);
        await screen.findByText('Consultas Ilimitadas');
        fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

        expect(campo('Ex: 699,90').value).toBe('699');
        expect((screen.getByPlaceholderText(/Um recurso por linha/) as HTMLTextAreaElement).value)
            .toBe('Visualização completa do estoque');
    });

    it('alternar ativo não manda popular no corpo', async () => {
        render(<PlansManagement />);
        await screen.findByText('Consultas Ilimitadas');
        fireEvent.click(screen.getByRole('button', { name: 'Ativo' }));

        await waitFor(() => expect(requisicoes.find(r => r.method === 'PUT')).toBeTruthy());
        const corpo = requisicoes.find(r => r.method === 'PUT')!.body;
        // A rota só normaliza `popular` quando a chave existe; mandar sem ela é
        // o que impede o destaque de ser apagado no toggle.
        expect(corpo).toEqual({ active: false });
    });
});
