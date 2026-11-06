// @vitest-environment node
// Regras puras da Central: autor do balão, atribuição (sozinha e em lote),
// etiquetas, mensagem programada, copiloto e origem do lead.
import { describe, expect, it } from 'vitest';
import { idsDoLote, linhaDaAtribuicao, patchDeAtribuicao, rotuloDoAutor, tiraDaIa, LOTE_MAX } from '@wa/lib/central-regras';
import { chaveDaEtiqueta, lerEtiqueta } from '@wa/lib/etiquetas';
import { decidirEnvio, erroAoProgramar, livreEm, templateProgramavel } from '@wa/lib/programadas';
import { limparSaida, montarTranscricao } from '@wa/lib/copiloto-texto';
import { nomeDaOrigem, origemDoDirectOuMessenger, origemDoWhatsApp, tituloGenerico } from '@wa/lib/origem';
import { relatorioDeOrigens } from '@wa/lib/relatorio-origens';
import { normalize } from '@wa/lib/whatsapp-webhook';

const H = 3600_000;

describe('autor da mensagem', () => {
    it('mostra Você só para quem escreveu; o nome para os colegas', () => {
        const m = { sender: 'human', authorEmail: 'Ana@Loja.com', authorName: 'Ana Souza' };
        expect(rotuloDoAutor(m, 'ana@loja.com')).toBe('Você');
        expect(rotuloDoAutor(m, 'bruno@loja.com')).toBe('Ana Souza');
        expect(rotuloDoAutor({ sender: 'human', authorEmail: 'carla.lima@loja.com' }, 'x@y.z')).toBe('carla lima');
        expect(rotuloDoAutor({ sender: 'human' }, 'x@y.z')).toBe('Equipe');
        expect(rotuloDoAutor({ sender: 'ai' }, 'x@y.z')).toBe('IA');
    });
});

describe('atribuição', () => {
    const agora = new Date('2026-11-06T12:00:00Z');
    it('para si é assumir; para colega espera por ele; sem dono volta à fila', () => {
        expect(patchDeAtribuicao({ status: 'ai_active' }, 'eu@x', 'eu@x', agora)).toEqual({
            assignedTo: 'eu@x',
            status: 'human_active',
            waitingSince: null,
        });
        expect(patchDeAtribuicao({ status: 'human_active' }, 'bia@x', 'eu@x', agora)).toEqual({
            assignedTo: 'bia@x',
            status: 'waiting_human',
            waitingSince: agora,
        });
        expect(patchDeAtribuicao({ status: 'human_active' }, null, 'eu@x', agora)).toEqual({
            assignedTo: null,
            status: 'waiting_human',
            waitingSince: agora,
        });
        // Encerrada só troca o responsável; com a IA, tirar o dono não muda nada.
        expect(patchDeAtribuicao({ status: 'closed' }, 'bia@x', 'eu@x', agora)).toEqual({ assignedTo: 'bia@x' });
        expect(patchDeAtribuicao({ status: 'ai_active' }, null, 'eu@x', agora)).toEqual({ assignedTo: null });
        expect(tiraDaIa('waiting_human')).toBe(true);
        expect(tiraDaIa(undefined)).toBe(false);
    });

    it('linha do tempo', () => {
        const base = { autor: 'Ana', quem: 'ana@x', nomeDoDestino: 'Bia', nomeDoAnterior: 'Caio' };
        expect(linhaDaAtribuicao({ ...base, destino: null, anterior: null })).toBe('Ana tirou o responsável da conversa.');
        expect(linhaDaAtribuicao({ ...base, destino: 'ana@x', anterior: 'caio@x' })).toBe('Ana assumiu a conversa de Caio.');
        expect(linhaDaAtribuicao({ ...base, destino: 'ana@x', anterior: null })).toBe('Ana assumiu a conversa.');
        expect(linhaDaAtribuicao({ ...base, destino: 'bia@x', anterior: null })).toBe('Ana transferiu a conversa para Bia.');
    });

    it('lote: ids válidos, sem repetir, com teto', () => {
        const valido = (id: string) => /^[a-f0-9]{24}$/.test(id);
        const a = 'a'.repeat(24);
        expect(idsDoLote([a, a, 'x', null, 'b'.repeat(24)], valido)).toEqual([a, 'b'.repeat(24)]);
        expect(idsDoLote('nao-e-lista', valido)).toEqual([]);
        const muitos = Array.from({ length: 300 }, (_, i) => i.toString(16).padStart(24, '0'));
        expect(idsDoLote(muitos, valido)).toHaveLength(LOTE_MAX);
    });
});

describe('etiquetas', () => {
    it('mesma etiqueta com caixa, acento e espaço diferentes', () => {
        expect(chaveDaEtiqueta('  Víp   Cliente ')).toBe('vip cliente');
        expect(lerEtiqueta({ nome: '  Financiamento ', cor: 'verde' })).toEqual({
            ok: true,
            data: { nome: 'Financiamento', cor: 'verde', chave: 'financiamento' },
        });
        // Cor desconhecida cai no padrão; sem nome não passa.
        expect(lerEtiqueta({ nome: 'Troca', cor: 'fucsia' })).toMatchObject({ ok: true, data: { cor: 'azul' } });
        expect(lerEtiqueta({ nome: ' ' })).toMatchObject({ ok: false });
        expect(lerEtiqueta({ nome: 'x'.repeat(41) })).toMatchObject({ ok: false });
    });
});

describe('mensagem programada', () => {
    const agora = Date.parse('2026-11-06T12:00:00Z');
    const ha = (h: number) => new Date(agora - h * H);

    it('na hora do envio: texto com a janela aberta, template com ela fechada', () => {
        expect(decidirEnvio({ kind: 'whatsapp', lastInboundAt: ha(2), agora, temModelo: false })).toEqual({ como: 'texto' });
        expect(decidirEnvio({ kind: 'whatsapp', lastInboundAt: ha(30), agora, temModelo: true })).toEqual({ como: 'template' });
        expect(decidirEnvio({ kind: 'whatsapp', lastInboundAt: ha(30), agora, temModelo: false })).toHaveProperty('falha');
        expect(decidirEnvio({ kind: 'instagram', lastInboundAt: ha(24 * 8), agora, temModelo: true })).toHaveProperty('falha');
        expect(decidirEnvio({ kind: 'sms', lastInboundAt: null, agora, temModelo: false })).toEqual({ como: 'texto' });
        expect(decidirEnvio({ kind: 'whatsapp', lastInboundAt: ha(1), agora, temModelo: true, optOut: true })).toHaveProperty('falha');
    });

    it('ao programar: confere a janela no horário escolhido', () => {
        const base = { kind: 'whatsapp', lastInboundAt: ha(2), agora, texto: 'Bom dia!', temModelo: false };
        expect(erroAoProgramar({ ...base, enviarEm: new Date(agora + 3 * H) })).toBeNull();
        // Amanhã às 7h a janela de 24h já fechou: pede o template.
        expect(erroAoProgramar({ ...base, enviarEm: new Date(agora + 23 * H) })).toMatch(/template/);
        expect(erroAoProgramar({ ...base, enviarEm: new Date(agora + 23 * H), temModelo: true })).toBeNull();
        expect(erroAoProgramar({ ...base, enviarEm: new Date(agora - H) })).toMatch(/1 minuto/);
        expect(erroAoProgramar({ ...base, enviarEm: new Date(agora + 61 * 24 * H), temModelo: true })).toMatch(/60 dias/);
        expect(erroAoProgramar({ ...base, texto: '  ', enviarEm: new Date(agora + H) })).toMatch(/Escreva/);
        expect(erroAoProgramar({ ...base, kind: 'messenger', enviarEm: new Date(agora + 8 * 24 * H) })).toMatch(/Messenger/);
        expect(livreEm('instagram', ha(24 * 6), agora)).toBe(true);
    });

    it('só template de corpo dá para guardar para depois', () => {
        expect(templateProgramavel({ headerFormat: null, headerVars: 0, botoesUrl: [] })).toBe(true);
        expect(templateProgramavel({ headerFormat: 'TEXT', headerVars: 0, botoesUrl: [] })).toBe(true);
        expect(templateProgramavel({ headerFormat: 'TEXT', headerVars: 1, botoesUrl: [] })).toBe(false);
        expect(templateProgramavel({ headerFormat: 'IMAGE', headerVars: 0, botoesUrl: [] })).toBe(false);
        expect(
            templateProgramavel({ headerFormat: null, headerVars: 0, botoesUrl: [{ index: 0, text: 'Ver', urlPrefix: 'x', example: null }] }),
        ).toBe(false);
    });
});

describe('copiloto', () => {
    it('transcrição em ordem, com quem falou, mídia e nota da equipe', () => {
        const t = montarTranscricao([
            { tipo: 'mensagem', direction: 'outbound', sender: 'human', content: 'Temos sim!', mediaType: 'text', authorName: 'Ana', createdAt: '2026-11-06T13:01:00Z' },
            { tipo: 'mensagem', direction: 'inbound', sender: 'contact', content: 'Tem Onix 2024?', mediaType: 'text', createdAt: '2026-11-06T13:00:00Z' },
            { tipo: 'mensagem', direction: 'inbound', sender: 'contact', content: null, mediaType: 'audio', createdAt: '2026-11-06T13:02:00Z' },
            { tipo: 'nota', autor: 'Ana', texto: 'quer financiar', createdAt: '2026-11-06T13:03:00Z' },
        ]);
        const linhas = t.split('\n');
        expect(linhas[0]).toMatch(/Cliente: Tem Onix 2024\?$/);
        expect(linhas[1]).toMatch(/Loja \(Ana\): Temos sim!$/);
        expect(linhas[2]).toMatch(/Cliente: \[áudio\]$/);
        expect(linhas[3]).toMatch(/Nota interna da equipe \(Ana\): quer financiar$/);
    });

    it('linha interna (Para a equipe, evento) nunca entra na sugestão; no resumo vira nota', () => {
        const itens = [
            { tipo: 'mensagem' as const, direction: 'inbound' as const, sender: 'contact' as const, content: 'Quero financiar', mediaType: 'text', createdAt: '2026-11-06T13:00:00Z' },
            { tipo: 'mensagem' as const, direction: 'outbound' as const, sender: 'system' as const, content: '— Para a equipe (pediu_humano): cliente com nome sujo', mediaType: 'text', createdAt: '2026-11-06T13:01:00Z' },
            { tipo: 'mensagem' as const, direction: 'outbound' as const, sender: 'system' as const, content: 'Distribuída automaticamente para Ana.', mediaType: 'evento', createdAt: '2026-11-06T13:02:00Z' },
            { tipo: 'mensagem' as const, direction: 'outbound' as const, sender: 'system' as const, content: 'Nosso horário é 8h às 18h', mediaType: 'text', externalId: 'wamid.1', createdAt: '2026-11-06T13:03:00Z' },
        ];
        const sugestao = montarTranscricao(itens, { internas: 'omitir' });
        expect(sugestao).not.toMatch(/nome sujo|Distribuída/);
        expect(sugestao.split('\n')).toHaveLength(2);
        expect(sugestao).toMatch(/Mensagem automática da loja: Nosso horário/);

        const resumo = montarTranscricao(itens, { internas: 'nota' });
        expect(resumo).toMatch(/Nota interna, não enviada ao cliente: — Para a equipe/);
        expect(resumo).not.toMatch(/Mensagem automática da loja: — Para a equipe/);
        expect(resumo).toMatch(/\(Distribuída automaticamente para Ana\.\)/);
    });

    it('limpa aspas e rótulo em volta da resposta', () => {
        expect(limparSaida('"Oi, João! Tudo bem?"')).toBe('Oi, João! Tudo bem?');
        expect(limparSaida('Mensagem: Bom dia')).toBe('Bom dia');
        expect(limparSaida('```\nTexto\n```')).toBe('Texto');
    });
});

describe('origem do lead', () => {
    const referral = {
        source_url: 'https://fb.me/abc',
        source_id: '120200000000123456',
        source_type: 'ad',
        headline: 'Converse conosco',
        body: 'Onix 2024 com entrada facilitada',
        media_type: 'image',
        image_url: 'https://scontent.example/img.jpg',
        ctwa_clid: 'ARAkLkA8rmlFeiCktEJQ',
    };

    it('normaliza o referral do WhatsApp e guarda o ctwa_clid', () => {
        expect(origemDoWhatsApp(referral)).toEqual({
            canal: 'whatsapp',
            tipoOrigem: 'ad',
            idOrigem: '120200000000123456',
            titulo: 'Converse conosco',
            texto: 'Onix 2024 com entrada facilitada',
            link: 'https://fb.me/abc',
            midia: 'image',
            imagemUrl: 'https://scontent.example/img.jpg',
            ctwaClid: 'ARAkLkA8rmlFeiCktEJQ',
        });
        expect(origemDoWhatsApp({})).toBeNull();
        expect(origemDoWhatsApp(null)).toBeNull();
    });

    it('o webhook leva o anúncio até o inbound (e sem referral nada muda)', () => {
        const [com, sem] = normalize({
            messages: [
                { from: '5531999990000', id: 'wamid.1', timestamp: '1', type: 'text', text: { body: 'Quero saber mais' }, referral } as any,
                { from: '5531999990000', id: 'wamid.2', timestamp: '2', type: 'text', text: { body: 'oi' } },
            ],
        });
        expect(com.anuncio?.idOrigem).toBe('120200000000123456');
        expect(sem).not.toHaveProperty('anuncio');
    });

    it('Messenger: só anúncio conta (link m.me não)', () => {
        expect(origemDoDirectOuMessenger('messenger', { ref: 'promo', source: 'SHORTLINK' })).toBeNull();
        expect(
            origemDoDirectOuMessenger('messenger', {
                ad_id: '999',
                source: 'ADS',
                ads_context_data: { ad_title: 'Feirão', photo_url: 'https://x/y.jpg' },
            }),
        ).toMatchObject({ canal: 'messenger', idOrigem: '999', titulo: 'Feirão', midia: 'image' });
    });

    it('nome: apelido, texto, título não genérico, fim do id', () => {
        expect(nomeDaOrigem({ apelido: 'Onix vídeo', texto: 'x' })).toBe('Onix vídeo');
        expect(nomeDaOrigem({ titulo: 'Converse conosco', texto: 'Feirão de sábado' })).toBe('Feirão de sábado');
        expect(nomeDaOrigem({ titulo: 'Feirão CNV' })).toBe('Feirão CNV');
        expect(nomeDaOrigem({ titulo: 'api.whatsapp.com', idOrigem: '120200000000123456' })).toBe('Anúncio 123456');
        expect(tituloGenerico('Saiba mais')).toBe(true);
    });

    it('relatório: cada conversa uma vez, anúncio no período vence, venda é ganho', () => {
        const desde = new Date('2026-10-01T00:00:00Z');
        const ate = new Date('2026-10-31T23:59:59Z');
        const em = '2026-10-10T10:00:00Z';
        const anuncio = { idOrigem: 'A1', canal: 'whatsapp', texto: 'Onix', em };
        const rel = relatorioDeOrigens({
            desde,
            ate,
            anuncios: [{ idOrigem: 'A1', apelido: 'Onix vídeo' }],
            campanhas: [{ id: 'C1', name: 'Black Friday' }],
            conversas: [
                { id: '1', stage: 'ganho', createdAt: em, canal: 'whatsapp', origem: anuncio },
                // A mesma conversa repetida (veio nas duas consultas) conta uma vez.
                { id: '1', stage: 'ganho', createdAt: em, canal: 'whatsapp', origem: anuncio },
                // Antiga que voltou pelo anúncio no período: conta no anúncio.
                { id: '2', stage: 'conversa', createdAt: '2026-08-01T00:00:00Z', canal: 'whatsapp', origem: anuncio },
                { id: '3', stage: 'ganho', createdAt: em, canal: 'whatsapp', campaignId: 'C1' },
                { id: '4', stage: 'perdido', createdAt: em, canal: 'instagram' },
                // Fora do período: não conta.
                { id: '5', stage: 'ganho', createdAt: '2026-09-01T00:00:00Z', canal: 'whatsapp' },
            ],
        });
        expect(rel.linhas.map((l) => [l.nome, l.conversas, l.vendas])).toEqual([
            ['Onix vídeo', 2, 1],
            ['Campanha: Black Friday', 1, 1],
            ['Sem anúncio · Instagram', 1, 0],
        ]);
        expect(rel.total).toEqual({ conversas: 4, vendas: 2 });
        expect(rel.porAnuncio).toEqual({ conversas: 2, vendas: 1 });
    });
});
