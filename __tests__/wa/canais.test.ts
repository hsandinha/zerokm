// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    igRecipientOf,
    isInstagramPhone,
    readConnectState,
    signConnectState,
} from '@wa/lib/channels';
import { plainForInstagram } from '@wa/lib/send';
import { buildSystemPrompt, channelBlock } from '@wa/lib/ai';
import { formatPhoneBr } from '@wa/lib/phone';

process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);

describe('state assinado do login do Instagram', () => {
    it('volta com o mesmo dono do canal', () => {
        const state = signConnectState({ tenantId: null, by: 'admin@cnv.com.br' });
        expect(readConnectState(state)).toEqual({ tenantId: null, by: 'admin@cnv.com.br' });
    });

    it('recusa state adulterado (trocar o dono para outra loja)', () => {
        const state = signConnectState({ tenantId: null, by: 'admin@cnv.com.br' });
        const [body, sig] = state.split('.');
        const outro = Buffer.from(
            JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), tenantId: 'loja-x' }),
        ).toString('base64url');
        expect(readConnectState(`${outro}.${sig}`)).toBeNull();
    });

    it('recusa vazio ou sem assinatura', () => {
        expect(readConnectState(null)).toBeNull();
        expect(readConnectState('abc')).toBeNull();
    });
});

describe('contato do Instagram', () => {
    it('a chave "ig:<id>" não é telefone', () => {
        expect(isInstagramPhone('ig:178414')).toBe(true);
        expect(isInstagramPhone('+5531999999999')).toBe(false);
        expect(igRecipientOf('ig:178414')).toBe('178414');
        expect(formatPhoneBr('ig:178414')).toBe('Instagram');
    });
});

describe('texto no Direct', () => {
    it('tira o *negrito* do WhatsApp, que o Direct mostraria cru', () => {
        expect(plainForInstagram('✅ *Cadastro criado com sucesso!*\nSeu *teste grátis de 24h* já está ativo'))
            .toBe('✅ Cadastro criado com sucesso!\nSeu teste grátis de 24h já está ativo');
    });

    it('não mexe em link nem em palavra com sublinhado', () => {
        const texto = 'Acesse https://www.cnv0km.com.br/login?ref=meu_link_x';
        expect(plainForInstagram(texto)).toBe(texto);
    });
});

describe('prompt da Vera por canal', () => {
    const settings = {
        assistantName: 'Vera',
        systemPrompt: '',
        knowledgeBase: '',
        greeting: '',
        extraInstructions: '',
    };

    it('no Direct pede o celular para o cadastro', () => {
        const bloco = channelBlock({ kind: 'instagram', label: '@cnv0km' });
        expect(bloco).toContain('Direct do Instagram');
        expect(bloco).toContain('CELULAR');
    });

    it('no WhatsApp não pergunta o celular', () => {
        expect(channelBlock({ kind: 'whatsapp', label: 'WhatsApp' })).toContain('não precisa perguntar');
    });

    it('prompt personalizado sem {{canal}} ainda recebe o bloco do canal', () => {
        const prompt = buildSystemPrompt({
            settings: { ...settings, systemPrompt: 'Você é {{assistente}}.' },
            plans: [],
            funnelStatus: '-',
            channel: { kind: 'instagram', label: '@cnv0km' },
        });
        expect(prompt).toContain('Você é Vera.');
        expect(prompt).toContain('Direct do Instagram');
    });

    it('prompt de fábrica não fala mais "é WhatsApp" fixo', () => {
        const prompt = buildSystemPrompt({ settings, plans: [], funnelStatus: '-' });
        expect(prompt).not.toContain('é WhatsApp');
        expect(prompt).toContain('Canal desta conversa: WhatsApp');
    });
});
