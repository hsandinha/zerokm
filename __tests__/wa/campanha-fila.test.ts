// @vitest-environment node
// Fila do disparo (wa/lib/campaign-queue.ts): reserva atômica antes de ir para
// a Meta, checagem de "já recebeu este modelo" e o encerramento do que ficou
// no meio de uma rodada que caiu. Coleções falsas em memória: o que importa é
// o filtro de cada update.
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

import {
    ENVIO_INTERROMPIDO_MIN,
    MSG_ENVIO_INTERROMPIDO,
    devolverParaFila,
    encerrarEnviosInterrompidos,
    marcarEnviado,
    marcarFalha,
    msgRepetido,
    reservarDestinatario,
} from '@wa/lib/campaign-queue';

const oid = () => new mongoose.Types.ObjectId();
const LOJA = 'loja-1';
const FONE = '+5531988887777';

let campA: any;
let campB: any;

beforeEach(() => {
    [campA, campB] = fakes.campaigns.reset([
        { tenantId: LOJA, templateName: 'oferta', sent: 0, failed: 0, skipped: 0 },
        { tenantId: LOJA, templateName: 'oferta', sent: 0, failed: 0, skipped: 0 },
    ]);
    fakes.recipients.reset([]);
});

function destinatario(extra: Record<string, unknown>) {
    const d = { _id: oid(), campaignId: campA._id, tenantId: LOJA, phone: FONE, status: 'pending', ...extra };
    fakes.recipients.docs.push(d);
    return d;
}

describe('reserva do destinatário', () => {
    it('duas rodadas ao mesmo tempo: só uma reserva', async () => {
        const r = destinatario({});
        const [a, b] = await Promise.all([reservarDestinatario(r._id), reservarDestinatario(r._id)]);
        expect([a.reserva, b.reserva].sort()).toEqual(['ocupado', 'reservado']);
        const doc = fakes.recipients.byId(r._id);
        expect(doc.status).toBe('sending');
        expect(doc.claimedAt).toBeInstanceOf(Date);
    });

    it('quem não está pendente não é reservado', async () => {
        for (const status of ['sending', 'sent', 'failed', 'skipped', 'replied']) {
            const r = destinatario({ status, phone: `+55319888${Math.floor(Math.random() * 1e5)}` });
            expect((await reservarDestinatario(r._id)).reserva).toBe('ocupado');
            expect(fakes.recipients.byId(r._id).status).toBe(status);
        }
    });

    it('o mesmo modelo da mesma loja nas últimas 24h fica "repetido" e conta como pulado', async () => {
        destinatario({ campaignId: campA._id, status: 'delivered', sentAt: new Date(Date.now() - 3 * 3600_000) });
        const novo = destinatario({ campaignId: campB._id });
        const r = await reservarDestinatario(novo._id, [campA._id, campB._id]);
        expect(r.reserva).toBe('repetido');
        expect(fakes.recipients.byId(novo._id)).toMatchObject({ status: 'skipped', error: msgRepetido() });
        expect(fakes.campaigns.byId(campB._id).skipped).toBe(1);
    });

    it('outra loja, outro modelo ou mais de 24h não contam como repetido', async () => {
        destinatario({ campaignId: campA._id, tenantId: 'outra', status: 'sent', sentAt: new Date() });
        destinatario({ campaignId: campA._id, status: 'sent', sentAt: new Date(Date.now() - 30 * 3600_000) });
        const outroModelo = oid();
        destinatario({ campaignId: outroModelo, status: 'sent', sentAt: new Date() });
        const novo = destinatario({ campaignId: campB._id });
        const r = await reservarDestinatario(novo._id, [campA._id, campB._id]);
        expect(r.reserva).toBe('reservado');
    });

    it('duas campanhas reservando o mesmo número: fica quem reservou antes', async () => {
        // A outra campanha reservou um segundo antes e ainda está enviando.
        destinatario({ campaignId: campA._id, status: 'sending', claimedAt: new Date(Date.now() - 1000) });
        const novo = destinatario({ campaignId: campB._id });
        expect((await reservarDestinatario(novo._id, [campA._id, campB._id])).reserva).toBe('repetido');

        // Já se a outra reservou DEPOIS desta, esta segue (a outra é que vai pular).
        fakes.recipients.reset([]);
        destinatario({ campaignId: campA._id, status: 'sending', claimedAt: new Date(Date.now() + 5000) });
        const segundo = destinatario({ campaignId: campB._id });
        expect((await reservarDestinatario(segundo._id, [campA._id, campB._id])).reserva).toBe('reservado');
    });
});

describe('rodada que caiu no meio do envio', () => {
    it(`"sending" há mais de ${ENVIO_INTERROMPIDO_MIN} min vira falha, nunca volta para a fila`, async () => {
        const velho = destinatario({ status: 'sending', claimedAt: new Date(Date.now() - 11 * 60_000) });
        const semHora = destinatario({ status: 'sending', phone: '+5531977776666' });
        const recente = destinatario({ status: 'sending', phone: '+5531966665555', claimedAt: new Date(Date.now() - 60_000) });
        const pendente = destinatario({ phone: '+5531955554444' });

        const n = await encerrarEnviosInterrompidos(campA._id);
        expect(n).toBe(2);
        expect(fakes.recipients.byId(velho._id)).toMatchObject({ status: 'failed', error: MSG_ENVIO_INTERROMPIDO });
        expect(fakes.recipients.byId(semHora._id).status).toBe('failed');
        expect(fakes.recipients.byId(recente._id).status).toBe('sending');
        expect(fakes.recipients.byId(pendente._id).status).toBe('pending');
        expect(fakes.campaigns.byId(campA._id).failed).toBe(2);

        // Rodar de novo não conta de novo.
        expect(await encerrarEnviosInterrompidos(campA._id)).toBe(0);
        expect(fakes.campaigns.byId(campA._id).failed).toBe(2);
    });

    it('não mexe em outra campanha', async () => {
        const deOutra = destinatario({ campaignId: campB._id, status: 'sending', claimedAt: new Date(0) });
        await encerrarEnviosInterrompidos(campA._id);
        expect(fakes.recipients.byId(deOutra._id).status).toBe('sending');
    });
});

describe('desfecho do envio', () => {
    it('enviado: sai de "sending", grava o wamid e conta uma vez', async () => {
        const r = destinatario({ status: 'sending', claimedAt: new Date() });
        const conv = oid();
        await marcarEnviado({ _id: r._id, campaignId: campA._id }, { externalId: 'wamid.1', conversationId: conv });
        expect(fakes.recipients.byId(r._id)).toMatchObject({ status: 'sent', externalId: 'wamid.1', conversationId: conv });
        expect(fakes.recipients.byId(r._id).sentAt).toBeInstanceOf(Date);
        expect(fakes.campaigns.byId(campA._id).sent).toBe(1);
    });

    it('falha só conta se o destinatário ainda estava em "sending"', async () => {
        const r = destinatario({ status: 'sending' });
        await marcarFalha({ _id: r._id, campaignId: campA._id }, '131026: não entregável');
        await marcarFalha({ _id: r._id, campaignId: campA._id }, '131026: não entregável');
        expect(fakes.recipients.byId(r._id)).toMatchObject({ status: 'failed', error: '131026: não entregável' });
        expect(fakes.campaigns.byId(campA._id).failed).toBe(1);
    });

    it('limite de ritmo do gateway: volta para a fila como estava', async () => {
        const r = destinatario({ status: 'sending', claimedAt: new Date() });
        await devolverParaFila(r);
        const doc = fakes.recipients.byId(r._id);
        expect(doc.status).toBe('pending');
        expect(doc.claimedAt).toBeUndefined();
        expect((await reservarDestinatario(r._id)).reserva).toBe('reservado');
    });
});
