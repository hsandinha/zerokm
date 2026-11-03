// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    channelLabelOf,
    contactKeyFor,
    fbRecipientOf,
    isInstagramPhone,
    isMessengerPhone,
    isProfilePhone,
} from '@wa/lib/channels';
import { formatPhoneBr } from '@wa/lib/phone';
import { acceptedFieldsFromError, messagingTypeOf, pageFromGraph } from '@wa/lib/messenger';
import { smsDigits, smsStatusOf, validateSmsAccount } from '@wa/lib/sms-types';
import { parseZenviaEvent } from '@wa/lib/zenvia';
import { comtelePhone, parseComteleEvent } from '@wa/lib/comtele';
import { smsRouteOf, smsSecretMatches, smsWebhookPath } from '@wa/lib/sms';
import { encrypt } from '@wa/lib/crypto';
import { channelBlock } from '@wa/lib/ai';

process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);

describe('chave do contato por canal', () => {
    it('Messenger vira "fb:<PSID>", Instagram "ig:<id>"', () => {
        expect(contactKeyFor('messenger', '2468')).toBe('fb:2468');
        expect(contactKeyFor('instagram', '1357')).toBe('ig:1357');
    });

    it('SMS usa o telefone canônico — o mesmo contato do WhatsApp', () => {
        expect(contactKeyFor('sms', '5531975635430')).toBe('+5531975635430');
        expect(contactKeyFor('sms', '553184005308')).toBe(contactKeyFor('whatsapp', '553184005308'));
    });

    it('contato de perfil não é telefone', () => {
        expect(isMessengerPhone('fb:2468')).toBe(true);
        expect(isInstagramPhone('fb:2468')).toBe(false);
        expect(isProfilePhone('fb:2468')).toBe(true);
        expect(isProfilePhone('ig:1357')).toBe(true);
        expect(isProfilePhone('+5531999999999')).toBe(false);
        expect(fbRecipientOf('fb:2468')).toBe('2468');
        expect(formatPhoneBr('fb:2468')).toBe('Messenger');
    });
});

describe('nome do canal', () => {
    it('Messenger mostra a Página; SMS mostra o provedor e o RCS', () => {
        expect(channelLabelOf({ kind: 'messenger', fbPageName: 'Loja X' })).toBe('Loja X');
        expect(channelLabelOf({ kind: 'messenger' })).toBe('Messenger');
        expect(channelLabelOf({ kind: 'sms', smsProvider: 'comtele' })).toBe('SMS (Comtele)');
        expect(channelLabelOf({ kind: 'sms', smsProvider: 'zenvia', rcsAgentId: 'ag1' })).toBe('SMS/RCS (Zenvia)');
        // Agente RCS só vale na Zenvia.
        expect(channelLabelOf({ kind: 'sms', smsProvider: 'comtele', rcsAgentId: 'ag1' })).toBe('SMS (Comtele)');
    });

    it('WhatsApp e Instagram continuam iguais', () => {
        expect(channelLabelOf({ kind: 'instagram', igUsername: 'cnv0km' })).toBe('@cnv0km');
        expect(channelLabelOf({ kind: 'whatsapp', displayPhone: '+55 31 9999' })).toBe('+55 31 9999');
        expect(channelLabelOf({ kind: 'whatsapp' })).toBe('WhatsApp');
    });
});

describe('Messenger', () => {
    it('fora das 24h só com a tag HUMAN_AGENT', () => {
        expect(messagingTypeOf(false)).toEqual({ messaging_type: 'RESPONSE' });
        expect(messagingTypeOf(true)).toEqual({ messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' });
    });

    it('Página sem tarefa de mensagens não pode atender', () => {
        expect(pageFromGraph({ id: 1, name: 'A', access_token: 't', tasks: ['ANALYZE'] }).canMessage).toBe(false);
        expect(pageFromGraph({ id: 1, name: 'A', access_token: 't', tasks: ['MESSAGING'] }).canMessage).toBe(true);
        // Login de empresa não traz tarefas: quem decide é a configuração.
        expect(pageFromGraph({ id: 1, name: 'A', access_token: 't' }).canMessage).toBe(true);
        expect(pageFromGraph({ id: 9, picture: { data: { url: 'u' } } })).toMatchObject({
            id: '9',
            name: 'Página',
            pictureUrl: 'u',
        });
    });

    it('lê os campos que a Meta aceita no erro do subscribed_apps', () => {
        expect(acceptedFieldsFromError('(#100) subscribed_fields must be one of {messages, message_echoes}'))
            .toEqual(['messages', 'message_echoes']);
        expect(acceptedFieldsFromError('outro erro')).toEqual([]);
    });

    it('a Vera no Messenger pede o celular', () => {
        const bloco = channelBlock({ kind: 'messenger', label: 'CNV 0km' });
        expect(bloco).toContain('Messenger');
        expect(bloco).toContain('CELULAR');
    });
});

describe('formulário da conta de SMS', () => {
    const novo = { hasStoredToken: false, storedProvider: null };

    it('Zenvia pede token e remetente (ou agente RCS)', () => {
        expect(validateSmsAccount({ provider: 'zenvia', sender: 'loja' }, novo)).toMatchObject({ ok: false });
        expect(validateSmsAccount({ provider: 'zenvia', token: 'tok-12345678' }, novo)).toMatchObject({ ok: false });
        expect(validateSmsAccount({ provider: 'zenvia', token: 'tok-12345678', sender: 'loja' }, novo)).toEqual({
            ok: true,
            account: { provider: 'zenvia', token: 'tok-12345678', sender: 'loja', route: null, rcsAgentId: null },
        });
        expect(validateSmsAccount({ provider: 'zenvia', token: 'tok-12345678', rcsAgentId: 'agente-1' }, novo))
            .toMatchObject({ ok: true });
    });

    it('token em branco mantém o guardado só no mesmo provedor', () => {
        const zenvia = { hasStoredToken: true, storedProvider: 'zenvia' as const };
        expect(validateSmsAccount({ provider: 'zenvia', sender: 'loja' }, zenvia)).toMatchObject({
            ok: true,
            account: { token: null },
        });
        expect(validateSmsAccount({ provider: 'comtele' }, zenvia)).toMatchObject({ ok: false });
    });

    it('RCS só pela Zenvia; rota só número', () => {
        expect(validateSmsAccount({ provider: 'comtele', token: 'k-12345678', rcsAgentId: 'ag1' }, novo))
            .toMatchObject({ ok: false });
        expect(validateSmsAccount({ provider: 'comtele', token: 'k-12345678', route: 'abc' }, novo))
            .toMatchObject({ ok: false });
        expect(validateSmsAccount({ provider: 'comtele', token: 'k-12345678', route: '7', sender: 'x' }, novo))
            .toEqual({
                ok: true,
                account: { provider: 'comtele', token: 'k-12345678', sender: null, route: 7, rcsAgentId: null },
            });
    });

    it('recusa provedor desconhecido e token com espaço', () => {
        expect(validateSmsAccount({ provider: 'twilio', token: 'k-12345678' }, novo)).toMatchObject({ ok: false });
        expect(validateSmsAccount({ provider: 'comtele', token: 'abc def ghi' }, novo)).toMatchObject({ ok: false });
    });
});

describe('envio de SMS/RCS', () => {
    it('com agente RCS na Zenvia sai RCS; sem ele, SMS', () => {
        expect(smsRouteOf({ provider: 'zenvia', rcsAgentId: 'ag1' })).toBe('rcs');
        expect(smsRouteOf({ provider: 'zenvia', rcsAgentId: null })).toBe('sms');
        expect(smsRouteOf({ provider: 'comtele', rcsAgentId: 'ag1' })).toBe('sms');
    });

    it('telefone no formato dos provedores', () => {
        expect(smsDigits('+5531975635430')).toBe('5531975635430');
        expect(smsDigits('31975635430')).toBe('5531975635430');
        expect(comtelePhone('+5531975635430')).toBe(5531975635430);
    });
});

describe('webhook de SMS por canal', () => {
    it('o segredo do caminho confere com o guardado cifrado', () => {
        const stored = encrypt('segredo-do-canal');
        expect(smsSecretMatches(stored, 'segredo-do-canal')).toBe(true);
        expect(smsSecretMatches(stored, 'segredo-de-outro')).toBe(false);
        expect(smsSecretMatches(stored, '')).toBe(false);
        expect(smsSecretMatches(undefined, 'segredo-do-canal')).toBe(false);
        expect(smsWebhookPath('abc', 'xyz')).toBe('/api/webhooks/sms/abc/xyz');
    });

    it('Zenvia: resposta do cliente', () => {
        expect(
            parseZenviaEvent({
                type: 'MESSAGE',
                channel: 'sms',
                direction: 'IN',
                message: { id: 'm1', from: '5531975635430', to: 'loja', contents: [{ type: 'text', text: 'Oi' }] },
            }),
        ).toEqual({ type: 'message', channel: 'sms', id: 'm1', from: '5531975635430', to: 'loja', text: 'Oi', refId: null });
        // O que saiu de nós não é resposta.
        expect(parseZenviaEvent({ type: 'MESSAGE', direction: 'OUT', message: { id: 'm', from: '1' } })).toBeNull();
    });

    it('Zenvia: RCS que caiu para SMS é registrado como SMS', () => {
        const e = parseZenviaEvent({
            type: 'MESSAGE_STATUS',
            channel: 'rcs',
            messageId: 'm2',
            messageStatus: { code: 'DELIVERED', channelData: { rcs: { realChannel: 'sms' } } },
        });
        expect(e).toMatchObject({ type: 'status', id: 'm2', code: 'DELIVERED', via: 'sms' });
        expect(smsStatusOf('DELIVERED')).toBe('delivered');
        expect(smsStatusOf('NOT_DELIVERED')).toBe('failed');
        expect(smsStatusOf('QUEUED')).toBeNull();
    });

    it('Comtele: resposta e status chegam no formato da Zenvia', () => {
        const reply = parseComteleEvent({
            webhookType: 'Replies',
            messageId: '77',
            messageCustom: 'cm-abc',
            messageType: 'Sms',
            replySender: '+55 31 97563-5430',
            replyContent: ' Quero ',
            replyTimestamp: '2026-11-02T10:00:00',
        });
        expect(reply.event).toMatchObject({ type: 'message', from: '5531975635430', text: 'Quero', refId: 'cm-abc' });

        const status = parseComteleEvent({
            webhookType: 'Status',
            messageCustom: 'cm-abc',
            messageStatus: 'LowBalance',
            messageType: 'Sms',
        });
        expect(status.lowBalance).toBe(true);
        expect(status.event).toMatchObject({ type: 'status', id: 'cm-abc', code: 'NOT_DELIVERED', via: 'sms' });

        // Sem o nosso id não há o que atualizar.
        expect(parseComteleEvent({ webhookType: 'Status', messageStatus: 'Delivered' }).event).toBeNull();
    });
});
