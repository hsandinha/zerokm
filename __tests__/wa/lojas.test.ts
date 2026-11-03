// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildStorePrompt, sanitizeStoreText, toolsDaLoja } from '@wa/lib/ai-loja';
import { ofertasParaIa, type Oferta } from '@wa/lib/estoque';
import { simular, simuladorDaLoja } from '@wa/lib/simulador';
import { stagesFor } from '@wa/lib/stages';
import { sameTenant } from '@wa/lib/scope';
import { lerReferenciaAtendimento, referenciaAtendimento } from '@wa/lib/assinatura-atendimento';

const lojaBase = {
    name: 'Auto Center Teste',
    kind: 'lojista' as const,
    ai: {
        active: true,
        assistantName: 'Bia',
        provider: 'gemini' as const,
        maxTurns: 30,
        vendeEstoqueCnv: true,
        knowledgeBase: 'Rua A, 100. Seg a sáb, 9h às 18h.',
    },
};

describe('prompt da IA da loja', () => {
    it('leva nome da loja, assistente e o que ela vende', () => {
        const p = buildStorePrompt({ store: lojaBase as never, channel: { kind: 'whatsapp', label: 'WhatsApp' } });
        expect(p).toContain('Bia');
        expect(p).toContain('Auto Center Teste');
        expect(p).toContain('rede parceira');
        expect(p).toContain('Rua A, 100');
    });

    it('nunca deixa revelar a concessionária de origem', () => {
        const p = buildStorePrompt({ store: lojaBase as never, channel: { kind: 'whatsapp', label: 'WhatsApp' } });
        expect(p).toMatch(/Nunca diga de qual concessionária/);
    });

    it('no Instagram pede o celular para a visita', () => {
        const p = buildStorePrompt({ store: lojaBase as never, channel: { kind: 'instagram', label: '@loja' } });
        expect(p).toContain('Direct do Instagram');
        expect(p).toContain('celular');
    });

    it('concessionária vende só o próprio estoque', () => {
        const p = buildStorePrompt({
            store: { ...lojaBase, kind: 'concessionaria' } as never,
            channel: { kind: 'whatsapp', label: 'WhatsApp' },
        });
        expect(p).toContain('da própria concessionária');
        expect(p).not.toContain('rede parceira');
    });
});

describe('ferramentas da loja', () => {
    it('simulação só aparece com o financiamento ligado; localização só com mapa', () => {
        const sem = toolsDaLoja({ financiamento: { ativo: false } } as never).map((t) => t.name);
        expect(sem).not.toContain('simular_financiamento');
        expect(sem).not.toContain('enviar_localizacao');
        const com = toolsDaLoja({ financiamento: { ativo: true }, mapsUrl: 'https://maps.app.goo.gl/x' } as never).map((t) => t.name);
        expect(com).toContain('simular_financiamento');
        expect(com).toContain('enviar_localizacao');
    });

    it('tira do texto a ferramenta narrada', () => {
        expect(sanitizeStoreText('Vou ver aqui!\nbuscar_estoque(termo: "onix")')).toBe('Vou ver aqui!');
    });
});

describe('estoque para a IA', () => {
    it('lista com código interno, km/0km e preço; sem nada, avisa', () => {
        const o: Oferta = {
            ref: 'L1A2B3', origem: 'local', titulo: 'CHEVROLET ONIX LT', ano: '21/22', km: 35000,
            cores: ['Prata'], combustivel: 'Flex', cambio: 'Automático', preco: 79900, prazoDias: null,
            opcionais: null, observacoes: 'único dono',
        };
        const txt = ofertasParaIa([o]);
        expect(txt).toContain('[L1A2B3]');
        expect(txt).toContain('35.000 km');
        expect(txt).toContain('no pátio da loja');
        expect(txt).toMatch(/R\$\s?79\.900/);
        expect(ofertasParaIa([])).toMatch(/Nenhum veículo/);
    });
});

describe('simulador de financiamento da loja', () => {
    it('usa a taxa e a entrada mínima da loja (tabela Price)', () => {
        const cfg = simuladorDaLoja({ ativo: true, taxaMensal: 2, entradaMinimaPct: 20, prazos: [48] });
        const r = simular(cfg, { valor: 100000 });
        expect(r.aviso).toBeNull();
        expect(r.linhas[0]).toMatch(/^48x de R\$\s?2\.608,\d\d/);
        expect(r.linhas.at(-1)).toContain('2% ao mês');
    });
});

describe('funil e escopo', () => {
    it('loja tem os mesmos ids de etapa com nomes de venda de carro', () => {
        const cnv = stagesFor(false).map((s) => s.id);
        const loja = stagesFor(true);
        expect(loja.map((s) => s.id)).toEqual(cnv);
        expect(loja.find((s) => s.id === 'ganho')?.label).toBe('Vendido');
        expect(loja.find((s) => s.id === 'cadastro')?.label).toBe('Visita / test drive');
    });

    it('documento sem tenantId é do CNV; loja não enxerga o do CNV', () => {
        expect(sameTenant({ tenantId: null }, {})).toBe(true);
        expect(sameTenant({ tenantId: 'loja1' }, {})).toBe(false);
        expect(sameTenant({ tenantId: 'loja1' }, { tenantId: 'loja1' })).toBe(true);
        expect(sameTenant({ tenantId: 'loja1' }, { tenantId: 'loja2' })).toBe(false);
    });
});

describe('referência do pagamento do atendimento', () => {
    it('ida e volta; rejeita outras referências', () => {
        const store = '65a1b2c3d4e5f6a7b8c9d0e1';
        const plan = '65a1b2c3d4e5f6a7b8c9d0e2';
        const user = '65a1b2c3d4e5f6a7b8c9d0e3';
        const ref = referenciaAtendimento(store, plan, 'annual', user);
        expect(lerReferenciaAtendimento(ref)).toEqual({ storeId: store, planId: plan, billingType: 'annual', userId: user });
        expect(lerReferenciaAtendimento('DEALERPLAN:x:y:monthly:z')).toBeNull();
    });
});
