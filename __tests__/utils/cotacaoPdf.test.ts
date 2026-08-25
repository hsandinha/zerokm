import { describe, expect, it } from 'vitest';
import { montarCotacaoHtml } from '@/lib/utils/cotacaoPdf';

const base = {
    veiculo: {
        marca: 'FIAT',
        modelo: 'PULSE DRIVE 1.3 MT FLEX 4P',
        cor: 'PRETO VULCANO',
        ano: '2027',
        combustivel: 'Flex',
        transmissao: 'Manual',
        opcionais: 'ITENS DE SERIE',
        observacoes: 'PEDIDO PCD',
        estado: 'SP',
        prazo: 0,
        imagemUrl: 'https://exemplo.com/pulse.png',
    },
    preco: 104990,
    nomeCliente: 'Bruno Buiu',
};

describe('cotação em PDF', () => {
    it('traz o nome do cliente no título', () => {
        const html = montarCotacaoHtml(base);
        expect(html).toContain('COTAÇÃO — BRUNO BUIU');
        expect(html).toContain('Bruno Buiu');
    });

    it('usa o preço recebido, que já vem com a margem do perfil', () => {
        const html = montarCotacaoHtml({ ...base, preco: 120000 });
        expect(html).toContain('R$ 120.000,00');
        expect(html).not.toContain('R$ 104.990,00');
    });

    it('não menciona frete em lugar nenhum', () => {
        const html = montarCotacaoHtml(base).toLowerCase();
        expect(html).not.toContain('frete');
        expect(html).not.toContain('transportadora');
    });

    it('usa a foto associada no catálogo', () => {
        expect(montarCotacaoHtml(base)).toContain('src="https://exemplo.com/pulse.png"');
    });

    it('avisa quando a variação não tem foto', () => {
        const html = montarCotacaoHtml({ ...base, veiculo: { ...base.veiculo, imagemUrl: undefined } });
        expect(html).toContain('Foto não cadastrada');
        expect(html).not.toContain('<img class="foto"');
    });

    it('escreve pronta entrega quando o prazo é zero', () => {
        expect(montarCotacaoHtml(base)).toContain('PRONTA ENTREGA');
    });

    it('escapa conteúdo do veículo para não injetar HTML', () => {
        const html = montarCotacaoHtml({
            ...base,
            veiculo: { ...base.veiculo, observacoes: '<script>alert(1)</script>' },
        });
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });
});
