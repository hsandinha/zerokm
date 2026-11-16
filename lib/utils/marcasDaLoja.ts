// Marcas que a equipe do CNV vinculou à concessionária. Sem nenhuma, a loja
// não vê nada: nem catálogo de preços, nem a consulta de veículos. Aceita o
// formato novo (marcaIds/marcas) e o antigo (marcaId/marca).

type MarcasDaLoja = { marcaIds?: unknown[] | null; marcas?: unknown[] | null; marcaId?: unknown; marca?: unknown };

export function lojaTemMarca(loja: MarcasDaLoja | null | undefined): boolean {
    if (!loja) return false;
    if (Array.isArray(loja.marcaIds) && loja.marcaIds.some(Boolean)) return true;
    if (Array.isArray(loja.marcas) && loja.marcas.some(m => typeof m === 'string' && m.trim() !== '')) return true;
    if (loja.marcaId) return true;
    return typeof loja.marca === 'string' && loja.marca.trim() !== '';
}

/**
 * Perfil que a consulta de veículos deve usar. Login de concessionária que
 * também tem o teste grátis de lojista (e-mail que já existia quando foi
 * vinculado à loja) não navega a vitrine inteira pelo teste: vale a loja.
 */
export function perfilDaConsulta(perfilEfetivo: string | null | undefined, usuario: { dealershipId?: unknown } | null | undefined): string | null | undefined {
    if (perfilEfetivo === 'gratis' && usuario?.dealershipId) return 'concessionaria';
    return perfilEfetivo;
}
