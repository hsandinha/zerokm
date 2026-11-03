import Concessionaria from '@/models/Concessionaria';

/**
 * Concessionária com o estoque oculto (Concessionaria.ocultarVitrine).
 *
 * Ocultar não exclui nem desativa: a loja continua logando, atualizando preços
 * e recebendo o lembrete de estoque. Só o cliente final deixa de ver os carros
 * dela — 0KM e repasse — na consulta, nas sugestões, nos favoritos e nos
 * números da home. A própria concessionária continua vendo o que é dela.
 */

/** Filtro Mongo "loja aparece na vitrine". `prefix` = caminho até a concessionária ('' ou 'concessionariaInfo.'). */
export function filtroLojaNaVitrine(prefix = '') {
    return { [`${prefix}ocultarVitrine`]: { $ne: true } };
}

/** Ids das concessionárias ocultas, para filtrar anúncios por `concessionariaId` sem juntar a loja. */
export async function concessionariasForaDaVitrine() {
    return Concessionaria.find({ ocultarVitrine: true }).distinct('_id');
}
