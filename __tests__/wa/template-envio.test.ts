// @vitest-environment node
// Template com mídia no cabeçalho, {{1}} no cabeçalho ou link dinâmico no
// botão: o que o envio precisa (formaDoTemplate/extrasDoEnvio) e o corpo que
// vai para o gateway, no formato do TemplateSend do chatrun-conexao.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTemplate, formaDoTemplate, listTemplates, sendTemplate, validateTemplateDraft, type MetaTemplate } from '@wa/lib/meta';
import { TemplateIncompletoError, extrasDoEnvio, textoDoTemplate } from '@wa/lib/template-envio';
import { fallbacksDe, resolveParams, sanitizeParamMap } from '@wa/lib/campaign-params';

process.env.CHATRUN_API_KEY = 'crk_test_123';
process.env.CHATRUN_URL = 'https://gateway.teste';

type Chamada = { url: string; body: any };
let chamadas: Chamada[] = [];
let resposta: unknown = {};
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
    chamadas.push({ url: String(input), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(resposta), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;
afterAll(() => {
    globalThis.fetch = fetchOriginal;
});
beforeEach(() => {
    chamadas = [];
    resposta = { message: { wamid: 'wamid.X' } };
});

const creds = { token: '', phoneNumberId: '1', chatrunConnectionId: 'conn-1' };

const doGateway = {
    id: 't1', name: 'oferta_foto', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED',
    body: 'Oi {{1}}, chegou o {{2}}.', footer: null, header_format: 'IMAGE', header_text: null,
    var_count: 2, buttons: ['Responder', 'Ver carro'],
    buttons_detail: [
        { type: 'QUICK_REPLY', text: 'Responder' },
        { type: 'URL', text: 'Ver carro', url: 'https://loja.com/c/{{1}}', example: 'https://loja.com/c/123' },
    ],
    button_vars: [{ index: 1, text: 'Ver carro', url_prefix: 'https://loja.com/c/' }],
};

describe('forma do template', () => {
    it('lê do gateway o cabeçalho de mídia, as variáveis e o botão dinâmico', async () => {
        resposta = { templates: [doGateway] };
        const [t] = await listTemplates(creds);
        const f = formaDoTemplate(t);
        expect(f).toMatchObject({ headerFormat: 'IMAGE', bodyVars: 2, headerVars: 0 });
        expect(f.botoesUrl).toEqual([{ index: 1, text: 'Ver carro', urlPrefix: 'https://loja.com/c/', example: 'https://loja.com/c/123' }]);
    });

    it('sem button_vars (Cloud API direta), tira dos componentes', () => {
        const t: MetaTemplate = {
            id: '1', name: 'x', status: 'APPROVED', language: 'pt_BR', category: 'MARKETING',
            components: [
                { type: 'HEADER', format: 'TEXT', text: 'Oferta para {{1}}' },
                { type: 'BODY', text: 'Corpo' },
                { type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar' }, { type: 'URL', text: 'Abrir', url: 'https://a.b/{{1}}' }] },
            ],
        };
        const f = formaDoTemplate(t);
        expect(f).toMatchObject({ headerFormat: 'TEXT', headerVars: 1, bodyVars: 0 });
        expect(f.botoesUrl).toEqual([{ index: 1, text: 'Abrir', urlPrefix: 'https://a.b/', example: null }]);
    });
});

describe('extras do envio', () => {
    const f = formaDoTemplate({
        id: '1', name: 'x', status: 'APPROVED', language: 'pt_BR', category: 'MARKETING',
        components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Oi {{1}}' },
            { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://a.b/{{1}}' }] },
        ],
    });

    it('sem o arquivo do cabeçalho, barra com o motivo', () => {
        expect(() => extrasDoEnvio(f, { botoes: [{ index: 0, value: '9' }] })).toThrow(TemplateIncompletoError);
        expect(() => extrasDoEnvio(f, { botoes: [{ index: 0, value: '9' }] })).toThrow(/imagem no cabeçalho/);
    });

    it('arquivo do tipo errado ou link sem final também barram', () => {
        expect(() => extrasDoEnvio(f, { midia: { link: 'https://x/v.mp4', tipo: 'video' }, botoes: [{ index: 0, value: '9' }] })).toThrow(/pede imagem/);
        expect(() => extrasDoEnvio(f, { midia: { link: 'https://x/a.jpg', tipo: 'image' } })).toThrow(/botão "Ver"/);
    });

    it('completo: header e botão no formato do gateway', async () => {
        const extras = extrasDoEnvio(f, { midia: { link: 'https://x/a.jpg', tipo: 'image' }, botoes: [{ index: 0, value: '9' }], clientRef: 'camp:1' });
        await sendTemplate(creds, '+5531988887777', 'x', 'pt_BR', ['Ana'], extras);
        expect(chamadas[0].body).toEqual({
            connection_id: 'conn-1',
            to: '5531988887777',
            type: 'template',
            template: {
                name: 'x',
                language: 'pt_BR',
                body_params: ['Ana'],
                header_params: [{ type: 'image', link: 'https://x/a.jpg' }],
                button_url_params: [{ index: 0, value: '9' }],
            },
            client_ref: 'camp:1',
        });
    });

    it('template simples manda o mesmo corpo de antes', async () => {
        await sendTemplate(creds, '5531988887777', 'oferta_semana', 'pt_BR', ['Maria']);
        expect(chamadas[0].body.template).toEqual({ name: 'oferta_semana', language: 'pt_BR', body_params: ['Maria'] });
        expect(chamadas[0].body.client_ref).toBeUndefined();
    });

    it('o texto gravado na conversa leva o cabeçalho', () => {
        const t = formaDoTemplate({
            id: '1', name: 'x', status: 'APPROVED', language: 'pt_BR', category: 'MARKETING',
            components: [{ type: 'HEADER', format: 'TEXT', text: 'Oferta {{1}}' }, { type: 'BODY', text: 'Oi {{1}}' }],
        });
        expect(textoDoTemplate(t, ['Ana'], 'Nivus')).toBe('*Oferta Nivus*\nOi Ana');
        expect(textoDoTemplate(f, ['Ana'])).toBe('[imagem]\nOi Ana');
    });
});

describe('variáveis da campanha', () => {
    it('variável extra do CSV preenche {{n}}', () => {
        const map = sanitizeParamMap([{ type: 'first_name' }, { type: 'var2' }], 2);
        expect(resolveParams(map, { phone: '+55', contactName: 'ana souza', var2: 'Nivus 2026' })).toEqual(['Ana', 'Nivus 2026']);
    });

    it('loja não manda "sua loja" para o cliente final: empresa vazia fica vazia', () => {
        const map = [{ type: 'company' as const }];
        expect(resolveParams(map, { phone: '+55' }, fallbacksDe(null))).toEqual(['sua loja']);
        expect(resolveParams(map, { phone: '+55' }, fallbacksDe('loja-1'))).toEqual(['']);
    });

    it('tipo desconhecido vindo do cliente não vira "undefined"', () => {
        expect(sanitizeParamMap([{ type: 'hack' }], 1)).toEqual([{ type: 'fixed', value: '' }]);
    });
});

describe('criar template com mídia e botões', () => {
    const base = { name: 'oferta_v1', language: 'pt_BR', category: 'MARKETING' as const, body: 'Oi {{1}}', bodyExamples: ['Ana'] };

    it('valida amostra, link dinâmico e botão de ligar antes da Meta', () => {
        expect(validateTemplateDraft({ ...base, headerFormat: 'IMAGE' })).toContain(
            'Cabeçalho com mídia precisa de um arquivo de amostra: a Meta aprova vendo o exemplo.',
        );
        expect(validateTemplateDraft({ ...base, buttons: [{ type: 'URL', text: 'Ver', url: 'https://a.b/{{1}}/x' }] }).join()).toMatch(/FINAL do endereço/);
        expect(validateTemplateDraft({ ...base, buttons: [{ type: 'URL', text: 'Ver', url: 'https://a.b/{{1}}' }] }).join()).toMatch(/precisa de um exemplo/);
        expect(validateTemplateDraft({ ...base, buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '123' }] }).join()).toMatch(/DDI/);
        expect(validateTemplateDraft({ ...base, buttons: [{ type: 'QUICK_REPLY', text: 'Sim' }, { type: 'QUICK_REPLY', text: 'sim' }] }).join()).toMatch(/mesmo texto/);
        expect(
            validateTemplateDraft({
                ...base,
                headerFormat: 'VIDEO',
                headerSampleUrl: 'https://cnv0km.com.br/api/wa/midia/1?t=x',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Quero' },
                    { type: 'QUICK_REPLY', text: 'Agora não' },
                    { type: 'URL', text: 'Ver', url: 'https://a.b/{{1}}', example: '123' },
                    { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+55 31 99999-0000' },
                ],
            }),
        ).toEqual([]);
    });

    it('manda para o gateway a amostra por sample_url e os botões agrupados', async () => {
        resposta = { id: 'novo', status: 'PENDING', category: 'MARKETING' };
        await createTemplate(creds, {
            ...base,
            headerFormat: 'IMAGE',
            headerSampleUrl: 'https://cnv0km.com.br/api/wa/midia/abc?t=1',
            buttons: [
                { type: 'URL', text: 'Ver', url: 'https://a.b/{{1}}', example: '123' },
                { type: 'QUICK_REPLY', text: 'Quero' },
                { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+55 (31) 99999-0000' },
            ],
        });
        expect(chamadas[0].body).toMatchObject({
            header: { format: 'IMAGE', sample_url: 'https://cnv0km.com.br/api/wa/midia/abc?t=1' },
            buttons: [
                { type: 'QUICK_REPLY', text: 'Quero' },
                { type: 'URL', text: 'Ver', url: 'https://a.b/{{1}}', example: 'https://a.b/123' },
                { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+5531999990000' },
            ],
        });
    });
});
