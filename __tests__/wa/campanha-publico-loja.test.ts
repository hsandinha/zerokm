// @vitest-environment node
// Criação de campanha pela LOJA (POST /api/wa/campaigns): só as fontes dela,
// nunca a base de empresas do CNV; contatos resolvidos no servidor pelo
// tenantId; quem fica de fora volta contado na revisão (dryRun) e entra na
// campanha como "pulado" com o motivo. Coleções falsas em memória.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
const LOJA = 'loja-1';

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('@wa/lib/scope', () => ({
    requireScopeAdmin: async () => ({
        tenantId: LOJA,
        email: 'gestor@loja.com',
        name: 'Gestor',
        role: 'admin',
        store: { id: LOJA, name: 'Loja', kind: 'lojista', access: {}, recursos: { funil: true, campanhas: true } },
    }),
    requireScope: async () => ({ tenantId: LOJA, role: 'admin', store: {} }),
    podeUsar: () => true,
}));
vi.mock('@wa/lib/channels', () => ({ wabaCredentialsOf: async () => ({ token: '', phoneNumberId: '1', chatrunConnectionId: 'conn-1' }) }));
vi.mock('@wa/models/wa', async (original) => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.campaigns = new FakeModel();
    fakes.recipients = new FakeModel();
    fakes.contacts = new FakeModel();
    fakes.conversations = new FakeModel();
    return {
        ...(await original<Record<string, unknown>>()),
        WaCampaign: fakes.campaigns,
        WaCampaignRecipient: fakes.recipients,
        WaContact: fakes.contacts,
        WaConversation: fakes.conversations,
    };
});
vi.mock('@wa/models/base', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.targets = new FakeModel();
    fakes.partners = new FakeModel();
    return { WaTarget: fakes.targets, WaPartner: fakes.partners };
});
vi.mock('@wa/lib/meta', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    listTemplates: async () => [
        {
            id: 't1', name: 'oferta', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Oi {{1}}, novidade na {{2}}.' }],
        },
    ],
}));

import { POST } from '@/app/api/wa/campaigns/route';

function pedir(body: Record<string, unknown>) {
    return POST(
        new NextRequest('http://teste/api/wa/campaigns', {
            method: 'POST',
            body: JSON.stringify({ name: 'Teste', templateName: 'oferta', paramsMap: [{ type: 'first_name' }, { type: 'company' }], ...body }),
        }),
    );
}

beforeEach(() => {
    fakes.campaigns.reset([]);
    fakes.recipients.reset([]);
    fakes.conversations.reset([]);
    fakes.targets.reset([{ status: 'ready', phone: '+5531900000000', legalName: 'Empresa do CNV' }]);
    fakes.contacts.reset([
        { tenantId: LOJA, phone: '+5531988887777', name: 'Ana', company: 'Auto Ana', optOut: false },
        { tenantId: LOJA, phone: '+5531977776666', name: 'Bruno', company: null, optOut: false },
        { tenantId: LOJA, phone: '+5531966665555', name: 'Carla', company: 'Carla Car', optOut: true },
        { tenantId: LOJA, phone: 'ig:123456', name: 'Perfil do Instagram', optOut: false },
        { tenantId: 'outra-loja', phone: '+5531955554444', name: 'De outra loja', company: 'X', optOut: false },
        { tenantId: null, phone: '+5531944443333', name: 'Do CNV', company: 'Y', optOut: false },
    ]);
});

describe('loja não alcança a base do CNV', () => {
    it.each([
        ['source "targets"', { source: 'targets' }],
        ['sem público nenhum', {}],
        ['targetIds', { targetIds: ['abc'] }],
        ['sócios da Procob', { partners: [{ partnerId: 'p', phones: ['31988887777'] }] }],
        ['CNPJá', { source: 'cnpja', recipients: [{ phone: '31988887777' }] }],
        // Lista de contatos montada na tela não vale como "contatos da loja".
        ['lista da tela fingindo ser contatos', { source: 'contatos', recipients: [{ phone: '31955554444' }] }],
    ])('%s: recusa sem tocar em WaTarget', async (_nome, body) => {
        const espiao = vi.spyOn(fakes.targets, 'find');
        const res = await pedir(body);
        expect(res.status).toBe(400);
        expect(espiao).not.toHaveBeenCalled();
        expect(fakes.campaigns.docs).toHaveLength(0);
        espiao.mockRestore();
    });
});

describe('contatos da loja resolvidos no servidor', () => {
    it('revisão: só os contatos desta loja, sem opt-out nem perfil sem telefone, e empresa vazia fica de fora', async () => {
        const res = await pedir({ dryRun: true, publico: { contatos: {} } });
        const body = await res.json();
        expect(res.status).toBe(200);
        // Ana recebe; Bruno não tem empresa (a loja não usa o "sua loja" do CNV).
        expect(body).toMatchObject({ dryRun: true, recipients: 1, skippedEmptyParam: 1, skippedOptOut: 0 });
        expect(body.skippedSample).toEqual([{ phone: '+5531977776666', name: 'Bruno', motivo: 'variável vazia: {{2}}' }]);
        expect(fakes.campaigns.docs).toHaveLength(0);
    });

    it('criação: pulados entram com o motivo e contam no total', async () => {
        const res = await pedir({ publico: { contatos: {}, colados: [{ phone: '(31) 93333-2222', name: 'Dani' }], excluir: [] }, paramsMap: [{ type: 'first_name' }, { type: 'fixed', value: 'loja' }] });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.recipients).toBe(3); // Ana, Bruno e Dani (empresa agora é texto fixo)
        const [camp] = fakes.campaigns.docs;
        expect(camp).toMatchObject({ tenantId: LOJA, source: 'misto', total: 3, skipped: 0 });
        expect(fakes.recipients.docs.map((r: any) => r.phone).sort()).toEqual(['+5531933332222', '+5531977776666', '+5531988887777']);
        expect(fakes.recipients.docs.every((r: any) => r.tenantId === LOJA)).toBe(true);
    });

    it('opt-out de quem veio por lista colada também fica de fora, com o motivo', async () => {
        const res = await pedir({ publico: { colados: [{ phone: '31966665555', name: 'Carla' }, { phone: '31988887777' }] }, paramsMap: [{ type: 'first_name' }, { type: 'fixed', value: 'loja' }] });
        expect(res.status).toBe(200);
        const [camp] = fakes.campaigns.docs;
        expect(camp).toMatchObject({ total: 2, skipped: 1, source: 'colar' });
        const carla = fakes.recipients.docs.find((r: any) => r.phone === '+5531966665555');
        expect(carla).toMatchObject({ status: 'skipped', error: 'opt-out: pediu para não receber' });
    });

    it('desmarcado na tela não entra', async () => {
        const res = await pedir({ dryRun: true, publico: { contatos: {}, excluir: ['+5531988887777'] }, paramsMap: [{ type: 'first_name' }, { type: 'fixed', value: 'x' }] });
        const body = await res.json();
        expect(body).toMatchObject({ recipients: 1, excluded: 1 });
    });
});
