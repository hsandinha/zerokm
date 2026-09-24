import { fipeType, normalizeFipeCode, queryFipe, type FipeDetail, type FipeOption } from './fipeService';
export type FipeImportRow = { codigoFipe?: string; descricaoFipe?: string; marca: string; modelo: string; anoModelo?: number; combustivel?: string; tipoVeiculo?: string; warnings: string[] };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** Never guesses a version from free text, nor overwrites the supplier's commercial data. */
export async function enrichFipeRows<T extends FipeImportRow>(rows: T[], lookup = queryFipe): Promise<T[]> {
    const cache = new Map<string, Promise<FipeOption[] | FipeDetail>>();
    let lookups = 0;
    const deadline = Date.now() + 20000;
    const fetchOnce = (params: URLSearchParams) => {
        const key = params.toString();
        if (!cache.has(key)) {
            if (Date.now() > deadline) throw Error('Tempo de consulta da prévia atingido. Tente as linhas restantes em outro lote.');
            if (++lookups > 40) throw Error('Limite desta prévia atingido. Consulte as linhas restantes em outro lote ou vincule depois.');
            cache.set(key, lookup(params));
        }
        return cache.get(key)!;
    };
    const enrich = async (row: T) => {
        const item = { ...row, warnings: [...row.warnings] };
        if (!item.codigoFipe) { item.warnings.push('Sem código FIPE: cadastro manual, sem associação automática por nome.'); return item; }
        try {
            item.codigoFipe = normalizeFipeCode(item.codigoFipe);
            if (!item.tipoVeiculo) throw Error('Informe o tipo de veículo para consultar o código FIPE.');
            if (!item.anoModelo) throw Error('Informe o ano-modelo para validar o código FIPE.');
            const params = new URLSearchParams({ type: fipeType(item.tipoVeiculo), code: item.codigoFipe });
            const years = await fetchOnce(params) as FipeOption[];
            const matches = years.filter(year => Number(year.code.split('-')[0]) === item.anoModelo && (!item.combustivel || normalize(year.name.replace(/^\S+\s*/, '')) === normalize(item.combustivel)));
            if (matches.length !== 1) throw Error(matches.length ? 'Mais de um combustível disponível. Informe o combustível para confirmar.' : 'Ano/combustível não encontrado para este código. Revise a linha.');
            params.set('year', matches[0].code);
            const detail = await fetchOnce(params) as FipeDetail;
            if (item.marca && normalize(item.marca) !== normalize(detail.brand)) throw Error(`Marca informada difere da FIPE (${detail.brand}). Revise antes de vincular.`);
            item.marca ||= detail.brand;
            item.modelo ||= detail.model;
            item.combustivel ||= detail.fuel;
            item.descricaoFipe = detail.model;
            item.warnings.push(`FIPE consultada: ${detail.model}. Campos existentes preservados; revise a correspondência.`);
        } catch (error) {
            item.warnings.push(`FIPE pendente: ${(error as Error).message}`);
        }
        return item;
    };
    const output: T[] = [];
    // Bounded concurrency and deduplicated requests protect the provider quota.
    for (let index = 0; index < rows.length; index += 2) output.push(...await Promise.all(rows.slice(index, index + 2).map(enrich)));
    return output;
}
