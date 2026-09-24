import Favorito from '@/models/Favorito';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import VehicleVariation from '@/models/VehicleVariation';
import RepasseVehicle from '@/models/RepasseVehicle';
import Concessionaria from '@/models/Concessionaria';
import { REPASSE_STATUS_VITRINE } from '@/lib/utils/repasse';
import { filtroPlanoRepasseAtivo } from '@/lib/utils/planoRepasse';

export const chaveFavorito = (marca?: string, modelo?: string) => `${(marca || '').trim()}|${(modelo || '').trim()}`;

export interface FavoritoResumo {
    id: string;
    marca: string;
    modelo: string;
    tipoVeiculo?: string;
    imagemUrl?: string;
    /** Ofertas desse modelo na vitrine agora (0KM + repasse). */
    disponiveis: number;
    /** Ofertas que entraram depois da última vez que o cliente abriu Favoritos. */
    novos: number;
    lastSeenAt: string;
}

/**
 * Datas de entrada das ofertas na vitrine, por modelo. Mesmas regras da consulta
 * (app/api/vehicles): 0KM ativo com modelo ativo no catálogo; repasse disponível de
 * loja com plano de repasse em dia.
 */
async function entradasPorModelo(pares: Array<{ marca: string; modelo: string }>) {
    const porChave = new Map<string, Date[]>();
    if (!pares.length) return porChave;
    const add = (marca: string, modelo: string, data: Date) => {
        const chave = chaveFavorito(marca, modelo);
        const lista = porChave.get(chave) || [];
        lista.push(new Date(data));
        porChave.set(chave, lista);
    };

    const novos = await DealerVehiclePrice.aggregate([
        { $match: { ativo: true } },
        { $lookup: { from: VehicleVariation.collection.name, localField: 'variationId', foreignField: '_id', as: 'variation' } },
        { $unwind: '$variation' },
        { $match: { 'variation.ativo': true, $or: pares.map(p => ({ 'variation.marca': p.marca, 'variation.modelo': p.modelo })) } },
        { $project: { _id: 0, marca: '$variation.marca', modelo: '$variation.modelo', createdAt: 1 } },
    ]);
    for (const d of novos) add(d.marca, d.modelo, d.createdAt);

    const usados = await RepasseVehicle.aggregate([
        { $match: { ativo: true, status: { $in: REPASSE_STATUS_VITRINE }, $or: pares.map(p => ({ marca: p.marca, modelo: p.modelo })) } },
        { $lookup: { from: Concessionaria.collection.name, localField: 'concessionariaId', foreignField: '_id', as: 'concessionariaInfo' } },
        { $unwind: { path: '$concessionariaInfo', preserveNullAndEmptyArrays: true } },
        { $match: filtroPlanoRepasseAtivo('concessionariaInfo.') },
        { $project: { _id: 0, marca: 1, modelo: 1, createdAt: 1 } },
    ]);
    for (const d of usados) add(d.marca, d.modelo, d.createdAt);

    return porChave;
}

export async function resumoFavoritos(userEmail: string): Promise<{ favoritos: FavoritoResumo[]; totalNovos: number }> {
    const favoritos = await Favorito.find({ userEmail }).sort({ createdAt: -1 }).lean();
    const entradas = await entradasPorModelo(favoritos.map(f => ({ marca: f.marca, modelo: f.modelo })));
    const resumo = favoritos.map(f => {
        const datas = entradas.get(chaveFavorito(f.marca, f.modelo)) || [];
        const visto = new Date(f.lastSeenAt || f.createdAt).getTime();
        return {
            id: String(f._id),
            marca: f.marca,
            modelo: f.modelo,
            tipoVeiculo: f.tipoVeiculo,
            imagemUrl: f.imagemUrl,
            disponiveis: datas.length,
            novos: datas.filter(d => d.getTime() > visto).length,
            lastSeenAt: new Date(f.lastSeenAt || f.createdAt).toISOString(),
        };
    });
    return { favoritos: resumo, totalNovos: resumo.reduce((soma, f) => soma + f.novos, 0) };
}
