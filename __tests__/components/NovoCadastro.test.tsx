import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// As server actions puxam Mongo e Firebase no import: fora do Next isso explode.
const createUser = vi.fn(async (_dados: unknown) => ({ success: true, uid: 'uid-novo' }));
vi.mock('@/app/dashboard/admin/users/actions', () => ({
    createUser: (dados: unknown) => createUser(dados),
    criarUsuarioDaLoja: vi.fn(async () => ({ success: true, vinculado: false, senhaProvisoria: 'mudar123' })),
    getUserAccessStatus: vi.fn(async () => ({ success: true, disabled: false, allowedProfiles: ['gratis'] })),
    updateUserProfiles: vi.fn(async () => ({ success: true })),
    toggleUserStatus: vi.fn(async () => ({ success: true })),
    deleteUser: vi.fn(async () => ({ success: true })),
}));

let perfilDaSessao: string | null = 'administrador';
vi.mock('next-auth/react', () => ({
    getSession: vi.fn(async () => (perfilDaSessao ? { user: { profile: perfilDaSessao } } : null)),
}));

import { NovoCadastroButton, NovoCadastroModal, erroDoDocumento } from '@/components/admin/NovoCadastro';

const PLANOS = [
    { id: 'p1', name: 'Acesso Total', type: 'monthly', credits: null, price: 699, annualPrice: 6990, active: true, publico: 'cliente' },
    { id: 'p2', name: 'Pacote 10', type: 'credits', credits: 10, price: 100, active: true },
    { id: 'p3', name: 'Repasse', type: 'monthly', credits: null, price: 300, active: true, publico: 'concessionaria' },
];

const CLIENTE_GRAVADO = {
    id: 'novo-1', displayName: 'Alfa Motors', email: 'alfa@x.com', phoneNumber: '', cpf: '', address: { city: 'Betim', state: 'MG' },
    profileType: 'cliente', credits: 0, status: 'active', planId: 'p1', planName: 'Acesso Total', planType: 'monthly',
    expiresAt: '2027-01-01T00:00:00.000Z', daysUntilExpiry: 40, activationMethod: 'manual', paymentMethod: 'pix', billingType: 'monthly',
    createdAt: '2026-11-16T12:00:00.000Z', firebaseUid: 'fb-1', hasCard: false, profileCompletion: 33, inviteCount: 0, isInvitee: false,
};

type Chamada = { url: string; method: string; body: any };
let chamadas: Chamada[] = [];

beforeEach(() => {
    perfilDaSessao = 'administrador';
    chamadas = [];
    createUser.mockClear();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        chamadas.push({ url: u, method, body });
        const ok = (data: unknown) => ({ ok: true, json: async () => data, text: async () => JSON.stringify(data) }) as Response;
        if (u.includes('/api/admin/crm/acesso')) return ok({ ok: true, senhaProvisoria: body?.senha || 'k7m2p9xq' });
        if (u.includes('/api/admin/crm/renew-trial')) return ok({ ok: true, freeTrialExpiresAt: '2026-11-17T12:00:00.000Z' });
        if (u.includes('/api/admin/crm/invites')) return ok([]);
        if (u.includes('/api/admin/crm?id=')) return ok({ client: CLIENTE_GRAVADO });
        if (u.includes('/api/admin/crm') && method === 'POST') return ok({ ok: true, tempPassword: '123456', id: 'novo-1', firebaseUid: 'fb-1' });
        if (u.includes('/api/admin/crm') && method === 'PATCH') return ok({ ok: true });
        if (u.includes('/api/admin/plans')) return ok(PLANOS);
        return ok({});
    }));
});

afterEach(() => vi.unstubAllGlobals());

const preencher = (rotulo: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
/** O primeiro seletor do passo de assinatura é o do plano. */
const seletorDePlano = () => screen.getAllByRole('combobox')[0];
const chamadasPara = (trecho: string, method: string) => chamadas.filter(c => c.url.includes(trecho) && c.method === method);

describe('Novo cadastro: escolha do perfil', () => {
    it('administrador vê os três perfis em cartões', async () => {
        render(<NovoCadastroModal onClose={() => {}} />);
        expect(await screen.findByRole('button', { name: /^Concessionária/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Lojista \(cliente\)/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Equipe interna/ })).toBeInTheDocument();
    });

    it('administrativo não vê Lojista: as rotas do CRM recusam o perfil', async () => {
        perfilDaSessao = 'administrativo';
        render(<NovoCadastroModal onClose={() => {}} />);
        expect(await screen.findByRole('button', { name: /^Equipe interna/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Concessionária/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Lojista/ })).not.toBeInTheDocument();
    });

    it('perfil sem permissão recebe o aviso em vez dos cartões', async () => {
        perfilDaSessao = 'marketing';
        render(<NovoCadastroModal onClose={() => {}} />);
        expect(await screen.findByText(/Seu perfil não cria cadastros/)).toBeInTheDocument();
    });

    it('perfilInicial que o criador não pode abrir cai na escolha', async () => {
        perfilDaSessao = 'administrativo';
        render(<NovoCadastroModal onClose={() => {}} perfilInicial="lojista" />);
        expect(await screen.findByRole('button', { name: /^Equipe interna/ })).toBeInTheDocument();
        expect(screen.queryByText('Novo lojista')).not.toBeInTheDocument();
    });

    it('o botão abre o modal já no perfil pedido e avisa ao fechar', async () => {
        const onFechar = vi.fn();
        render(<NovoCadastroButton perfilInicial="equipe" onFechar={onFechar} />);
        fireEvent.click(screen.getByRole('button', { name: 'Novo cadastro' }));
        expect(await screen.findByText('Novo usuário da equipe')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(onFechar).toHaveBeenCalled();
    });

    it('a concessionária segue o passo a passo guiado', async () => {
        render(<NovoCadastroModal onClose={() => {}} />);
        fireEvent.click(await screen.findByRole('button', { name: /^Concessionária/ }));
        expect(await screen.findByText('Nova concessionária')).toBeInTheDocument();
    });
});

describe('Novo cadastro: lojista', () => {
    const abrir = async (onCriado = vi.fn()) => {
        render(<NovoCadastroModal onClose={() => {}} onCriado={onCriado} perfilInicial="lojista" />);
        await screen.findByText('Novo lojista');
        return onCriado;
    };

    const salvarDados = async () => {
        preencher('Nome', 'Alfa Motors');
        preencher(/^E-mail/, 'Alfa@X.com');
        preencher('Cidade', 'Betim');
        preencher('UF', 'mg');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
        await screen.findByText('Login criado.');
    };

    it('não avança sem nome e e-mail, nem com documento inválido', async () => {
        await abrir();
        fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
        expect(await screen.findByText('Informe o nome do lojista.')).toBeInTheDocument();
        preencher('Nome', 'Alfa');
        preencher(/^E-mail/, 'alfa@x.com');
        preencher('CPF ou CNPJ', '111.111.111-11');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
        expect(await screen.findByText('CPF inválido.')).toBeInTheDocument();
        expect(chamadasPara('/api/admin/crm', 'POST')).toHaveLength(0);
        // O primeiro passo não pode ser pulado.
        expect(screen.queryByRole('button', { name: 'Pular' })).not.toBeInTheDocument();
    });

    it('grava os dados ao avançar e mostra o login com a senha provisória', async () => {
        const onCriado = await abrir();
        await salvarDados();
        const [post] = chamadasPara('/api/admin/crm', 'POST');
        expect(post.body).toMatchObject({ nome: 'Alfa Motors', email: 'alfa@x.com', address: { city: 'Betim', state: 'MG' } });
        expect(onCriado).toHaveBeenCalledWith({ tipo: 'lojista', id: 'novo-1' });
        expect(screen.getByText('123456')).toBeInTheDocument();
    });

    it('troca a senha provisória ao salvar o passo de acesso', async () => {
        await abrir();
        await salvarDados();
        fireEvent.click(screen.getByLabelText('Definir a senha'));
        preencher('Senha provisória', 'loja2026');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
        await screen.findByText('Como este lojista começa');
        expect(chamadasPara('/api/admin/crm/acesso', 'POST')[0].body).toEqual({ userId: 'novo-1', senha: 'loja2026' });
    });

    it('ativa o plano escolhido e chega ao resumo com o que ficou pendente', async () => {
        await abrir();
        await salvarDados();
        fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
        await screen.findByText('Como este lojista começa');
        // Plano de concessionária não é oferecido ao lojista.
        await waitFor(() => expect(seletorDePlano()).toHaveValue('p1'));
        expect(screen.queryByText(/Repasse/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
        await screen.findByText(/Convidados são telas extras/);
        const [patch] = chamadasPara('/api/admin/crm', 'PATCH');
        expect(patch.body).toMatchObject({ userId: 'novo-1', planId: 'p1', activationMethod: 'manual', paymentFrequency: 'monthly' });
        expect(chamadasPara('/api/admin/crm/acesso', 'POST')).toHaveLength(0);

        fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
        expect(await screen.findByText('Alfa Motors está cadastrado.')).toBeInTheDocument();
        expect(screen.getByText(/Acesso Total \(mensal\)/)).toBeInTheDocument();
        expect(await screen.findByText('Cadastro incompleto')).toBeInTheDocument();
        expect(screen.getByText('Falta telefone, CPF ou CNPJ.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Abrir ficha' })).toBeInTheDocument();
    });

    it('cortesia e valor combinado vão com a origem certa', async () => {
        await abrir();
        await salvarDados();
        fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
        await screen.findByText('Como este lojista começa');
        await waitFor(() => expect(seletorDePlano()).toHaveValue('p1'));

        fireEvent.click(screen.getByLabelText('Valor combinado'));
        fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
        expect(await screen.findByText('Informe o valor combinado com o cliente.')).toBeInTheDocument();
        preencher(/^Valor combinado \(mês\)/, '500,00');
        fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
        await screen.findByText(/Convidados são telas extras/);
        expect(chamadasPara('/api/admin/crm', 'PATCH')[0].body).toMatchObject({ planId: 'p1', valorPlano: '500,00', salvarValorCombinado: true, activationMethod: 'manual' });
    });

    it('teste grátis usa a rota de renovação do teste', async () => {
        await abrir();
        await salvarDados();
        fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
        await screen.findByText('Como este lojista começa');
        fireEvent.click(screen.getByLabelText('Teste grátis'));
        fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
        await screen.findByText(/Convidados são telas extras/);
        expect(chamadasPara('/api/admin/crm/renew-trial', 'POST')[0].body).toEqual({ userId: 'novo-1' });
        expect(chamadasPara('/api/admin/crm', 'PATCH')).toHaveLength(0);
    });
});

describe('Novo cadastro: equipe interna', () => {
    it('cria o usuário com a senha provisória e os perfis escolhidos', async () => {
        const onCriado = vi.fn();
        render(<NovoCadastroModal onClose={() => {}} onCriado={onCriado} perfilInicial="equipe" />);
        await screen.findByText('Novo usuário da equipe');
        // O perfil concessionária não faz parte do cadastro de equipe.
        expect(screen.queryByLabelText('Concessionária')).not.toBeInTheDocument();
        preencher('Nome completo', 'Ana Souza');
        preencher(/^E-mail/, 'ana@cnv.com.br');
        preencher(/^Senha provisória/, 'entrar123');
        fireEvent.click(screen.getByLabelText('Gerente'));
        fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }));
        expect(await screen.findByText('Usuário criado.')).toBeInTheDocument();
        expect(createUser).toHaveBeenCalledWith({ email: 'ana@cnv.com.br', password: 'entrar123', displayName: 'Ana Souza', allowedProfiles: ['operador', 'gerente'] });
        expect(onCriado).toHaveBeenCalledWith({ tipo: 'equipe', id: 'uid-novo' });
    });

    it('administrativo não consegue marcar Administrador', async () => {
        perfilDaSessao = 'administrativo';
        render(<NovoCadastroModal onClose={() => {}} perfilInicial="equipe" />);
        await screen.findByText('Novo usuário da equipe');
        expect(screen.getByLabelText('Administrador')).toBeDisabled();
        expect(screen.getByLabelText('Gerente')).not.toBeDisabled();
    });
});

describe('erroDoDocumento', () => {
    it('aceita vazio, CPF e CNPJ válidos e recusa o resto', () => {
        expect(erroDoDocumento('')).toBeNull();
        expect(erroDoDocumento('529.982.247-25')).toBeNull();
        expect(erroDoDocumento('11.222.333/0001-81')).toBeNull();
        expect(erroDoDocumento('123')).toMatch(/CPF \(11 dígitos\) ou CNPJ/);
        expect(erroDoDocumento('11.222.333/0001-80')).toBe('CNPJ inválido.');
    });
});
