import mongoose from 'mongoose';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import VehicleVariation from '@/models/VehicleVariation';
import RepasseVehicle from '@/models/RepasseVehicle';
import User from '@/models/User';
import { serializePlanoRepasse } from '@/lib/utils/planoRepasse';

/**
 * Números por concessionária que a lista e a ficha mostram: estoque 0KM,
 * última atualização, logins e repasses cadastrados. Sempre agregado (uma
 * consulta por coleção para todas as lojas): são centenas de lojas na lista.
 */
export type NumerosDaLoja = {
    unidades: number;
    ultimaAtualizacao: Date | null;
    titulares: number;
    atendentes: number;
    atendentesAtivos: number;
    repassesCadastrados: number;
};

const VAZIO: NumerosDaLoja = { unidades: 0, ultimaAtualizacao: null, titulares: 0, atendentes: 0, atendentesAtivos: 0, repassesCadastrados: 0 };

/** `ids` restringe a consulta (ficha de uma loja); sem ele, todas as lojas. */
export async function numerosDasLojas(ids?: Array<string | mongoose.Types.ObjectId>): Promise<{ de: (id: string) => NumerosDaLoja }> {
    const objIds = ids?.map(id => new mongoose.Types.ObjectId(String(id)));
    const strIds = ids?.map(id => String(id));

    const [precos, usuarios, repasses] = await Promise.all([
        // Estoque e atividade saem de DealerVehiclePrice, ligado por
        // concessionariaId. A fonte anterior era a coleção legada Vehicle,
        // casada pelo NOME da concessionária, que errava sempre que o nome
        // cadastrado divergia do digitado no veículo.
        DealerVehiclePrice.aggregate([
            ...(objIds ? [{ $match: { concessionariaId: { $in: objIds } } }] : []),
            {
                $lookup: {
                    from: VehicleVariation.collection.name,
                    localField: 'variationId',
                    foreignField: '_id',
                    as: 'variation',
                },
            },
            { $unwind: { path: '$variation', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$concessionariaId',
                    // Estoque: só preço ativo cujo modelo continua no catálogo mestre.
                    unidades: {
                        $sum: {
                            $cond: [
                                { $and: ['$ativo', { $eq: ['$variation.ativo', true] }] },
                                { $ifNull: ['$quantidade', 0] },
                                0,
                            ],
                        },
                    },
                    // Atividade: qualquer mexida conta, inclusive zerar estoque.
                    ultimaAtualizacao: { $max: '$updatedAt' },
                },
            },
        ]),
        // Logins da loja: User.dealershipId é texto. Usuário antigo, sem papel, é titular.
        User.aggregate([
            { $match: { dealershipId: strIds ? { $in: strIds } : { $nin: [null, ''] } } },
            {
                $group: {
                    _id: '$dealershipId',
                    titulares: { $sum: { $cond: [{ $eq: ['$papelLoja', 'atendente'] }, 0, 1] } },
                    atendentes: { $sum: { $cond: [{ $eq: ['$papelLoja', 'atendente'] }, 1, 0] } },
                    atendentesAtivos: {
                        $sum: { $cond: [{ $and: [{ $eq: ['$papelLoja', 'atendente'] }, { $ne: ['$atendenteInativo', true] }] }, 1, 0] },
                    },
                },
            },
        ]),
        // Anúncios de repasse da loja (estoque local de lojista não é anúncio da vitrine).
        RepasseVehicle.aggregate([
            { $match: { ativo: true, lojistaId: null, concessionariaId: objIds ? { $in: objIds } : { $ne: null } } },
            { $group: { _id: '$concessionariaId', total: { $sum: 1 } } },
        ]),
    ]);

    const mapa = new Map<string, NumerosDaLoja>();
    const linha = (id: unknown) => {
        const chave = String(id);
        let atual = mapa.get(chave);
        if (!atual) { atual = { ...VAZIO }; mapa.set(chave, atual); }
        return atual;
    };
    for (const p of precos) {
        if (!p._id) continue;
        const l = linha(p._id);
        l.unidades = p.unidades ?? 0;
        l.ultimaAtualizacao = p.ultimaAtualizacao ?? null;
    }
    for (const u of usuarios) {
        const l = linha(u._id);
        l.titulares = u.titulares ?? 0;
        l.atendentes = u.atendentes ?? 0;
        l.atendentesAtivos = u.atendentesAtivos ?? 0;
    }
    for (const r of repasses) {
        if (!r._id) continue;
        linha(r._id).repassesCadastrados = r.total ?? 0;
    }
    return { de: (id: string) => mapa.get(String(id)) || VAZIO };
}

/** Concessionária como a lista e a ficha recebem. Nunca inclui webhookSecret. */
export function serializeConcessionaria(doc: any) {
    return {
        id: doc._id.toString(),
        nome: doc.nome,
        razaoSocial: doc.razaoSocial,
        marcaId: doc.marcaId?.toString(),
        marca: doc.marca,
        marcaIds: Array.isArray(doc.marcaIds) ? doc.marcaIds.map((m: any) => m.toString()) : [],
        marcas: Array.isArray(doc.marcas) ? doc.marcas : [],
        operadorId: doc.operadorId?.toString(),
        telefone: doc.telefone,
        celular: doc.celular,
        contato: doc.contato,
        email: doc.email,
        endereco: doc.endereco,
        numero: doc.numero,
        complemento: doc.complemento,
        inscricaoEstadual: doc.inscricaoEstadual,
        bairro: doc.bairro,
        cidade: doc.cidade,
        cnpj: doc.cnpj,
        uf: doc.uf,
        cep: doc.cep,
        nomeResponsavel: doc.nomeResponsavel,
        telefoneResponsavel: doc.telefoneResponsavel,
        emailResponsavel: doc.emailResponsavel,
        observacoes: doc.observacoes,
        ativo: doc.ativo,
        ocultarVitrine: Boolean(doc.ocultarVitrine),
        vitrineOcultaEm: doc.vitrineOcultaEm ? new Date(doc.vitrineOcultaEm).toISOString() : null,
        vitrineOcultaPor: doc.vitrineOcultaPor || null,
        dataCadastro: doc.dataCadastro ? new Date(doc.dataCadastro).toISOString() : null,
        criadoEm: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
        atualizadoEm: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
        // Quem assinou o repasse. Sem isto a listagem não tem como mostrar a
        // situação do plano, e o controle fica só na tela de Estoque, uma loja
        // por vez.
        planoRepasse: serializePlanoRepasse(doc.planoRepasse),
    };
}

/** Os campos de resumo que a lista e a ficha somam à concessionária serializada. */
export function numerosSerializados(n: NumerosDaLoja) {
    return {
        totalVeiculos: n.unidades,
        totalAtivos: n.unidades,
        ultimaAtualizacao: n.ultimaAtualizacao,
        temLogin: n.titulares > 0,
        totalTitulares: n.titulares,
        totalAtendentes: n.atendentes,
        repassesCadastrados: n.repassesCadastrados,
    };
}
