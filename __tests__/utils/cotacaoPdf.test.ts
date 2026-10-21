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
    it('o título do orçamento é MEU CARRO, e a loja segue no rodapé', () => {
        const html = montarCotacaoHtml(base);
        expect(html).toContain('<h2>MEU CARRO</h2>');
        expect(html).toContain('<title>MEU CARRO</title>');
        expect(html).not.toContain('COTAÇÃO — BRUNO BUIU');
        expect(html).toContain('Bruno Buiu');
    });

    it('não leva a seção de observações', () => {
        const html = montarCotacaoHtml(base);
        expect(html).not.toContain('OBSERVAÇÕES');
        expect(html).not.toContain('PEDIDO PCD');
    });

    it('põe a logo da loja no topo quando existe', () => {
        const logo = 'data:image/png;base64,iVBORw0KGgo=';
        expect(montarCotacaoHtml({ ...base, logoUrl: logo })).toContain(`<img class="logo" src="${logo}"`);
        expect(montarCotacaoHtml(base)).not.toContain('class="logo"');
    });

    it('recusa logo que não é imagem', () => {
        expect(montarCotacaoHtml({ ...base, logoUrl: 'javascript:alert(1)' })).not.toContain('class="logo"');
    });

    it('mostra a quilometragem do usado', () => {
        expect(montarCotacaoHtml({ ...base, veiculo: { ...base.veiculo, km: 'Usado · 48.500 km' } })).toContain('48.500 km');
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
            veiculo: { ...base.veiculo, opcionais: '<script>alert(1)</script>' },
        });
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });
});
