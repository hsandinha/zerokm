import mongoose from 'mongoose';
import Marca from '@/models/Marca';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const texto = (value: string | null) => (value || '').trim();

/**
 * Filtro da lista do Catálogo (busca, marca, tipo, ativas). A lista e a
 * exportação usam o mesmo filtro, para o arquivo trazer o que está na tela.
 */
export async function filtroDoCatalogo(searchParams: URLSearchParams) {
    const search = texto(searchParams.get('search'));
    const marca = texto(searchParams.get('marca'));
    const marcaId = texto(searchParams.get('marcaId'));
    const tipo = texto(searchParams.get('tipo'));
    const activeParam = searchParams.get('active');

    const query: Record<string, any> = {};
    const condicoes: Record<string, any>[] = [];
    if (tipo && tipo !== 'todos') query.tipoVeiculo = tipo;
    if (activeParam !== 'all') query.ativo = activeParam === 'false' ? false : true;
    if (marcaId) {
        // Id inválido não derruba a lista: só não acha nada.
        if (!mongoose.isValidObjectId(marcaId)) return { _id: null };
        // Variações antigas sem marca vinculada entram pelo nome.
        const doc = await Marca.findById(marcaId).select('nome').lean();
        condicoes.push(doc
            ? { $or: [{ marcaId: new mongoose.Types.ObjectId(marcaId) }, { marcaId: null, marca: { $regex: `^${escapeRegex(doc.nome)}$`, $options: 'i' } }] }
            : { marcaId: new mongoose.Types.ObjectId(marcaId) });
    }
    if (marca) query.marca = { $regex: `^${escapeRegex(marca)}$`, $options: 'i' };
    if (search) {
        const regex = { $regex: escapeRegex(search), $options: 'i' };
        condicoes.push({ $or: [
            { marca: regex },
            { modelo: regex },
            { codigoFipe: regex },
            { cor: regex },
            { status: regex },
            { cidade: regex },
            { estado: regex },
            { concessionaria: regex },
            { nomeContato: regex },
            { operador: regex },
            { opcionais: regex },
        ] });
    }
    if (condicoes.length === 1) Object.assign(query, condicoes[0]);
    if (condicoes.length > 1) query.$and = condicoes;
    return query;
}

/** Ordem da lista; o _id no fim deixa a paginação estável entre páginas. */
export const ORDEM_DO_CATALOGO = { marca: 1, modelo: 1, cor: 1, anoModelo: -1, _id: 1 } as const;
