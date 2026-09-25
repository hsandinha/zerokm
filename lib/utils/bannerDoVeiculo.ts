/**
 * Monta um banner a partir de um veículo do estoque.
 *
 * O formato segue o que já existe no banco, montado à mão até agora: texto em
 * caixa alta, selo "OPORTUNIDADE", link do WhatsApp só com o número (sem
 * mensagem pronta) e `title` igual ao modelo — é isso que mantém o filtro por
 * modelo da tela de Banners funcionando para os automáticos também.
 *
 * O preço é o que a tela mostra, já com a margem aplicada, e não o `preco` cru
 * do veículo: quem clica em "Criar banner" está olhando um número, e o banner
 * tem que sair com esse mesmo número.
 */

import { formatPrazo } from './prazo';

export const BADGE_PADRAO = 'OPORTUNIDADE';

/** O que o banner precisa do veículo. Campos além destes são ignorados. */
export type VeiculoParaBanner = {
    id?: string;
    modelo?: string;
    ano?: string;
    cor?: string;
    combustivel?: string;
    status?: string;
    prazo?: number | null;
    concessionaria?: string;
    telefone?: string;
    imagemUrl?: string;
    fotos?: string[];
};

export type BannerDoVeiculo = {
    title: string;
    imageUrl: string;
    linkUrl: string;
    badge: string;
    price: string;
    priceSubtitle: string;
    vehicleModel: string;
    storeName: string;
    year: string;
    color: string;
    fuel: string;
    delivery: string;
    statusCondition: string;
    ctaText: string;
    vehicleId: string | null;
};

const caixaAlta = (valor?: string | null) => (valor ?? '').trim().toUpperCase();

export const precoEmReal = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

/** A foto da variação do catálogo; `fotos` é o resquício dos cadastros antigos. */
export const fotoDoVeiculo = (veiculo: VeiculoParaBanner): string =>
    (veiculo.imagemUrl || veiculo.fotos?.[0] || '').trim();

/**
 * Por que um veículo não pode virar banner. `null` quando pode.
 * A imagem é obrigatória no schema do banner — sem ela o POST falharia com um
 * erro de validação que não diz nada a quem está na tela.
 */
export function impedimentoParaBanner(veiculo: VeiculoParaBanner): string | null {
    if (!fotoDoVeiculo(veiculo)) {
        return 'Este veículo não tem foto. Associe uma foto à variação no Catálogo para poder anunciar.';
    }
    if (!caixaAlta(veiculo.modelo)) {
        return 'Este veículo não tem modelo preenchido.';
    }
    return null;
}

export function bannerDoVeiculo(veiculo: VeiculoParaBanner, preco: number): BannerDoVeiculo {
    const modelo = caixaAlta(veiculo.modelo);
    const telefone = (veiculo.telefone ?? '').replace(/\D/g, '');
    // "-" é o que o formatPrazo devolve quando não há prazo; no banner isso
    // vira ausência de linha, não um traço solto no meio das especificações.
    const prazo = caixaAlta(formatPrazo(veiculo.prazo ?? null));

    return {
        title: modelo,
        imageUrl: fotoDoVeiculo(veiculo),
        linkUrl: telefone ? `https://wa.me/55${telefone}` : '',
        badge: BADGE_PADRAO,
        price: precoEmReal(preco),
        priceSubtitle: '',
        vehicleModel: modelo,
        storeName: caixaAlta(veiculo.concessionaria),
        year: (veiculo.ano ?? '').trim(),
        color: caixaAlta(veiculo.cor),
        fuel: caixaAlta(veiculo.combustivel),
        delivery: prazo === '-' ? '' : prazo,
        statusCondition: caixaAlta(veiculo.status),
        ctaText: '',
        vehicleId: veiculo.id ?? null,
    };
}
