import mongoose from 'mongoose';
import Favorito from '@/models/Favorito';
import FavoritoVeiculo from '@/models/FavoritoVeiculo';
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

export interface FavoritoVeiculoResumo {
    id: string;
    veiculoId: string;
    origem: 'novo' | 'repasse';
    marca: string;
    modelo: string;
    ano?: string;
    cor?: string;
    tipoVeiculo?: string;
    imagemUrl?: string;
    /** A oferta continua na vitrine. */
    disponivel: boolean;
    /** Preço, quantidade ou status mudaram desde a última visita a Favoritos. */
    atualizado: boolean;
    lastSeenAt: string;
}

/**
 * Situação das ofertas favoritadas: se continuam na vitrine (mesmas regras da
 * consulta) e quando foram alteradas pela última vez.
 */
async function situacaoDasOfertas(ids: Array<{ veiculoId: string; origem: string }>) {
    const porId = new Map<string, { disponivel: boolean; updatedAt: Date | null }>();
    const validos = (origem: string) => ids
        .filter(f => f.origem === origem && mongoose.isValidObjectId(f.veiculoId))
        .map(f => new mongoose.Types.ObjectId(f.veiculoId));

    const novos = validos('novo');
    if (novos.length) {
        const docs = await DealerVehiclePrice.aggregate([
            { $match: { _id: { $in: novos } } },
            { $lookup: { from: VehicleVariation.collection.name, localField: 'variationId', foreignField: '_id', as: 'variation' } },
            { $unwind: { path: '$variation', preserveNullAndEmptyArrays: true } },
            { $project: { ativo: 1, updatedAt: 1, variacaoAtiva: '$variation.ativo' } },
        ]);
        for (const d of docs) porId.set(String(d._id), { disponivel: Boolean(d.ativo && d.variacaoAtiva), updatedAt: d.updatedAt || null });
    }

    const usados = validos('repasse');
    if (usados.length) {
        const docs = await RepasseVehicle.find({ _id: { $in: usados } }).select('ativo status updatedAt').lean();
        // Usado só fica na vitrine se a loja estiver com o plano de repasse em dia.
        const comPlano = new Set((await RepasseVehicle.aggregate([
            { $match: { _id: { $in: usados } } },
            { $lookup: { from: Concessionaria.collection.name, localField: 'concessionariaId', foreignField: '_id', as: 'concessionariaInfo' } },
            { $unwind: { path: '$concessionariaInfo', preserveNullAndEmptyArrays: true } },
            { $match: filtroPlanoRepasseAtivo('concessionariaInfo.') },
            { $project: { _id: 1 } },
        ])).map((d: any) => String(d._id)));
        for (const d of docs as any[]) {
            const naVitrine = Boolean(d.ativo) && (REPASSE_STATUS_VITRINE as readonly string[]).includes(d.status) && comPlano.has(String(d._id));
            porId.set(String(d._id), { disponivel: naVitrine, updatedAt: d.updatedAt || null });
        }
    }
    return porId;
}

export async function resumoFavoritos(userEmail: string): Promise<{ veiculos: FavoritoVeiculoResumo[]; favoritos: FavoritoResumo[]; totalNovos: number }> {
    const [favoritosVeiculo, favoritos] = await Promise.all([
        FavoritoVeiculo.find({ userEmail }).sort({ createdAt: -1 }).lean(),
        Favorito.find({ userEmail }).sort({ createdAt: -1 }).lean(),
    ]);

    const situacao = await situacaoDasOfertas(favoritosVeiculo.map(f => ({ veiculoId: f.veiculoId, origem: f.origem })));
    const veiculos: FavoritoVeiculoResumo[] = favoritosVeiculo.map(f => {
        const s = situacao.get(f.veiculoId);
        const visto = new Date(f.lastSeenAt || f.createdAt).getTime();
        return {
            id: String(f._id),
            veiculoId: f.veiculoId,
            origem: f.origem,
            marca: f.marca,
            modelo: f.modelo,
            ano: f.ano,
            cor: f.cor,
            tipoVeiculo: f.tipoVeiculo,
            imagemUrl: f.imagemUrl,
            disponivel: Boolean(s?.disponivel),
            atualizado: Boolean(s?.disponivel && s.updatedAt && new Date(s.updatedAt).getTime() > visto),
            lastSeenAt: new Date(f.lastSeenAt || f.createdAt).toISOString(),
        };
    });

    // Favoritos antigos, por modelo: continuam contando ofertas novas daquele modelo.
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
    const totalNovos = veiculos.filter(v => v.atualizado).length + resumo.reduce((soma, f) => soma + f.novos, 0);
    return { veiculos, favoritos: resumo, totalNovos };
}
