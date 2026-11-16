/**
 * Pendências de uma concessionária: o que impede a loja de funcionar e que a
 * equipe precisa resolver. Aparecem como selos na lista de Concessionárias e no
 * cabeçalho da ficha (components/admin/FichaConcessionaria.tsx).
 *
 * Loja inativa não tem pendência: está pausada de propósito.
 *
 * Arquivo puro (sem banco): usado pelo servidor, pela tela e pelos testes.
 */

export type PendenciaId = 'sem-marca' | 'sem-login' | 'sem-plano' | 'estoque-parado';

export type Pendencia = {
    id: PendenciaId;
    /** Texto do selo. */
    rotulo: string;
    /** Por que isso trava a loja, para o title do selo e o resumo da ficha. */
    detalhe: string;
    /** Aba da ficha onde se resolve. */
    aba: 'marcas' | 'acessos' | 'planos' | 'estoque';
};

/** O que a regra precisa saber da loja. Campo ausente (undefined) = não avaliado, não vira pendência. */
export type ResumoDaLoja = {
    ativo?: boolean | null;
    marcaIds?: unknown[] | null;
    marcaId?: unknown;
    /** A loja tem ao menos um login de titular (atendente não conta). */
    temLogin?: boolean;
    planoRepasse?: { ativo?: boolean; expiresAt?: string | Date | null } | null;
    /** Anúncios de repasse ativos cadastrados pela loja. */
    repassesCadastrados?: number;
    /** Última mexida no estoque 0KM. `null` = nunca enviou. */
    ultimaAtualizacao?: string | Date | null;
};

/** Farol do estoque: verde até 15 dias, amarelo até 30, vermelho acima (ou sem envio). */
export const DIAS_ESTOQUE_EM_DIA = 15;
export const DIAS_ESTOQUE_ATENCAO = 30;

/** Dias desde a última atualização do estoque (null = nunca enviou). */
export function diasSemAtualizar(data: string | Date | null | undefined, agora: Date = new Date()): number | null {
    if (!data) return null;
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86_400_000));
}

export type FarolDoEstoque = { tone: 'positive' | 'warning' | 'negative'; label: string };

export function farolDoEstoque(data: string | Date | null | undefined, agora: Date = new Date()): FarolDoEstoque {
    const dias = diasSemAtualizar(data, agora);
    if (dias === null) return { tone: 'negative', label: 'Sem envio' };
    const label = dias === 0 ? 'Hoje' : dias === 1 ? 'Ontem' : `Há ${dias} dias`;
    if (dias <= DIAS_ESTOQUE_EM_DIA) return { tone: 'positive', label };
    if (dias <= DIAS_ESTOQUE_ATENCAO) return { tone: 'warning', label };
    return { tone: 'negative', label };
}

/** Estoque no vermelho do farol: nunca enviou ou passou de 30 dias. */
export function estoqueParado(data: string | Date | null | undefined, agora: Date = new Date()): boolean {
    const dias = diasSemAtualizar(data, agora);
    return dias === null || dias > DIAS_ESTOQUE_ATENCAO;
}

const temMarca = (loja: ResumoDaLoja) => Boolean((loja.marcaIds && loja.marcaIds.length > 0) || loja.marcaId);

/**
 * Regras:
 *  - Sem marca: nenhuma marca vinculada. Sem marca a loja não vê nenhum modelo
 *    do catálogo no painel dela.
 *  - Sem login: nenhum titular com acesso. Ninguém da loja consegue entrar.
 *  - Sem plano: só quando a falta do plano de repasse derruba algo. O 0KM não
 *    depende de plano, então loja que nunca assinou e não tem repasse
 *    cadastrado não é pendência. Vira pendência quando o plano venceu (fila de
 *    renovação) ou quando há repasse cadastrado sem plano em dia: esses
 *    anúncios estão fora da vitrine.
 *  - Estoque parado: o vermelho do farol do estoque (sem envio ou mais de 30 dias).
 */
export function pendenciasDaLoja(loja: ResumoDaLoja, agora: Date = new Date()): Pendencia[] {
    if (loja.ativo === false) return [];
    const lista: Pendencia[] = [];

    if (!temMarca(loja)) {
        lista.push({ id: 'sem-marca', rotulo: 'Sem marca', detalhe: 'Sem marca vinculada a loja não vê nada no painel dela.', aba: 'marcas' });
    }

    if (loja.temLogin === false) {
        lista.push({ id: 'sem-login', rotulo: 'Sem login', detalhe: 'Nenhum titular com acesso: ninguém da loja consegue entrar no painel.', aba: 'acessos' });
    }

    const plano = loja.planoRepasse;
    if (plano !== undefined && !plano?.ativo) {
        const repasses = loja.repassesCadastrados || 0;
        if (plano?.expiresAt) {
            lista.push({
                id: 'sem-plano',
                rotulo: 'Plano vencido',
                detalhe: repasses > 0
                    ? `Plano de repasse vencido: ${repasses} ${repasses === 1 ? 'anúncio de repasse está' : 'anúncios de repasse estão'} fora da vitrine.`
                    : 'Plano de repasse vencido: a loja não consegue anunciar repasse até renovar.',
                aba: 'planos',
            });
        } else if (repasses > 0) {
            lista.push({
                id: 'sem-plano',
                rotulo: 'Sem plano',
                detalhe: `${repasses} ${repasses === 1 ? 'anúncio de repasse cadastrado' : 'anúncios de repasse cadastrados'} sem plano de repasse: não aparecem na vitrine.`,
                aba: 'planos',
            });
        }
    }

    if (loja.ultimaAtualizacao !== undefined && estoqueParado(loja.ultimaAtualizacao, agora)) {
        const dias = diasSemAtualizar(loja.ultimaAtualizacao, agora);
        lista.push({
            id: 'estoque-parado',
            rotulo: 'Estoque parado',
            detalhe: dias === null ? 'A loja nunca enviou estoque.' : `Estoque sem atualização há ${dias} dias.`,
            aba: 'estoque',
        });
    }

    return lista;
}

export function temPendencia(loja: ResumoDaLoja, agora: Date = new Date()): boolean {
    return pendenciasDaLoja(loja, agora).length > 0;
}

/** Filtro "Com pendência" da lista de Concessionárias. */
export function lojasComPendencia<T extends ResumoDaLoja>(lojas: T[], agora: Date = new Date()): T[] {
    return lojas.filter(l => temPendencia(l, agora));
}
