import { describe, expect, it } from 'vitest';
import {
    aplicarVariaveis,
    filtrarRespostas,
    lerResposta,
    normalizarAtalho,
    primeiroNome,
    type RespostaRapida,
} from '@wa/lib/respostas';
import { normalize } from '@wa/lib/whatsapp-webhook';
import { podeMandarLivre } from '@wa/lib/send';

describe('respostas rápidas', () => {
    it('troca {{nome}} pelo primeiro nome, com a caixa certa', () => {
        expect(primeiroNome('JOÃO DA SILVA')).toBe('João');
        expect(primeiroNome('@maria.loja')).toBe('Maria.loja');
        expect(aplicarVariaveis('Oi {{nome}}, tudo bem?', { nome: 'ana paula' })).toBe('Oi Ana, tudo bem?');
        expect(aplicarVariaveis('Olá {{ NOME }}!', { nome: 'Bia' })).toBe('Olá Bia!');
    });

    it('sem nome, a variável some sem deixar vírgula solta', () => {
        expect(aplicarVariaveis('Oi {{nome}}, tudo bem?', { nome: null })).toBe('Oi, tudo bem?');
        expect(aplicarVariaveis('Bom dia {{nome}}!', { nome: '' })).toBe('Bom dia!');
    });

    it('atalho normalizado e "/" filtra por atalho antes do título', () => {
        expect(normalizarAtalho('/Bom Dia!')).toBe('bomdia');
        expect(normalizarAtalho('financiamento-ç')).toBe('financiamento-c');
        const lista: RespostaRapida[] = [
            { id: '1', title: 'Endereço da loja', shortcut: 'end', text: 'x', category: null },
            { id: '2', title: 'Bom dia', shortcut: 'bomdia', text: 'x', category: null },
            { id: '3', title: 'Fim de semana', shortcut: 'fds', text: 'x', category: null },
        ];
        expect(filtrarRespostas(lista, 'bo').map((r) => r.id)).toEqual(['2']);
        expect(filtrarRespostas(lista, 'end').map((r) => r.id)).toEqual(['1']);
        expect(filtrarRespostas(lista, 'semana').map((r) => r.id)).toEqual(['3']);
        expect(filtrarRespostas(lista, '')).toHaveLength(3);
    });

    it('valida o formulário e sugere o atalho pelo título', () => {
        expect(lerResposta({ title: '', text: 'x' })).toEqual({ ok: false, error: expect.any(String) });
        const r = lerResposta({ title: 'Boas-vindas', text: ' Oi {{nome}} ', category: '' });
        expect(r).toEqual({ ok: true, data: { title: 'Boas-vindas', shortcut: 'boas-vindas', text: 'Oi {{nome}}', category: undefined } });
    });
});

describe('citação e janela', () => {
    it('a resposta do cliente guarda o wamid citado e o nome do documento', () => {
        const [m] = normalize({
            messages: [
                {
                    from: '5531999990000',
                    id: 'wamid.B',
                    timestamp: '1',
                    type: 'document',
                    document: { id: 'media1', filename: 'proposta.pdf' },
                    context: { id: 'wamid.A' },
                },
            ],
        });
        expect(m.contextExternalId).toBe('wamid.A');
        expect(m.filename).toBe('proposta.pdf');
        expect(m.mediaId).toBe('media1');
    });

    it('janela livre: 24h no WhatsApp, 7 dias no Direct, sempre no SMS', () => {
        const h = (n: number) => new Date(Date.now() - n * 3600_000);
        expect(podeMandarLivre('whatsapp', h(23))).toBe(true);
        expect(podeMandarLivre('whatsapp', h(25))).toBe(false);
        expect(podeMandarLivre('whatsapp', null)).toBe(false);
        expect(podeMandarLivre('instagram', h(100))).toBe(true);
        expect(podeMandarLivre('messenger', h(24 * 8))).toBe(false);
        expect(podeMandarLivre('sms', null)).toBe(true);
    });
});
