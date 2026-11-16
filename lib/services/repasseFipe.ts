import { after } from 'next/server';
import RepasseVehicle from '@/models/RepasseVehicle';
import { fipeType, queryFipe, type FipeDetail, type FipeOption } from '@/lib/services/fipeService';
import { escolherAnoFipe, parsePreco } from '@/lib/utils/repasse';

/**
 * Preço FIPE dos repasses cadastrados antes de a coluna existir.
 *
 * Quem tem código FIPE e ano, mas não tem preço FIPE, é preenchido aos poucos,
 * DEPOIS que a listagem já respondeu: a tela nunca espera a FIPE. Cada carro é
 * tentado no máximo uma vez por dia (fipeTentativaEm) e cada listagem dispara
 * no máximo MAX_POR_VEZ consultas, então abrir a vitrine várias vezes não vira
 * rajada na FIPE. O preço aparece na próxima vez que a lista for carregada.
 *
 * A gravação não mexe em updatedAt: buscar a FIPE não é a loja atualizando o
 * anúncio, e a vitrine usa essa data para dizer se o estoque está em dia.
 */
const MAX_POR_VEZ = 5;
const INTERVALO_TENTATIVA_MS = 24 * 60 * 60 * 1000;

type Candidato = {
    _id: any;
    tipoVeiculo?: string;
    codigoFipe?: string;
    anoModelo?: number;
    combustivel?: string;
    precoFipe?: number | null;
    fipeTentativaEm?: Date | string | null;
};

/** Falta a FIPE e dá para buscar (tem código e ano), sem tentativa recente. Função pura. */
export function precisaDeFipe(doc: Candidato, agora: number = Date.now()): boolean {
    if (!doc?.codigoFipe || !doc.anoModelo) return false;
    if (typeof doc.precoFipe === 'number' && doc.precoFipe > 0) return false;
    const tentativa = doc.fipeTentativaEm ? new Date(doc.fipeTentativaEm).getTime() : 0;
    return !tentativa || agora - tentativa >= INTERVALO_TENTATIVA_MS;
}

type Consulta = (params: URLSearchParams) => Promise<FipeOption[] | FipeDetail>;

/** Preço FIPE de um carro pelo código e ano-modelo. null = a FIPE não tem esse ano (ou não dá para saber qual). */
export async function consultarPrecoFipe(doc: Candidato, consulta: Consulta = queryFipe): Promise<{ precoFipe: number; referenciaFipe: string } | null> {
    if (!doc.codigoFipe || !doc.anoModelo) return null;
    const base = { type: fipeType(doc.tipoVeiculo), code: doc.codigoFipe };
    const anos = await consulta(new URLSearchParams(base));
    if (!Array.isArray(anos)) return null;
    const ano = escolherAnoFipe(anos, doc.anoModelo, doc.combustivel);
    if (!ano) return null;
    const detalhe = await consulta(new URLSearchParams({ ...base, year: ano }));
    if (Array.isArray(detalhe)) return null;
    const precoFipe = parsePreco(detalhe.price);
    if (!precoFipe) return null;
    return { precoFipe, referenciaFipe: String(detalhe.referenceMonth || '').trim() };
}

/** Busca e grava a FIPE de até MAX_POR_VEZ carros. Devolve quantos foram preenchidos. */
export async function preencherFipeFaltante(candidatos: Candidato[], consulta: Consulta = queryFipe): Promise<number> {
    const agora = Date.now();
    const fila = candidatos.filter(doc => precisaDeFipe(doc, agora)).slice(0, MAX_POR_VEZ);
    let preenchidos = 0;
    for (const doc of fila) {
        // Marca a tentativa antes de consultar: duas listagens ao mesmo tempo não
        // consultam o mesmo carro, e uma falha só é repetida no dia seguinte.
        const reservado = await RepasseVehicle.updateOne(
            {
                _id: doc._id,
                precoFipe: null,
                $or: [{ fipeTentativaEm: null }, { fipeTentativaEm: { $lt: new Date(agora - INTERVALO_TENTATIVA_MS) } }],
            },
            { $set: { fipeTentativaEm: new Date(agora) } },
            { timestamps: false },
        );
        if (!reservado.modifiedCount) continue;
        try {
            const fipe = await consultarPrecoFipe(doc, consulta);
            if (!fipe) continue;
            await RepasseVehicle.updateOne({ _id: doc._id, precoFipe: null }, { $set: fipe }, { timestamps: false });
            preenchidos++;
        } catch (error: any) {
            // FIPE fora do ar ou no limite: para por aqui, as próximas listagens continuam.
            console.warn('[repasse] FIPE não preenchida:', error?.message || error);
            break;
        }
    }
    return preenchidos;
}

/**
 * Dispara o preenchimento depois da resposta. `after` mantém a função viva na
 * Vercel até terminar; fora de uma requisição (testes, scripts) cai no
 * disparo simples, sem esperar.
 */
export function agendarPreenchimentoFipe(candidatos: Candidato[]): void {
    const agora = Date.now();
    const fila = candidatos.filter(doc => precisaDeFipe(doc, agora)).slice(0, MAX_POR_VEZ);
    if (!fila.length) return;
    const tarefa = () => preencherFipeFaltante(fila).then(() => undefined).catch(() => undefined);
    try {
        after(tarefa);
    } catch {
        void tarefa();
    }
}
