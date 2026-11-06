// @vitest-environment node
// Opt-out levado ao gateway: só Instagram e Messenger, só as contas do
// próprio dono, e falha do gateway não quebra o opt-out.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
const canais = vi.hoisted(() => ({ filtro: null as any, lista: [] as Array<{ chatrunAccountId?: string | null }> }));
vi.mock('@wa/models/channel', () => ({
    WaChannel: {
        find: (filtro: any) => {
            canais.filtro = filtro;
            return { select: () => ({ lean: async () => canais.lista }) };
        },
    },
}));

import { canalDaChave, sincronizarOptOutNoGateway } from '@wa/lib/chatrun-bloqueio';

process.env.CHATRUN_API_KEY = 'crk_test_123';
process.env.CHATRUN_URL = 'https://gateway.teste';

const chamadas: Array<{ url: string; method: string; body: any }> = [];

beforeEach(() => {
    chamadas.length = 0;
    canais.filtro = null;
    canais.lista = [{ chatrunAccountId: 'acc-1' }, { chatrunAccountId: 'acc-1' }, { chatrunAccountId: null }];
    globalThis.fetch = (async (input: any, init?: any) => {
        chamadas.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
});

describe('opt-out no gateway', () => {
    it('reconhece o canal pela chave do contato', () => {
        expect(canalDaChave('ig:123')).toBe('instagram');
        expect(canalDaChave('fb:456')).toBe('messenger');
        expect(canalDaChave('5531999998888')).toBeNull();
    });

    it('bloqueia o contato do Instagram nas contas do dono, uma vez por conta', async () => {
        await sincronizarOptOutNoGateway({ tenantId: 'loja-1', phone: 'ig:123' }, true, 'palavra-chave');
        expect(canais.filtro).toMatchObject({ tenantId: 'loja-1', kind: 'instagram', provider: 'chatrun' });
        expect(chamadas).toHaveLength(1);
        expect(chamadas[0]).toMatchObject({
            url: 'https://gateway.teste/api/v1/blocked',
            method: 'POST',
            body: { account_id: 'acc-1', phone: 'ig:123', reason: 'no_automation', detail: 'palavra-chave' },
        });
    });

    it('desbloqueia quando a equipe tira o opt-out', async () => {
        await sincronizarOptOutNoGateway({ tenantId: null, phone: 'fb:456' }, false);
        expect(canais.filtro).toMatchObject({ tenantId: null, kind: 'messenger' });
        expect(chamadas[0]).toMatchObject({ method: 'DELETE', body: { account_id: 'acc-1', phone: 'fb:456', reason: 'no_automation' } });
    });

    it('WhatsApp não vai ao gateway', async () => {
        await sincronizarOptOutNoGateway({ tenantId: 'loja-1', phone: '5531999998888' }, true);
        expect(canais.filtro).toBeNull();
        expect(chamadas).toHaveLength(0);
    });

    it('gateway fora do ar não lança erro', async () => {
        globalThis.fetch = (async () => {
            throw new Error('rede');
        }) as typeof fetch;
        await expect(sincronizarOptOutNoGateway({ tenantId: 'loja-1', phone: 'ig:123' }, true)).resolves.toBeUndefined();
    });
});
