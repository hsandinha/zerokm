// @vitest-environment node
// Atribuição de resposta a campanha (wa/lib/campaign-reply.ts). O defeito
// antigo: o worker grava o campaignId na conversa ao disparar, e o inbound só
// atribuía quando a conversa NÃO tinha campaignId, então o "respondeu" nunca
// contava. Coleções falsas em memória.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
vi.mock('@wa/models/wa', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.recipients = new FakeModel();
    fakes.campaigns = new FakeModel();
    fakes.conversations = new FakeModel();
    return {
        WaCampaignRecipient: fakes.recipients,
        WaCampaign: fakes.campaigns,
        WaConversation: fakes.conversations,
    };
});

import { MSG_JA_RESPONDEU, atribuirRespostaDeCampanha } from '@wa/lib/campaign-reply';

const oid = () => new mongoose.Types.ObjectId();
const LOJA = 'loja-1';
const FONE = '+5531988887777';
const horas = (h: number) => new Date(Date.now() - h * 3600_000);

let antiga: any;
let recente: any;
let conversa: any;

beforeEach(() => {
    [antiga, recente] = fakes.campaigns.reset([
        { tenantId: LOJA, name: 'antiga', replied: 0, skipped: 0 },
        { tenantId: LOJA, name: 'recente', replied: 0, skipped: 0 },
    ]);
    // A conversa já nasce com o campaignId do disparo: é o caso que quebrava.
    [conversa] = fakes.conversations.reset([{ tenantId: LOJA, campaignId: recente._id }]);
    fakes.recipients.reset([]);
});

function destinatario(extra: Record<string, unknown>) {
    const d = { _id: oid(), campaignId: recente._id, tenantId: LOJA, phone: FONE, status: 'sent', sentAt: horas(2), ...extra };
    fakes.recipients.docs.push(d);
    return d;
}

const responder = () => atribuirRespostaDeCampanha({ tenantId: LOJA, phone: FONE, conversationId: conversa._id });

describe('resposta de campanha', () => {
    it('marca o disparo mais recente como respondido e conta uma vez, mesmo com campaignId na conversa', async () => {
        destinatario({ campaignId: antiga._id, sentAt: horas(72) });
        const r = destinatario({ status: 'delivered' });

        const res = await responder();
        expect(res).toEqual({ campaignId: String(recente._id), recipientId: String(r._id) });
        expect(fakes.recipients.byId(r._id)).toMatchObject({ status: 'replied', conversationId: conversa._id });
        expect(fakes.recipients.byId(r._id).repliedAt).toBeInstanceOf(Date);
        expect(fakes.campaigns.byId(recente._id).replied).toBe(1);
        expect(fakes.campaigns.byId(antiga._id).replied).toBe(0);
        expect(String(fakes.conversations.byId(conversa._id).campaignId)).toBe(String(recente._id));
    });

    it('a segunda mensagem da conversa não conta de novo nem "sobe" para um disparo mais antigo', async () => {
        const velho = destinatario({ campaignId: antiga._id, sentAt: horas(72), status: 'read' });
        destinatario({});
        await responder();
        expect(await responder()).toBeNull();
        expect(await responder()).toBeNull();
        expect(fakes.campaigns.byId(recente._id).replied).toBe(1);
        expect(fakes.recipients.byId(velho._id).status).toBe('read');
        expect(fakes.campaigns.byId(antiga._id).replied).toBe(0);
    });

    it('mensagens picadas chegando juntas contam uma vez', async () => {
        destinatario({});
        const resultados = await Promise.all([responder(), responder(), responder()]);
        expect(resultados.filter(Boolean)).toHaveLength(1);
        expect(fakes.campaigns.byId(recente._id).replied).toBe(1);
    });

    it('fora dos 7 dias, de outra loja ou que não saiu: não atribui', async () => {
        destinatario({ sentAt: horas(8 * 24) });
        destinatario({ tenantId: 'outra-loja' });
        destinatario({ status: 'failed' });
        destinatario({ status: 'pending', sentAt: undefined });
        destinatario({ status: 'sending', sentAt: undefined });
        expect(await responder()).toBeNull();
        expect(fakes.campaigns.byId(recente._id).replied).toBe(0);
    });

    it('CNV (tenantId null) casa com destinatário antigo sem o campo', async () => {
        const semCampo = { _id: oid(), campaignId: recente._id, phone: FONE, status: 'sent', sentAt: horas(1) };
        fakes.recipients.docs.push(semCampo);
        const res = await atribuirRespostaDeCampanha({ tenantId: null, phone: FONE, conversationId: conversa._id });
        expect(res?.recipientId).toBe(String(semCampo._id));
    });

    it('por pessoa: respondeu em um número, os outros pendentes da mesma pessoa são cancelados', async () => {
        const socio = oid();
        destinatario({ partnerId: socio });
        const outroNumero = destinatario({ partnerId: socio, phone: '+5531977776666', status: 'pending', sentAt: undefined });
        const outraCampanha = destinatario({ partnerId: socio, phone: '+5531966665555', status: 'pending', sentAt: undefined, campaignId: antiga._id });
        const jaSaiu = destinatario({ partnerId: socio, phone: '+5531955554444', status: 'sent', sentAt: horas(5) });
        const outraPessoa = destinatario({ partnerId: oid(), phone: '+5531944443333', status: 'pending', sentAt: undefined });

        await responder();
        expect(fakes.recipients.byId(outroNumero._id)).toMatchObject({ status: 'skipped', error: MSG_JA_RESPONDEU });
        expect(fakes.recipients.byId(outraCampanha._id).status).toBe('skipped');
        expect(fakes.recipients.byId(jaSaiu._id).status).toBe('sent');
        expect(fakes.recipients.byId(outraPessoa._id).status).toBe('pending');
        // Cada campanha conta os seus pulados.
        expect(fakes.campaigns.byId(recente._id).skipped).toBe(1);
        expect(fakes.campaigns.byId(antiga._id).skipped).toBe(1);
    });
});
