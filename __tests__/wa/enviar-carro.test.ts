// @vitest-environment node
// "Enviar carro" da Central (wa/lib/enviar-carro.ts): as fotos e o cartão
// saem com o autor, para o balão e os relatórios por atendente mostrarem
// quem mandou. O envio é um espião.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enviados = vi.hoisted(() => [] as Array<{ tipo: string; sender: string; author: unknown }>);
vi.mock('@wa/lib/send', () => ({
    sendAndLogMedia: async (p: any) => void enviados.push({ tipo: 'foto', sender: p.sender, author: p.author }),
    sendAndLogText: async (p: any) => void enviados.push({ tipo: 'cartao', sender: p.sender, author: p.author }),
}));
vi.mock('@wa/lib/foto-estoque', () => ({ linkDaFotoEstoque: (base: string, id: string) => `${base}/f/${id}` }));
vi.mock('@wa/lib/estoque-ficha', () => ({ cartaoDoCarro: () => 'Onix 2024' }));
// O carro enviado vira o carro da conversa (o valor da venda que vai para a Meta).
const ligados = vi.hoisted(() => [] as Array<{ conversationId: string; por: string }>);
vi.mock('@wa/lib/conversoes-meta-servidor', () => ({
    ligarCarroNaConversa: async (p: any) => void ligados.push({ conversationId: p.conversationId, por: p.por }),
}));

import { enviarCarroDoPatio } from '@wa/lib/enviar-carro';

beforeEach(() => {
    enviados.length = 0;
    ligados.length = 0;
});

describe('enviar carro do pátio', () => {
    it('cada foto e o cartão levam quem mandou', async () => {
        const autor = { email: 'ana@loja.com', name: 'Ana' };
        await enviarCarroDoPatio({
            conversationId: 'c1',
            to: '+5531999998888',
            oferta: { fotoIds: ['a', 'b'] } as any,
            base: 'https://x',
            canal: 'whatsapp',
            sender: 'human',
            author: autor,
        });
        expect(enviados).toEqual([
            { tipo: 'foto', sender: 'human', author: autor },
            { tipo: 'foto', sender: 'human', author: autor },
            { tipo: 'cartao', sender: 'human', author: autor },
        ]);
    });

    it('pela IA não tem autor', async () => {
        await enviarCarroDoPatio({ conversationId: 'c1', to: 'x', oferta: { fotoIds: [] } as any, base: 'https://x', canal: 'instagram', sender: 'ai' });
        expect(enviados).toEqual([{ tipo: 'cartao', sender: 'ai', author: null }]);
    });

    it('o carro que foi para o cliente fica ligado à conversa', async () => {
        await enviarCarroDoPatio({ conversationId: 'c9', to: 'x', oferta: { ref: 'L1A2B3', preco: 89900, fotoIds: [] } as any, base: 'https://x', canal: 'whatsapp', sender: 'ai' });
        expect(ligados).toEqual([{ conversationId: 'c9', por: 'ai' }]);
    });
});
