import mongoose from 'mongoose';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import RepasseVehicle from '@/models/RepasseVehicle';

/**
 * "Estoque atualizado" é a data (updatedAt) de cada anúncio: é ela que a
 * consulta do lojista usa para pintar a bolinha verde, amarela ou vermelha
 * (lib/utils/formatters.ts) e que o painel da concessionária soma em
 * /api/dealership/metrics. Não existe uma data por loja.
 *
 * Por isso confirmar o estoque é carimbar a data de hoje em todos os anúncios
 * ativos da loja, 0KM e repasse. Antes o botão do lembrete só trocava de aba:
 * a loja "atualizava" e, para o lojista, os carros seguiam desatualizados.
 */
export async function confirmarEstoque(concessionariaId: unknown, agora: Date = new Date()): Promise<{ novos: number; repasse: number }> {
    const loja = new mongoose.Types.ObjectId(String(concessionariaId));
    const [novos, repasse] = await Promise.all([
        DealerVehiclePrice.updateMany({ concessionariaId: loja, ativo: true }, { $set: { updatedAt: agora } }),
        RepasseVehicle.updateMany({ concessionariaId: loja, ativo: true }, { $set: { updatedAt: agora } }),
    ]);
    return { novos: novos.matchedCount || 0, repasse: repasse.matchedCount || 0 };
}

/**
 * "Atualizar data" da consulta de Veículos, para os anúncios marcados.
 *
 * Os ids da lista misturam 0KM (DealerVehiclePrice) e repasse (RepasseVehicle):
 * olhar só a primeira coleção deixava o repasse marcado sem data nova.
 * `concessionariaId` restringe à loja de quem pediu; null = equipe interna.
 */
export async function atualizarDataDosAnuncios(ids: unknown[], concessionariaId: unknown | null, agora: Date = new Date()): Promise<number> {
    const validos = Array.from(new Set(ids.map(id => String(id)))).filter(id => mongoose.Types.ObjectId.isValid(id));
    if (!validos.length) return 0;
    const filtro: Record<string, unknown> = { _id: { $in: validos.map(id => new mongoose.Types.ObjectId(id)) } };
    if (concessionariaId) filtro.concessionariaId = new mongoose.Types.ObjectId(String(concessionariaId));
    const [novos, repasse] = await Promise.all([
        DealerVehiclePrice.updateMany(filtro, { $set: { updatedAt: agora } }),
        // lojistaId: null explícito: com _id no filtro o modelo não exclui sozinho
        // o estoque local de lojista, que não é anúncio da vitrine.
        RepasseVehicle.updateMany({ ...filtro, ativo: true, lojistaId: null }, { $set: { updatedAt: agora } }),
    ]);
    return (novos.matchedCount || 0) + (repasse.matchedCount || 0);
}
