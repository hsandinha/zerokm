import type { PublicoAviso } from '@/models/Aviso';
import { parseSubscriptionStartDate } from '@/lib/utils/subscriptionDates';

/** Perfis que podem criar avisos para os assinantes. */
export const PERFIS_AVISOS = ['admin', 'administrador', 'administrativo'];

/** Públicos de aviso que um perfil enxerga. Equipe interna não recebe aviso. */
export function publicosDoPerfil(perfil?: string | null): PublicoAviso[] {
    if (perfil === 'cliente' || perfil === 'gratis') return ['clientes', 'todos'];
    if (perfil === 'concessionaria' || perfil === 'dealership') return ['concessionarias', 'todos'];
    return [];
}

/** Só link http(s) no botão do aviso. */
export function linkSeguro(url: unknown): string | undefined {
    if (typeof url !== 'string') return undefined;
    const limpo = url.trim();
    if (!limpo) return undefined;
    if (/^https?:\/\//i.test(limpo) || limpo.startsWith('/')) return limpo;
    return undefined;
}

/** Valida e normaliza o corpo do formulário de aviso (criar e editar). */
export function lerAvisoDoCorpo(body: any) {
    const titulo = typeof body?.titulo === 'string' ? body.titulo.trim() : '';
    const mensagem = typeof body?.mensagem === 'string' ? body.mensagem.trim() : '';
    if (!titulo) return { erro: 'Informe o título do aviso.' } as const;
    if (!mensagem) return { erro: 'Escreva a mensagem do aviso.' } as const;
    if (titulo.length > 120) return { erro: 'Título com no máximo 120 caracteres.' } as const;
    if (mensagem.length > 2000) return { erro: 'Mensagem com no máximo 2000 caracteres.' } as const;
    const publico = ['clientes', 'concessionarias', 'todos'].includes(body?.publico) ? body.publico : 'clientes';
    const linkUrl = linkSeguro(body?.linkUrl);
    if (body?.linkUrl && !linkUrl) return { erro: 'O link precisa começar com https://' } as const;
    const inicio = body?.inicio ? parseSubscriptionStartDate(body.inicio) : null;
    const fim = body?.fim ? parseSubscriptionStartDate(body.fim) : null;
    if ((body?.inicio && !inicio) || (body?.fim && !fim)) return { erro: 'Data inválida.' } as const;
    if (fim) fim.setUTCHours(23 + 3, 59, 59); // fim do dia em Brasília
    if (inicio) inicio.setUTCHours(3, 0, 0); // 0h em Brasília
    if (inicio && fim && fim < inicio) return { erro: 'O fim precisa ser depois do início.' } as const;
    return {
        dados: {
            titulo,
            mensagem,
            publico,
            linkUrl,
            linkTexto: typeof body?.linkTexto === 'string' ? body.linkTexto.trim().slice(0, 40) || undefined : undefined,
            inicio,
            fim,
            ativo: body?.ativo !== false,
        },
    } as const;
}
