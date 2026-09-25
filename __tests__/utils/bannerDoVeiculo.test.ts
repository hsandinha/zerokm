import { describe, expect, it } from 'vitest';
import { bannerDoVeiculo, fotoDoVeiculo, impedimentoParaBanner } from '@/lib/utils/bannerDoVeiculo';

const VEICULO = {
    id: 'v1',
    modelo: 'Mobi Like 1.0 Mec.',
    ano: '26/27',
    cor: 'Preto Vulcano',
    combustivel: 'Flex',
    status: 'A faturar',
    prazo: 90,
    concessionaria: 'Fiat Campinas',
    telefone: '(11) 97580-0804',
    imagemUrl: 'https://cdn.cnv/mobi.jpg',
};

describe('banner montado a partir do veículo', () => {
    it('segue o formato dos banners que já existem: caixa alta e selo padrão', () => {
        const banner = bannerDoVeiculo(VEICULO, 67222);

        expect(banner.vehicleModel).toBe('MOBI LIKE 1.0 MEC.');
        expect(banner.color).toBe('PRETO VULCANO');
        expect(banner.fuel).toBe('FLEX');
        expect(banner.statusCondition).toBe('A FATURAR');
        expect(banner.storeName).toBe('FIAT CAMPINAS');
        expect(banner.badge).toBe('OPORTUNIDADE');
        // O ano é o único que não vai para caixa alta: já é numérico.
        expect(banner.year).toBe('26/27');
    });

    it('usa o título igual ao modelo, que é o que o filtro da tela de Banners procura', () => {
        const banner = bannerDoVeiculo(VEICULO, 67222);

        expect(banner.title).toBe(banner.vehicleModel);
    });

    it('formata o preço recebido, não o preço cru do veículo', () => {
        // 67222 é o preço já com margem, o mesmo que a linha mostra.
        // O Intl separa "R$" do número com espaço não separável (U+00A0) —
        // igual ao que o formulário de banner já gravava, então mantém.
        const { price } = bannerDoVeiculo(VEICULO, 67222);
        expect(price.replace(/\u00a0/g, ' ')).toBe('R$ 67.222,00');
        expect(price).toContain('\u00a0');
    });

    it('traduz o prazo em dias para o texto do banner', () => {
        expect(bannerDoVeiculo({ ...VEICULO, prazo: 90 }, 1).delivery).toBe('90 DIAS');
        expect(bannerDoVeiculo({ ...VEICULO, prazo: 0 }, 1).delivery).toBe('PRONTA ENTREGA');
    });

    it('sem prazo, a linha de entrega some em vez de virar um traço', () => {
        // formatPrazo devolve "-" quando não há prazo; um traço solto no meio
        // das especificações não diz nada a quem lê o anúncio.
        expect(bannerDoVeiculo({ ...VEICULO, prazo: undefined }, 1).delivery).toBe('');
    });

    it('monta o link do WhatsApp só com o número, como os banners existentes', () => {
        expect(bannerDoVeiculo(VEICULO, 1).linkUrl).toBe('https://wa.me/5511975800804');
    });

    it('sem telefone, fica sem link em vez de gerar um wa.me quebrado', () => {
        expect(bannerDoVeiculo({ ...VEICULO, telefone: '' }, 1).linkUrl).toBe('');
    });

    it('prende o banner ao veículo que o originou', () => {
        expect(bannerDoVeiculo(VEICULO, 1).vehicleId).toBe('v1');
    });
});

describe('foto do veículo', () => {
    it('prefere a imagem da variação do catálogo', () => {
        expect(fotoDoVeiculo({ imagemUrl: 'a.jpg', fotos: ['b.jpg'] })).toBe('a.jpg');
    });

    it('cai para o cadastro antigo quando não há imagem de catálogo', () => {
        expect(fotoDoVeiculo({ fotos: ['b.jpg'] })).toBe('b.jpg');
    });
});

describe('quando o veículo não pode virar banner', () => {
    it('sem foto, explica o que fazer em vez de deixar o POST falhar', () => {
        // `imageUrl` é obrigatório no schema do banner: sem este aviso o erro
        // chegaria como uma falha de validação do Mongo, ilegível na tela.
        expect(impedimentoParaBanner({ ...VEICULO, imagemUrl: '' })).toMatch(/foto/i);
    });

    it('sem modelo, também barra', () => {
        expect(impedimentoParaBanner({ ...VEICULO, modelo: '  ' })).toMatch(/modelo/i);
    });

    it('com foto e modelo, libera', () => {
        expect(impedimentoParaBanner(VEICULO)).toBeNull();
    });
});
