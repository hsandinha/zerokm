/**
 * Textos dos planos vêm do cadastro do admin, muitas vezes todo em
 * maiúsculas ("PLANO PLUS - ACESSO TOTAL AO SISTEMA"). Estas funções deixam o
 * texto legível no site e no modal de assinatura, sem mudar o que está salvo.
 */

/** Texto todo em maiúsculas vira frase normal, mantendo siglas como 0KM. */
export function textoLegivel(texto: string) {
    const limpo = texto.replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s{2,}/g, ' ').trim();
    if (/[a-zà-ú]/.test(limpo)) return limpo;
    const frase = limpo.toLocaleLowerCase('pt-BR');
    return (frase.charAt(0).toLocaleUpperCase('pt-BR') + frase.slice(1)).replace(/\b0km\b/gi, '0KM');
}

/** "PLANO PLUS - ACESSO TOTAL AO SISTEMA" vira título "Plano Plus" e resumo "Acesso total ao sistema". */
export function dividirNomePlano(nome: string) {
    const [titulo, ...resto] = nome.split(/\s+-\s+/);
    const tituloLegivel = /[a-zà-ú]/.test(titulo)
        ? titulo.trim()
        : titulo.trim().toLocaleLowerCase('pt-BR').replace(/(^|\s)(\S)/g, (_, esp: string, letra: string) => esp + letra.toLocaleUpperCase('pt-BR'));
    return { titulo: tituloLegivel, resumo: resto.length ? textoLegivel(resto.join(' - ')) : '' };
}

/** A descrição do plano vira lista: cada trecho separado por "+" ou " - " é um item. */
export function itensDoPlano(descricao?: string) {
    if (!descricao) return [];
    return descricao.split(/\s+[+]\s+|\s+-\s+|\n+/).map(textoLegivel).filter(Boolean);
}

/**
 * Recursos do plano para a lista do site: os cadastrados um a um, e quando
 * alguém colou tudo num item só ("A + B + C"), cada trecho vira um item.
 */
export function recursosDoPlano(features: string[] = [], descricao?: string) {
    const itens = features.flatMap(f => f.split(/\s+[+]\s+|\n+/)).map(t => textoLegivel(t).replace(/\.$/, '')).filter(Boolean);
    return itens.length ? itens : itensDoPlano(descricao);
}
