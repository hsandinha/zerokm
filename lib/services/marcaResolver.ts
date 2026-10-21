import Marca from '@/models/Marca';
import { pareceData } from '@/lib/utils/marcasCatalogo';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reaproveita a marca existente sem diferenciar maiúsculas (Fiat = FIAT) antes de criar uma nova. */
export async function findOrCreateMarca(nome: string) {
    const existing = await Marca.findOne({ nome: { $regex: `^${escapeRegex(nome)}$`, $options: 'i' } });
    if (existing) return existing;
    // Planilha com a coluna trocada já criou marca com nome de data. Não cria mais.
    if (pareceData(nome)) throw new Error(`"${nome}" não parece nome de marca. Confira a coluna Marca.`);
    return Marca.findOneAndUpdate({ nome }, { $setOnInsert: { nome } }, { new: true, upsert: true });
}
