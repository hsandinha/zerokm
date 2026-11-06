/**
 * Funcionalidades liberadas por cliente — o mesmo modelo do Chatrun
 * (orgs.recursos): o CNV escolhe, conta a conta, o que cada concessionária e
 * cada lojista usa. O que está desligado some do menu e as rotas recusam.
 *
 * Gravado em Concessionaria.recursos (a loja inteira, todos os usuários dela)
 * e em User.recursos do lojista titular (os sub-usuários seguem o titular).
 * Só a diferença do padrão é gravada: chave ausente = padrão abaixo, então
 * quem já usa o sistema continua com tudo como antes.
 *
 * Exceção: o atendimento (o Chatrun dentro da zerokm) é produto novo e nasce
 * desligado — o CNV libera cliente a cliente. O Messenger também, como no
 * Chatrun, enquanto a Meta não aprova as permissões da Página.
 *
 * Arquivo puro: usado pelo servidor e pela tela.
 */

export type TipoConta = 'concessionaria' | 'lojista';

export type Recurso =
    | 'crm'
    | 'anuncios'
    | 'favoritos'
    | 'atendimento'
    | 'funil'
    | 'agenda'
    | 'campanhas'
    | 'automacoes'
    | 'estoque_local'
    | 'instagram'
    | 'messenger'
    | 'sms'
    | 'ia'
    | 'simulador'
    | 'vende_rede';

export type Recursos = Record<Recurso, boolean>;

type ItemRecurso = {
    chave: Recurso;
    rotulo: string;
    descricao: string;
    /** Só faz sentido para este tipo de conta. Ausente = os dois. */
    so?: TipoConta;
    depende?: Recurso;
};

export const GRUPOS_DE_RECURSOS: Array<{ grupo: string; itens: ItemRecurso[] }> = [
    {
        grupo: 'Painel',
        itens: [
            { chave: 'crm', rotulo: 'CRM', descricao: 'Funil de leads da concessionária, com tarefas e relatórios. Os interessados do atendimento entram aqui.', so: 'concessionaria' },
            { chave: 'anuncios', rotulo: 'Meus anúncios', descricao: 'Banners da concessionária na vitrine do CNV.', so: 'concessionaria' },
            { chave: 'favoritos', rotulo: 'Favoritos', descricao: 'O lojista favorita veículos e modelos e é avisado quando chega oferta nova.', so: 'lojista' },
        ],
    },
    {
        grupo: 'Atendimento',
        itens: [
            {
                chave: 'atendimento',
                rotulo: 'Atendimento (Central)',
                descricao: 'A área de atendimento da loja: Central de conversas, contatos e o WhatsApp da loja. Ao liberar, começa o período de teste no primeiro acesso.',
            },
            { chave: 'funil', rotulo: 'Funil de vendas', descricao: 'Etapas de venda na conversa e o quadro do funil.', depende: 'atendimento' },
            {
                chave: 'agenda',
                rotulo: 'Agenda e tarefas',
                descricao: 'Visitas e test drives marcados (também pela IA), lembrete ao cliente na véspera e as tarefas da equipe.',
                depende: 'atendimento',
            },
            { chave: 'campanhas', rotulo: 'Campanhas e modelos', descricao: 'Disparo para a lista da loja e modelos aprovados pela Meta.', depende: 'atendimento' },
            {
                chave: 'automacoes',
                rotulo: 'Automações e follow-up',
                descricao: 'Pós-atendimento com avaliação no Google, pós-venda, aniversário e follow-up por coluna do funil. Ligado por padrão para quem tem o atendimento.',
                depende: 'atendimento',
            },
            {
                chave: 'estoque_local',
                rotulo: 'Estoque do pátio',
                descricao: 'O lojista cadastra os carros que tem na loja; a IA vende esses primeiro.',
                so: 'lojista',
                depende: 'atendimento',
            },
        ],
    },
    {
        grupo: 'Canais',
        itens: [
            { chave: 'instagram', rotulo: 'Instagram', descricao: 'Direct da loja na mesma Central.', depende: 'atendimento' },
            { chave: 'messenger', rotulo: 'Messenger', descricao: 'Mensagens da Página do Facebook na mesma Central.', depende: 'atendimento' },
            { chave: 'sms', rotulo: 'SMS e RCS', descricao: 'Pela conta Zenvia ou Comtele da própria loja: só a equipe responde.', depende: 'atendimento' },
        ],
    },
    {
        grupo: 'Inteligência artificial',
        itens: [
            { chave: 'ia', rotulo: 'IA de vendas', descricao: 'A IA atende com o estoque da zerokm, qualifica e passa para a equipe. Usa a chave de IA da loja.', depende: 'atendimento' },
            { chave: 'simulador', rotulo: 'Simulação de financiamento', descricao: 'A IA simula parcelas com a taxa da loja.', depende: 'ia' },
            {
                chave: 'vende_rede',
                rotulo: 'Vender o estoque da rede',
                descricao: 'A IA do lojista oferece também o 0KM e o repasse das concessionárias, com a margem dele.',
                so: 'lojista',
                depende: 'ia',
            },
        ],
    },
];

export const TODOS_OS_RECURSOS: Recurso[] = GRUPOS_DE_RECURSOS.flatMap(g => g.itens.map(i => i.chave));

const ITENS = new Map(GRUPOS_DE_RECURSOS.flatMap(g => g.itens).map(i => [i.chave, i]));

/** Desligados quando a chave não está gravada (ver acima). */
const DESLIGADOS_POR_PADRAO: Recurso[] = ['atendimento', 'messenger'];

/** O item vale para este tipo de conta? */
export function recursoAplica(chave: Recurso, tipo: TipoConta): boolean {
    const so = ITENS.get(chave)?.so;
    return !so || so === tipo;
}

/**
 * Lê o que está gravado e devolve o pacote completo do tipo de conta. Item que
 * não é do tipo fica desligado; dependência desligada derruba quem depende
 * (sem atendimento não há IA; sem IA não há simulador).
 */
export function lerRecursos(bruto: unknown, tipo: TipoConta): Recursos {
    const obj = bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {};
    const r = Object.fromEntries(
        TODOS_OS_RECURSOS.map(k => [k, recursoAplica(k, tipo) && (k in obj ? obj[k] === true : !DESLIGADOS_POR_PADRAO.includes(k))]),
    ) as Recursos;
    // A ordem de TODOS_OS_RECURSOS já põe cada dependência antes de quem depende.
    for (const k of TODOS_OS_RECURSOS) {
        const dep = ITENS.get(k)?.depende;
        if (dep && !r[dep]) r[k] = false;
    }
    return r;
}

/**
 * Só as chaves que diferem do padrão: é isso que se grava. Item cuja
 * dependência está desligada não é escolha de ninguém (a tela mostra apagado),
 * então não é gravado: ao religar o atendimento, o pacote volta ao padrão em
 * vez de vir com tudo desligado.
 */
export function diferencaDoPadrao(recursos: Partial<Recursos>, tipo: TipoConta): Partial<Recursos> {
    const efetivo = lerRecursos(recursos, tipo);
    const out: Partial<Recursos> = {};
    for (const k of TODOS_OS_RECURSOS) {
        if (!recursoAplica(k, tipo) || typeof recursos[k] !== 'boolean') continue;
        const dep = ITENS.get(k)?.depende;
        if (dep && !efetivo[dep]) continue;
        if (recursos[k] !== !DESLIGADOS_POR_PADRAO.includes(k)) out[k] = recursos[k];
    }
    return out;
}

export const MSG_RECURSO_DESLIGADO = 'Funcionalidade não liberada para a sua conta. Fale com o CNV.';
