/**
 * Cobrança por boleto para a concessionária.
 *
 * O lojista paga boleto com os dados do próprio usuário. A concessionária é
 * pessoa jurídica com cadastro próprio (models/Concessionaria.ts): o pagador do
 * boleto é a loja, com CNPJ, razão social e endereço do cadastro dela, e não o
 * usuário que está logado.
 *
 * Arquivo puro: usado pelo servidor, pelas telas e pelos testes.
 */
import { validateCNPJ } from '@/lib/utils/cpf';
import { arredondar, lerValorEmReais, LIMITE_VALOR_COMBINADO } from '@/lib/utils/valorCombinado';

export const TIPOS_COBRANCA_CONCESSIONARIA = ['plano', 'banner', 'avulsa'] as const;
export type TipoCobrancaConcessionaria = (typeof TIPOS_COBRANCA_CONCESSIONARIA)[number];

export const ROTULO_TIPO_COBRANCA: Record<TipoCobrancaConcessionaria, string> = {
    plano: 'Plano de repasse',
    banner: 'Banner',
    avulsa: 'Cobrança avulsa',
};

/** Só estes perfis emitem boleto para qualquer concessionária. */
export const PERFIS_EMITEM_BOLETO_CONCESSIONARIA = new Set(['admin', 'administrador', 'administrativo']);

/**
 * Referência externa da cobrança avulsa (e do banner sem anúncio ligado):
 *   DEALERCOB:<concessionariaId>:<tipo>:<sufixo>
 *
 * Prefixo próprio, como DEALERPLAN: e BANNER:, para o webhook desviar antes do
 * fluxo de assinatura do lojista, que leria "a:b:c" como firebaseUid:plano:período.
 */
export const DEALER_COB_PREFIX = 'DEALERCOB:';
export const BANNER_PREFIX = 'BANNER:';

export function buildDealerCobReference(concessionariaId: string, tipo: TipoCobrancaConcessionaria, sufixo: string | number = Date.now()) {
    return `${DEALER_COB_PREFIX}${concessionariaId}:${tipo}:${sufixo}`;
}

export function parseDealerCobReference(ref: unknown): { concessionariaId: string; tipo: TipoCobrancaConcessionaria } | null {
    if (typeof ref !== 'string' || !ref.startsWith(DEALER_COB_PREFIX)) return null;
    const [, concessionariaId, tipo] = ref.split(':');
    if (!/^[a-f0-9]{24}$/i.test(concessionariaId || '')) return null;
    if (!TIPOS_COBRANCA_CONCESSIONARIA.includes(tipo as TipoCobrancaConcessionaria)) return null;
    return { concessionariaId, tipo: tipo as TipoCobrancaConcessionaria };
}

/** "BANNER:<id>" → id do banner. */
export function parseBannerReference(ref: unknown): string | null {
    if (typeof ref !== 'string' || !ref.startsWith(BANNER_PREFIX)) return null;
    const id = ref.split(':')[1] || '';
    return /^[a-f0-9]{24}$/i.test(id) ? id : null;
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const texto = (v: unknown) => String(v ?? '').trim();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type CadastroConcessionaria = {
    nome?: unknown;
    razaoSocial?: unknown;
    cnpj?: unknown;
    email?: unknown;
    emailResponsavel?: unknown;
    telefone?: unknown;
    celular?: unknown;
    endereco?: unknown;
    numero?: unknown;
    bairro?: unknown;
    cidade?: unknown;
    uf?: unknown;
    cep?: unknown;
};

export type PagadorBoleto = {
    razaoSocial: string;
    cnpj: string;
    email: string;
    telefone: string;
    cep: string;
    rua: string;
    numero: string;
    bairro: string;
    cidade: string;
    uf: string;
};

/**
 * Dados do pagador a partir do cadastro da concessionária. O boleto registrado
 * exige documento e endereço completos: em vez de deixar o Mercado Pago recusar
 * com uma mensagem técnica, devolvemos a lista do que falta no cadastro, com o
 * nome que o campo tem na ficha da concessionária.
 */
export function pagadorDaConcessionaria(c: CadastroConcessionaria | null | undefined): { pagador: PagadorBoleto | null; faltando: string[] } {
    const faltando: string[] = [];
    const cnpj = digitos(c?.cnpj);
    const cep = digitos(c?.cep);
    const uf = texto(c?.uf).toUpperCase();
    const email = [texto(c?.email), texto(c?.emailResponsavel)].find(e => EMAIL.test(e)) || '';

    if (!(cnpj.length === 14 && validateCNPJ(cnpj))) faltando.push('CNPJ válido');
    if (!texto(c?.razaoSocial)) faltando.push('Razão social');
    if (!email) faltando.push('E-mail');
    if (cep.length !== 8) faltando.push('CEP');
    if (!texto(c?.endereco)) faltando.push('Endereço (rua)');
    if (!texto(c?.numero)) faltando.push('Número');
    if (!texto(c?.bairro)) faltando.push('Bairro');
    if (!texto(c?.cidade)) faltando.push('Cidade');
    if (!/^[A-Z]{2}$/.test(uf)) faltando.push('UF');

    if (faltando.length > 0) return { pagador: null, faltando };
    return {
        faltando,
        pagador: {
            razaoSocial: texto(c?.razaoSocial),
            cnpj,
            email: email.toLowerCase(),
            telefone: digitos(c?.celular) || digitos(c?.telefone),
            cep,
            rua: texto(c?.endereco),
            numero: texto(c?.numero),
            bairro: texto(c?.bairro),
            cidade: texto(c?.cidade),
            uf,
        },
    };
}

/** "Faltam no cadastro da concessionária: CNPJ válido, CEP." */
export function mensagemCadastroIncompleto(faltando: string[]): string {
    return `Para emitir o boleto, complete o cadastro da concessionária: ${faltando.join(', ')}.`;
}

/** Piso de segurança: boleto de valor muito baixo não paga a própria tarifa. */
export const VALOR_MINIMO_BOLETO = 5;
export const PRAZO_MAXIMO_BOLETO_DIAS = 30;
export const PRAZO_PADRAO_BOLETO_DIAS = 3;

/** Valor da cobrança em reais, já em centavos exatos (sem 0.1 + 0.2). */
export function lerValorCobranca(entrada: unknown): { valor: number } | { erro: string } {
    const lido = lerValorEmReais(entrada);
    if (lido === null) return { erro: 'Informe o valor da cobrança.' };
    const valor = arredondar(lido);
    if (valor < VALOR_MINIMO_BOLETO) return { erro: `O valor mínimo do boleto é R$ ${VALOR_MINIMO_BOLETO},00.` };
    if (valor > LIMITE_VALOR_COMBINADO) return { erro: 'Valor alto demais. Confira o número.' };
    return { valor };
}

/** Dia do calendário em Brasília (AAAA-MM-DD). O vencimento é uma data, não um instante. */
export function diaEmBrasilia(instante: Date): string {
    return new Date(instante.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function somarDias(dia: string, dias: number): string {
    const d = new Date(`${dia}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

/**
 * Vencimento escolhido na tela (AAAA-MM-DD) → fim daquele dia em Brasília.
 * Vazio usa o prazo padrão. Tem que ser depois de hoje e dentro do prazo que o
 * Mercado Pago aceita.
 */
export function lerVencimentoBoleto(entrada: unknown, agora: Date = new Date()): { vencimento: Date; dia: string } | { erro: string } {
    const hoje = diaEmBrasilia(agora);
    const dia = texto(entrada) || somarDias(hoje, PRAZO_PADRAO_BOLETO_DIAS);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { erro: 'Informe o vencimento.' };
    const vencimento = new Date(`${dia}T23:59:59-03:00`);
    if (Number.isNaN(vencimento.getTime()) || diaEmBrasilia(vencimento) !== dia) return { erro: 'Vencimento inválido.' };
    if (dia <= hoje) return { erro: 'O vencimento precisa ser a partir de amanhã.' };
    if (dia > somarDias(hoje, PRAZO_MAXIMO_BOLETO_DIAS)) return { erro: `O vencimento pode ser no máximo ${PRAZO_MAXIMO_BOLETO_DIAS} dias à frente.` };
    return { vencimento, dia };
}

/** Texto que identifica a cobrança no boleto, no e-mail e nas listas. */
export function descricaoDaCobranca(params: {
    tipo: TipoCobrancaConcessionaria;
    descricao?: unknown;
    planName?: string | null;
    billingType?: 'monthly' | 'annual' | null;
}): string {
    const livre = texto(params.descricao).slice(0, 140);
    if (params.tipo === 'plano') {
        const base = `Plano de Repasse ${params.planName || ''}`.trim();
        return `${base} (${params.billingType === 'annual' ? 'Anual' : 'Mensal'})`;
    }
    if (params.tipo === 'banner') return livre ? `Banner: ${livre}` : 'Banner de anúncio';
    return livre;
}

/** Situação da cobrança para a tela da concessionária. */
export function situacaoDaCobranca(p: { status?: string | null; vencimento?: Date | string | null; baixaManual?: { em?: unknown } | null }, agora: Date = new Date()): {
    chave: 'paga' | 'aguardando' | 'vencida' | 'cancelada' | 'recusada' | 'estornada';
    label: string;
} {
    if (p.baixaManual?.em || p.status === 'approved') return { chave: 'paga', label: 'Pago' };
    if (p.status === 'cancelled') return { chave: 'cancelada', label: 'Cancelado' };
    if (p.status === 'rejected') return { chave: 'recusada', label: 'Recusado' };
    if (p.status === 'refunded' || p.status === 'charged_back') return { chave: 'estornada', label: 'Estornado' };
    const venc = p.vencimento ? new Date(p.vencimento) : null;
    if (venc && Number.isFinite(venc.getTime()) && venc.getTime() < agora.getTime()) return { chave: 'vencida', label: 'Vencido' };
    return { chave: 'aguardando', label: 'Aguardando pagamento' };
}
