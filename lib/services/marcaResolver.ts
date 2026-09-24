import Marca from '@/models/Marca';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reaproveita a marca existente sem diferenciar maiúsculas (Fiat = FIAT) antes de criar uma nova. */
export async function findOrCreateMarca(nome: string) {
    const existing = await Marca.findOne({ nome: { $regex: `^${escapeRegex(nome)}$`, $options: 'i' } });
    if (existing) return existing;
    return Marca.findOneAndUpdate({ nome }, { $setOnInsert: { nome } }, { new: true, upsert: true });
}
