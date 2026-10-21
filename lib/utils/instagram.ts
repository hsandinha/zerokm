/**
 * Instagram do lojista, obrigatório no cadastro.
 *
 * Aceita o que a pessoa costuma colar: "@loja", "loja", o link do perfil
 * (instagram.com/loja, com ou sem https, www, barra ou ?igsh=...). Guarda sempre
 * como "@loja", em minúsculas (o Instagram não diferencia maiúsculas).
 */
// Sem lookbehind de propósito: o arquivo roda no navegador, e iPhone com
// Safari antigo derruba a página inteira ao ler esse tipo de regex.
const usuarioValido = (u: string) => /^[a-z0-9._]{1,30}$/.test(u) && !u.startsWith('.') && !u.endsWith('.') && !u.includes('..');

export function normalizarInstagram(valor: unknown): string | null {
    if (typeof valor !== 'string') return null;
    let texto = valor.trim();
    if (!texto) return null;

    const doLink = texto.match(/instagram\.com\/([^/?#\s]+)/i);
    if (doLink) texto = doLink[1];

    texto = texto.replace(/^@+/, '').replace(/\/+$/, '').toLowerCase();
    if (!usuarioValido(texto)) return null;
    // Caminhos do site que não são perfil.
    if (['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(texto)) return null;
    return `@${texto}`;
}

export function linkInstagram(usuario?: string | null): string | null {
    const normalizado = normalizarInstagram(usuario || '');
    return normalizado ? `https://instagram.com/${normalizado.slice(1)}` : null;
}

export const ERRO_INSTAGRAM = 'Informe o Instagram da loja (ex.: @sualoja). O cadastro só é concluído com ele.';
