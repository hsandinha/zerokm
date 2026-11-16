// Perfil da sessão: quem decide é o cadastro no banco, nunca o navegador.
// O login manda o perfil escolhido e a troca de perfil manda o novo; os dois
// só valem se o usuário tem aquele perfil. Antes, qualquer valor era aceito.

const APELIDOS: Record<string, string> = { dealership: 'concessionaria', operator: 'operador', admin: 'administrador', client: 'cliente' };

const normalizar = (p: unknown): string => {
    const s = typeof p === 'string' ? p.trim().toLowerCase() : '';
    return APELIDOS[s] ?? s;
};

/**
 * O perfil pedido, se o usuário o tem; senão o primeiro que ele tem; sem
 * nenhum, null (não entra).
 */
export function perfilDaSessao(pedido: unknown, permitidos: readonly string[] | null | undefined): string | null {
    const lista = (permitidos ?? []).filter(p => typeof p === 'string' && p.trim() !== '');
    if (lista.length === 0) return null;
    const alvo = normalizar(pedido);
    if (alvo) {
        const achado = lista.find(p => normalizar(p) === alvo);
        if (achado) return achado;
    }
    return lista[0];
}

/** Troca de perfil pedida pelo navegador: só para um perfil que o usuário tem. */
export function trocaDePerfilValida(pedido: unknown, permitidos: readonly string[] | null | undefined): string | null {
    const alvo = normalizar(pedido);
    if (!alvo) return null;
    return (permitidos ?? []).find(p => normalizar(p) === alvo) ?? null;
}
