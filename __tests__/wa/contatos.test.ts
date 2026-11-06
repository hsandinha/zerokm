// @vitest-environment node
// Contatos da loja: a conferência da ficha, a importação por CSV (mapeamento
// das colunas, deduplicação por telefone, só completar o que falta), o
// filtro da lista e a exportação. E apagar: o contato leva junto a conversa e
// tudo dela, sem deixar órfão e sem alcançar contato de outra loja.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { parseCsv } from '@wa/lib/audience/csv';
import {
    camposQueFaltam,
    celulaSegura,
    consultaDeContatos,
    dataDeAniversario,
    detectarColunas,
    juntarPorTelefone,
    linhaDoCsv,
    linhasDoCsv,
    normalizarFicha,
    telefoneParaCsv,
} from '@wa/lib/contatos';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
vi.mock('@/lib/mongodb', () => ({ default: async () => null }));
vi.mock('@wa/models/wa', async () => {
    const { FakeModel, casa } = await import('./helpers/fake-model');
    // O fake não tem deleteOne; o contato sai por ele.
    class ComDeleteOne extends FakeModel {
        async deleteOne(filtro: Record<string, unknown>) {
            const antes = this.docs.length;
            const i = this.docs.findIndex((d) => casa(d, filtro));
            if (i >= 0) this.docs.splice(i, 1);
            return { deletedCount: antes - this.docs.length };
        }
    }
    for (const k of ['contacts', 'conversations', 'messages', 'aijobs', 'followups', 'recipients']) {
        fakes[k] = new ComDeleteOne();
    }
    return {
        WaContact: fakes.contacts,
        WaConversation: fakes.conversations,
        WaMessage: fakes.messages,
        WaAiJob: fakes.aijobs,
        WaFollowup: fakes.followups,
        WaCampaignRecipient: fakes.recipients,
    };
});
vi.mock('@wa/models/atendimento', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.notes = new FakeModel();
    return { WaNote: fakes.notes };
});
vi.mock('@wa/models/automacao', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.envios = new FakeModel();
    return { WaAutomacaoEnvio: fakes.envios };
});
vi.mock('@wa/models/agenda', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.agendamentos = new FakeModel();
    return { WaAgendamento: fakes.agendamentos };
});
vi.mock('@wa/models/tarefa', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.tarefas = new FakeModel();
    return { WaTarefa: fakes.tarefas };
});

import { apagarContato } from '@wa/lib/contatos-servidor';

const CPF_VALIDO = '52998224725';

describe('ficha do contato', () => {
    it('aniversário em formato brasileiro, ISO ou com ano curto', () => {
        const hoje = new Date('2026-11-06T12:00:00Z');
        expect(dataDeAniversario('12/03/1990', hoje)).toBe('1990-03-12');
        expect(dataDeAniversario('1990-3-5', hoje)).toBe('1990-03-05');
        expect(dataDeAniversario('12/03/90', hoje)).toBe('1990-03-12');
        expect(dataDeAniversario('12/03/05', hoje)).toBe('2005-03-12');
        expect(dataDeAniversario('31/02/1990', hoje)).toBeNull();
        expect(dataDeAniversario('12/03/2030', hoje)).toBeNull();
        expect(dataDeAniversario('março', hoje)).toBeNull();
    });

    it('confere e normaliza os campos; vazio apaga', () => {
        const r = normalizarFicha({
            name: '  Ana   Souza ',
            email: 'ANA@Exemplo.com',
            document: '529.982.247-25',
            state: 'mg',
            tipo: 'Fornecedores',
            birthDate: '12/03/1990',
            address: { zip: '30140-071', street: 'Rua A' },
            notes: '',
        });
        expect(r.erro).toBeNull();
        expect(r.set).toMatchObject({
            name: 'Ana Souza',
            email: 'ana@exemplo.com',
            document: CPF_VALIDO,
            state: 'MG',
            tipo: 'fornecedor',
            birthDate: '1990-03-12',
            birthMonth: 3,
            birthDay: 12,
            'address.zip': '30140071',
            'address.street': 'Rua A',
        });
        expect(r.unset).toContain('notes');
        expect(normalizarFicha({ birthDate: '' }).unset).toEqual(['birthDate', 'birthMonth', 'birthDay']);
    });

    it('CPF inválido para o cadastro; na planilha, só o campo sai', () => {
        expect(normalizarFicha({ document: '111.111.111-11' }).erro).toMatch(/CPF/);
        const t = normalizarFicha({ document: '111.111.111-11', name: 'Ana' }, { tolerante: true });
        expect(t.erro).toBeNull();
        expect(t.set).toEqual({ name: 'Ana' });
        expect(normalizarFicha({ state: 'Minas Gerais' }).erro).toMatch(/UF/);
    });
});

describe('importação por CSV', () => {
    const csv = [
        'Nome;Celular;E-mail;Data de nascimento;CPF;Bairro;Obs',
        'Ana Souza;(31) 99999-8888;ana@x.com;12/03/1990;529.982.247-25;Centro;cliente antiga',
        'Ana;5531999998888;;;;Savassi;',
        'Sem telefone;;;;;;',
        'Bruno;31 98888-7777;;;;;',
    ].join('\n');

    it('adivinha as colunas pelo mapeamento da importação de público e pelos campos da ficha', () => {
        const { headers } = parseCsv(csv);
        expect(detectarColunas(headers)).toMatchObject({
            name: 'Nome',
            phone: 'Celular',
            email: 'E-mail',
            birthDate: 'Data de nascimento',
            document: 'CPF',
            district: 'Bairro',
            notes: 'Obs',
        });
    });

    it('junta o mesmo telefone em um contato e ignora a linha sem telefone', () => {
        const { headers, raw } = parseCsv(csv);
        const linhas = linhasDoCsv(raw, detectarColunas(headers));
        const { porTelefone, ignoradas, repetidas } = juntarPorTelefone(linhas);
        expect(porTelefone.size).toBe(2);
        expect(ignoradas).toBe(1);
        expect(repetidas).toBe(1);
        // A segunda linha completa a primeira (bairro) sem apagar o que ela tinha.
        expect(porTelefone.get('+5531999998888')).toMatchObject({
            name: 'Ana',
            email: 'ana@x.com',
            birthDate: '1990-03-12',
            'address.district': 'Savassi',
        });
    });

    it('quem já é contato só tem os buracos preenchidos', () => {
        const atual = { name: 'Maria', email: null, address: { district: 'Centro' } };
        const novo = {
            name: 'MARIA S.',
            email: 'maria@x.com',
            'address.district': 'Savassi',
            'address.street': 'Rua B',
            birthDate: '1990-01-02',
            birthMonth: 1,
            birthDay: 2,
        };
        expect(camposQueFaltam(atual, novo)).toEqual({
            email: 'maria@x.com',
            'address.street': 'Rua B',
            birthDate: '1990-01-02',
            birthMonth: 1,
            birthDay: 2,
        });
        // Aniversário que já existe: mês e dia não mudam sozinhos.
        expect(camposQueFaltam({ birthDate: '1980-05-05' }, { birthDate: '1990-01-02', birthMonth: 1, birthDay: 2 })).toEqual({});
    });
});

describe('lista e exportação', () => {
    it('cliente inclui quem não tem tipo gravado; aniversariantes pelo mês', () => {
        expect(consultaDeContatos('loja', { tipo: 'cliente' })).toEqual({
            tenantId: 'loja',
            tipo: { $in: ['cliente', null] },
        });
        expect(consultaDeContatos('loja', { filtro: 'aniversariantes', mes: 11, tipo: 'parceiro' })).toEqual({
            tenantId: 'loja',
            birthMonth: 11,
            tipo: 'parceiro',
        });
        const q = consultaDeContatos(null, { q: 'ana', tipo: 'cliente' });
        expect(q.tenantId).toBeNull();
        expect(q.$and).toHaveLength(2);
    });

    it('a planilha exportada não vira fórmula no Excel e o telefone volta na importação', () => {
        expect(celulaSegura('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
        expect(celulaSegura('Ana')).toBe('Ana');
        expect(telefoneParaCsv('+5531999998888')).toBe('(31) 99999-8888');
        expect(telefoneParaCsv('ig:123')).toBe('Instagram');
        const linha = linhaDoCsv({ phone: '+5531999998888', name: '-Ana', birthDate: '1990-03-12', optOut: true });
        expect(linha[0]).toBe("'-Ana");
        expect(linha[5]).toBe('Cliente');
        expect(linha[6]).toBe('12/03/1990');
    });
});

describe('apagar contato', () => {
    const LOJA = 'loja-1';
    let contato: any;
    let conversa: any;

    beforeEach(() => {
        [contato] = fakes.contacts.reset([
            { tenantId: LOJA, phone: '+5531999998888', name: 'Ana' },
            { tenantId: 'outra', phone: '+5531999998888', name: 'Ana da outra loja' },
        ]);
        [conversa] = fakes.conversations.reset([{ tenantId: LOJA, contactId: contato._id }]);
        const conv = { conversationId: conversa._id };
        fakes.messages.reset([conv, conv, { conversationId: new mongoose.Types.ObjectId() }]);
        fakes.aijobs.reset([conv]);
        fakes.followups.reset([conv]);
        fakes.notes.reset([conv]);
        fakes.recipients.reset([{ ...conv, tenantId: LOJA, phone: contato.phone, status: 'replied' }]);
        fakes.envios.reset([
            { tenantId: LOJA, contactId: contato._id, tipo: 'aniversario', chave: 'x' },
            { tenantId: LOJA, conversationId: conversa._id, tipo: 'funil', chave: 'y' },
        ]);
        const dia = 24 * 3600_000;
        fakes.agendamentos.reset([
            { tenantId: LOJA, ...conv, contactId: contato._id, contatoNome: 'Ana', contatoTelefone: '+5531999998888', observacao: 'quer o Onix', inicio: new Date(Date.now() + dia), status: 'confirmado' },
            { tenantId: LOJA, ...conv, contactId: contato._id, contatoNome: 'Ana', contatoTelefone: '+5531999998888', observacao: 'veio', inicio: new Date(Date.now() - dia), status: 'realizado' },
            // Mesmo id de conversa em outra loja não é tocado.
            { tenantId: 'outra', ...conv, contatoNome: 'Ana da outra loja', inicio: new Date(Date.now() + dia), status: 'confirmado' },
        ]);
        fakes.tarefas.reset([
            { tenantId: LOJA, ...conv, titulo: 'Mandar fotos para Ana', feita: false },
            { tenantId: LOJA, contactId: contato._id, titulo: 'Ligar para Ana', feita: true },
            { tenantId: LOJA, titulo: 'Outra tarefa', feita: false },
        ]);
    });

    it('tira o nome e o telefone da Agenda e das Tarefas', async () => {
        await apagarContato(LOJA, String(contato._id));
        // A visita que ainda vai acontecer sai; a que passou fica, anônima.
        const daLoja = fakes.agendamentos.docs.filter((d: any) => d.tenantId === LOJA);
        expect(daLoja).toHaveLength(1);
        expect(daLoja[0]).toMatchObject({
            status: 'realizado',
            contatoNome: 'Contato apagado',
            contatoTelefone: null,
            observacao: null,
            contactId: null,
            conversationId: null,
        });
        expect(fakes.agendamentos.docs.find((d: any) => d.tenantId === 'outra')?.contatoNome).toBe('Ana da outra loja');
        expect(fakes.tarefas.docs.map((d: any) => d.titulo)).toEqual(['Outra tarefa']);
    });

    it('leva a conversa, as mensagens, a fila, a cadência, as notas e o histórico', async () => {
        await apagarContato(LOJA, String(contato._id));
        expect(fakes.contacts.docs.map((d: any) => d.name)).toEqual(['Ana da outra loja']);
        expect(fakes.conversations.docs).toHaveLength(0);
        expect(fakes.messages.docs).toHaveLength(1); // a de outra conversa fica
        expect(fakes.aijobs.docs).toHaveLength(0);
        expect(fakes.followups.docs).toHaveLength(0);
        expect(fakes.notes.docs).toHaveLength(0);
        expect(fakes.envios.docs).toHaveLength(0);
        // O disparo fica na métrica da campanha, sem o vínculo.
        expect(fakes.recipients.docs).toHaveLength(1);
        expect(fakes.recipients.docs[0].conversationId).toBeUndefined();
    });

    it('contato de outra loja não é achado e nada sai', async () => {
        await expect(apagarContato('outra-loja', String(contato._id))).rejects.toMatchObject({ status: 404 });
        expect(fakes.contacts.docs).toHaveLength(2);
        expect(fakes.messages.docs).toHaveLength(3);
    });
});
