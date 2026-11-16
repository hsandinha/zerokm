import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// As server actions puxam Mongo e Firebase no import; a ficha só as usa na aba Acessos.
vi.mock('@/app/dashboard/admin/users/actions', () => ({
    listarUsuariosDaLoja: vi.fn(async () => ({ success: true, usuarios: [] })),
    criarUsuarioDaLoja: vi.fn(async () => ({ success: true, vinculado: false })),
    desvincularUsuarioDaLoja: vi.fn(async () => ({ success: true })),
    redefinirSenhaDoUsuarioDaLoja: vi.fn(async () => ({ success: true })),
}));

import { FichaConcessionariaModal } from '@/components/admin/FichaConcessionaria';
import { ConcessionariasManagement } from '@/components/admin/ConcessionariasManagement';
import { NovaConcessionariaGuiada } from '@/components/admin/NovaConcessionariaGuiada';
import { permissoesDaFicha } from '@/lib/utils/permissoesDaFicha';
import { pendenciasDaLoja } from '@/lib/utils/pendenciasDaLoja';

afterEach(() => vi.unstubAllGlobals());

const resp = (body: unknown, ok = true) => ({ ok, json: async () => body });
const HOJE = new Date().toISOString();

const LOJA = {
    id: 'l1', nome: 'Alfa Veículos', razaoSocial: 'Alfa Ltda', cnpj: '12345678000199', cidade: 'Belo Horizonte', uf: 'MG',
    ativo: true, marcaIds: [] as string[], marcas: [] as string[], temLogin: false, totalVeiculos: 0, ultimaAtualizacao: HOJE,
    planoRepasse: { ativo: false, status: 'inactive', planName: null, billingType: null, expiresAt: null, activationMethod: null },
    repassesCadastrados: 0,
};

function fichaDe(perfil: string, loja = LOJA) {
    return {
        concessionaria: loja,
        operador: null,
        acessos: { titulares: [], totalTitulares: loja.temLogin ? 1 : 0, atendentes: 0, atendentesAtivos: 0, limiteAtendentes: 5 },
        planoRepasse: loja.planoRepasse,
        atendimento: { liberado: false, situacao: 'nao_liberado', plano: null, ate: null },
        pendencias: pendenciasDaLoja(loja),
        permissoes: permissoesDaFicha(perfil),
    };
}

/** fetch da tela: devolve o que cada rota responderia e guarda as chamadas. */
function mockFetch(perfil: string, loja = LOJA) {
    const chamadas: Array<{ url: string; method: string; body?: any }> = [];
    let atual = loja;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        chamadas.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        const u = String(url);
        if (u.endsWith('/ficha')) return resp(fichaDe(perfil, atual));
        if (u.includes('/catalog-brand')) {
            const marcaIds: string[] = chamadas[chamadas.length - 1].body.marcaIds;
            atual = { ...atual, marcaIds, marcas: marcaIds.map(id => (id === 'm1' ? 'Fiat' : 'Jeep')) };
            return resp({ marcaIds: atual.marcaIds, marcas: atual.marcas, marcaId: marcaIds[0] ?? null, marca: atual.marcas[0] ?? null });
        }
        if (u.includes('/api/tables/marcas')) return resp([{ id: 'm1', nome: 'Fiat' }, { id: 'm2', nome: 'Jeep' }]);
        if (u.includes('/api/admin/users')) return resp([{ _id: 'op1', displayName: 'Ana Operadora', email: 'ana@cnv.com' }]);
        if (u.includes('/api/dealership/plano-repasse')) return resp({ plano: atual.planoRepasse, planos: [], podeEmitirBoleto: false });
        if (u.includes('/api/dealership/atendentes')) {
            return resp({ concessionaria: { id: 'l1', nome: atual.nome }, atendentes: [], titulares: [], limite: 5, ativos: 0, podeMudarLimite: true });
        }
        if (u.includes('/atendimento')) return resp({ liberado: false, iniciado: false, access: null, planos: [] });
        if (u === '/api/concessionarias' && method === 'GET') return resp([atual, { ...LOJA, id: 'l2', nome: 'Beta Motors', marcaIds: ['m1'], marcas: ['Fiat'], temLogin: true }]);
        if (u === '/api/concessionarias' && method === 'POST') return resp({ ...atual, id: 'nova' });
        return resp({});
    }));
    return chamadas;
}

vi.mock('next-auth/react', () => ({ getSession: async () => ({ user: { profile: 'administrador' } }) }));

describe('ficha da concessionária', () => {
    it('mostra nome, CNPJ, cidade, situação e as pendências; as outras abas só carregam ao abrir', async () => {
        const chamadas = mockFetch('administrador');
        const onMudou = vi.fn();
        render(<FichaConcessionariaModal concessionariaId="l1" onClose={() => { }} onMudou={onMudou} />);

        const dialog = await screen.findByRole('dialog', { name: /Alfa Veículos/ });
        expect(within(dialog).getByText('CNPJ 12.345.678/0001-99 · Belo Horizonte/MG')).toBeInTheDocument();
        expect(within(dialog).getByRole('heading', { name: 'Alfa Veículos' }).parentElement).toHaveTextContent('Ativa');
        expect(within(dialog).getByRole('button', { name: 'Sem marca' })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Sem login' })).toBeInTheDocument();

        const abas = within(dialog).getAllByRole('tab').map(t => t.textContent);
        expect(abas).toEqual(['Dados', 'Marcas', 'Acessos', 'Planos e assinaturas', 'Funcionalidades', 'Cobranças', 'Estoque']);
        expect(within(dialog).getByRole('tab', { name: 'Dados' })).toHaveAttribute('aria-selected', 'true');
        expect(within(dialog).getByLabelText('Nome Fantasia')).toHaveValue('Alfa Veículos');

        // Nada das outras abas foi pedido ainda.
        expect(chamadas.some(c => c.url.includes('/api/tables/marcas'))).toBe(false);
        expect(chamadas.some(c => c.url.includes('plano-repasse'))).toBe(false);
        expect(chamadas.some(c => c.url.includes('/api/admin/cobrancas'))).toBe(false);

        // O selo de pendência leva para a aba que resolve.
        fireEvent.click(within(dialog).getByRole('button', { name: 'Sem marca' }));
        expect(within(dialog).getByRole('tab', { name: /Marcas/ })).toHaveAttribute('aria-selected', 'true');
        expect(await within(dialog).findByText(/Sem marca a loja não vê nada no painel dela/)).toBeInTheDocument();

        fireEvent.click(await within(dialog).findByLabelText('Fiat'));
        await waitFor(() => expect(chamadas.find(c => c.url.includes('/catalog-brand'))?.body).toEqual({ marcaIds: ['m1'] }));
        // A marca entrou: a pendência some do cabeçalho e a lista é avisada.
        await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Sem marca' })).not.toBeInTheDocument());
        expect(onMudou).toHaveBeenCalled();
        expect(within(dialog).getByText('1 marca vinculada')).toBeInTheDocument();
    });

    it('abre direto na aba pedida', async () => {
        const chamadas = mockFetch('administrador');
        render(<FichaConcessionariaModal concessionariaId="l1" abaInicial="planos" onClose={() => { }} />);
        const dialog = await screen.findByRole('dialog', { name: /Alfa Veículos/ });
        expect(within(dialog).getByRole('tab', { name: 'Planos e assinaturas' })).toHaveAttribute('aria-selected', 'true');
        expect(await within(dialog).findByText('Sem plano de repasse')).toBeInTheDocument();
        expect(await within(dialog).findByText('Atendimento não liberado para esta loja')).toBeInTheDocument();
        expect(chamadas.some(c => c.url.includes('/api/dealership/plano-repasse?concessionariaId=l1'))).toBe(true);
        expect(within(dialog).getByRole('button', { name: 'Emitir boleto para esta loja' })).toBeInTheDocument();
    });

    it('vendedor só consulta: sem Funcionalidades, Cobranças e Estoque, e os planos sem botão de ativar', async () => {
        const chamadas = mockFetch('vendedor');
        render(<FichaConcessionariaModal concessionariaId="l1" abaInicial="estoque" onClose={() => { }} />);
        const dialog = await screen.findByRole('dialog', { name: /Alfa Veículos/ });
        expect(within(dialog).getAllByRole('tab').map(t => t.textContent)).toEqual(['Dados', 'Marcas', 'Acessos', 'Planos e assinaturas']);
        // A aba pedida não é do perfil: cai nos dados.
        expect(within(dialog).getByRole('tab', { name: 'Dados' })).toHaveAttribute('aria-selected', 'true');

        fireEvent.click(within(dialog).getByRole('tab', { name: 'Planos e assinaturas' }));
        expect(within(dialog).getByText('Sem plano de repasse')).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /Ativar plano/ })).not.toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /Emitir boleto/ })).not.toBeInTheDocument();
        // As rotas que recusariam o vendedor nem são chamadas.
        expect(chamadas.some(c => c.url.includes('plano-repasse') || c.url.includes('/atendimento'))).toBe(false);

        fireEvent.click(within(dialog).getByRole('tab', { name: /Acessos/ }));
        expect(within(dialog).getByText(/é com o administrador ou o administrativo/)).toBeInTheDocument();
    });

    it('erro do servidor aparece no lugar da ficha', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => resp({ error: 'Concessionária não encontrada' }, false)));
        render(<FichaConcessionariaModal concessionariaId="l9" onClose={() => { }} />);
        expect(await screen.findByText('Concessionária não encontrada')).toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });
});

describe('lista de concessionárias', () => {
    it('mostra os selos de pendência, filtra "Com pendência" e abre a ficha pelo nome', async () => {
        mockFetch('administrador');
        render(<ConcessionariasManagement />);

        const linhaAlfa = (await screen.findByRole('button', { name: 'Alfa Veículos' })).closest('tr')!;
        expect(within(linhaAlfa).getByRole('button', { name: 'Sem marca' })).toBeInTheDocument();
        expect(within(linhaAlfa).getByRole('button', { name: 'Sem login' })).toBeInTheDocument();
        const linhaBeta = screen.getByRole('button', { name: 'Beta Motors' }).closest('tr')!;
        expect(within(linhaBeta).queryByRole('button', { name: /^Sem (marca|login)$/ })).not.toBeInTheDocument();
        // As ações que foram para a ficha saíram da linha; as secundárias ficaram.
        expect(within(linhaAlfa).queryByRole('button', { name: /Editar concessionária|Usuários da loja|Atendentes da loja/ })).not.toBeInTheDocument();
        expect(within(linhaAlfa).getByRole('button', { name: 'Associar veículos' })).toBeInTheDocument();
        expect(within(linhaAlfa).getByRole('button', { name: 'Excluir concessionária' })).toBeInTheDocument();

        const filtro = screen.getByRole('tab', { name: /Com pendência/ });
        expect(filtro).toHaveTextContent('1');
        fireEvent.click(filtro);
        expect(screen.queryByRole('button', { name: 'Beta Motors' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Alfa Veículos' })).toBeInTheDocument();

        fireEvent.click(within(linhaAlfa).getByRole('button', { name: 'Sem login' }));
        const dialog = await screen.findByRole('dialog', { name: /Alfa Veículos/ });
        await waitFor(() => expect(within(dialog).getByRole('tab', { name: /Acessos/ })).toHaveAttribute('aria-selected', 'true'));
        // Na aba Acessos ficam o login do titular e os atendentes, juntos.
        expect(await within(dialog).findByText('Login do titular')).toBeInTheDocument();
        expect(await within(dialog).findByText('Nenhum atendente ainda')).toBeInTheDocument();
    });

    it('"Novo cadastro" na tela de concessionárias já abre o cadastro guiado da loja', async () => {
        mockFetch('administrador');
        render(<ConcessionariasManagement />);
        await screen.findByRole('button', { name: 'Alfa Veículos' });
        fireEvent.click(screen.getAllByRole('button', { name: 'Novo cadastro' })[0]);
        const dialog = await screen.findByRole('dialog', { name: 'Nova concessionária' });
        expect(within(dialog).getByRole('button', { name: 'Cadastrar e avançar' })).toBeInTheDocument();
    });
});

describe('cadastro guiado de concessionária', () => {
    it('exige o nome, cria a loja ao avançar e segue pelos passos até o resumo com as pendências', async () => {
        const chamadas = mockFetch('administrador');
        const onCriada = vi.fn();
        render(<NovaConcessionariaGuiada onClose={() => { }} onCriada={onCriada} />);
        const dialog = screen.getByRole('dialog', { name: 'Nova concessionária' });

        fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar e avançar' }));
        expect(within(dialog).getByText('Informe o nome fantasia da concessionária.')).toBeInTheDocument();
        expect(chamadas.some(c => c.method === 'POST')).toBe(false);

        fireEvent.change(within(dialog).getByLabelText('Nome Fantasia'), { target: { value: 'Alfa Veículos' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar e avançar' }));

        // Passo 2: a loja já existe; marcas podem ser puladas.
        const pular = await within(dialog).findByRole('button', { name: 'Pular por enquanto' });
        expect(chamadas.find(c => c.method === 'POST')).toMatchObject({ url: '/api/concessionarias', body: { nome: 'Alfa Veículos', ativo: true } });
        expect(onCriada).toHaveBeenCalledWith({ id: 'nova', nome: 'Alfa Veículos' });
        fireEvent.click(pular);

        // Passo 3 (login) e passo 4 (plano), pulados.
        expect(await within(dialog).findByText('Novo usuário')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Pular por enquanto' }));
        fireEvent.click(await within(dialog).findByRole('button', { name: 'Pular e concluir' }));

        expect(await within(dialog).findByText('Ficou pendente')).toBeInTheDocument();
        expect(within(dialog).getByText('Sem marca.')).toBeInTheDocument();
        expect(within(dialog).getByText('Sem login.')).toBeInTheDocument();
        // Só um POST: voltar e avançar não cria a loja de novo.
        expect(chamadas.filter(c => c.method === 'POST')).toHaveLength(1);

        fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir ficha' }));
        expect(await screen.findByRole('dialog', { name: /Alfa Veículos/ })).toBeInTheDocument();
        expect(screen.queryByRole('dialog', { name: 'Nova concessionária' })).not.toBeInTheDocument();
    });
});
