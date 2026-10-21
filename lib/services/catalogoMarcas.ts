import mongoose from 'mongoose';
import Marca from '@/models/Marca';
import VehicleVariation from '@/models/VehicleVariation';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import Concessionaria from '@/models/Concessionaria';
import RepasseVehicle from '@/models/RepasseVehicle';
import Vehicle from '@/models/Vehicle';
import Favorito from '@/models/Favorito';
import FavoritoVeiculo from '@/models/FavoritoVeiculo';
import { marcasParecidas, pareceData } from '@/lib/utils/marcasCatalogo';

/**
 * Manutenção das marcas do catálogo: unificar as repetidas ("GM" em
 * "GM - Chevrolet"), renomear e excluir as que sobraram sem uso.
 *
 * A marca aparece em dois formatos: o id (variações novas e concessionárias)
 * e o nome solto (variações antigas, repasse, favoritos por modelo). Toda
 * operação aqui atualiza os dois, senão a marca "some" de uma tela e continua
 * em outra.
 */

export class ErroMarca extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mesmoNome = (nome: string) => ({ $regex: `^${escapeRegex(nome.trim())}$`, $options: 'i' });

type MarcaDoc = { _id: mongoose.Types.ObjectId; nome: string };

/** Variações da marca: pelo id e, nas antigas que não têm id, pelo nome. */
function filtroDaMarca(marca: MarcaDoc) {
    return { $or: [{ marcaId: marca._id }, { marcaId: null, marca: mesmoNome(marca.nome) }] };
}

/** Campos do índice único das variações ativas (ausente e null contam igual). */
function chaveUnica(v: Record<string, any>, marca: string) {
    const valor = (campo: string) => (v[campo] === undefined ? null : v[campo]);
    return {
        marca,
        modelo: v.modelo,
        anoFabricacao: valor('anoFabricacao'),
        anoModelo: valor('anoModelo'),
        combustivel: valor('combustivel'),
        cor: valor('cor'),
        transmissao: valor('transmissao'),
        opcionais: valor('opcionais'),
    };
}

const semIndefinidos = (obj: Record<string, unknown>) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const ehDuplicidade = (error: any) => error?.code === 11000;

/* ── Resumo para a tela ── */

export interface ResumoMarca {
    id: string;
    nome: string;
    tipoVeiculo: string;
    variacoes: number;
    ofertas: number;
    lojas: number;
    pareceData: boolean;
    parecidas: Array<{ id: string; nome: string }>;
}

export async function resumoDasMarcas(): Promise<ResumoMarca[]> {
    const [marcas, variacoes, ofertas, lojas] = await Promise.all([
        Marca.find().sort({ nome: 1 }).select('nome tipoVeiculo').lean(),
        VehicleVariation.aggregate([
            { $match: { ativo: true } },
            { $group: { _id: { id: '$marcaId', nome: { $toUpper: '$marca' } }, total: { $sum: 1 } } },
        ]),
        DealerVehiclePrice.aggregate([
            { $match: { ativo: true } },
            { $lookup: { from: VehicleVariation.collection.name, localField: 'variationId', foreignField: '_id', as: 'v' } },
            { $unwind: '$v' },
            { $match: { 'v.ativo': true } },
            { $group: { _id: { id: '$v.marcaId', nome: { $toUpper: '$v.marca' } }, total: { $sum: 1 } } },
        ]),
        Concessionaria.find({}).select('marcaId marcaIds').lean(),
    ]);

    const idPorNome = new Map(marcas.map(m => [m.nome.trim().toUpperCase(), String(m._id)]));
    const somar = (linhas: Array<{ _id: { id?: unknown; nome?: string }; total: number }>) => {
        const porMarca = new Map<string, number>();
        for (const linha of linhas) {
            const id = linha._id.id ? String(linha._id.id) : idPorNome.get((linha._id.nome || '').trim());
            if (!id) continue;
            porMarca.set(id, (porMarca.get(id) || 0) + linha.total);
        }
        return porMarca;
    };
    const variacoesPorMarca = somar(variacoes);
    const ofertasPorMarca = somar(ofertas);

    const lojasPorMarca = new Map<string, number>();
    for (const loja of lojas as Array<{ marcaId?: unknown; marcaIds?: unknown[] }>) {
        const ids = new Set([...(loja.marcaIds || []), loja.marcaId].filter(Boolean).map(String));
        for (const id of ids) lojasPorMarca.set(id, (lojasPorMarca.get(id) || 0) + 1);
    }

    const parecidas = marcasParecidas(marcas.map(m => ({ id: String(m._id), nome: m.nome })));

    return marcas.map(m => {
        const id = String(m._id);
        return {
            id,
            nome: m.nome,
            tipoVeiculo: m.tipoVeiculo || 'carro',
            variacoes: variacoesPorMarca.get(id) || 0,
            ofertas: ofertasPorMarca.get(id) || 0,
            lojas: lojasPorMarca.get(id) || 0,
            pareceData: pareceData(m.nome),
            parecidas: (parecidas.get(id) || []).map(p => ({ id: p.id, nome: p.nome })),
        };
    });
}

/* ── Peças reaproveitadas ── */

/** Favoritos por oferta que apontavam para um anúncio apagado passam para o que ficou. */
async function remapearFavoritos(de: string, para: string) {
    const favoritos = await FavoritoVeiculo.find({ veiculoId: de }).select('_id').lean();
    for (const favorito of favoritos) {
        try {
            await FavoritoVeiculo.updateOne({ _id: favorito._id }, { $set: { veiculoId: para } });
        } catch (error) {
            // A pessoa já favoritava o anúncio que ficou: o repetido sai.
            if (!ehDuplicidade(error)) throw error;
            await FavoritoVeiculo.deleteOne({ _id: favorito._id });
        }
    }
}

/**
 * Leva os anúncios das concessionárias de uma variação para outra. Se a loja
 * já anunciava as duas, junta num anúncio só: soma as unidades ativas e fica
 * com preço, prazo e observação do anúncio mexido por último.
 */
export async function moverOfertas(origemId: mongoose.Types.ObjectId, destinoId: mongoose.Types.ObjectId) {
    const resultado = { movidas: 0, juntadas: 0 };
    const ofertas = await DealerVehiclePrice.find({ variationId: origemId }).lean();

    for (const oferta of ofertas) {
        const existente = await DealerVehiclePrice.findOne({ variationId: destinoId, concessionariaId: oferta.concessionariaId }).lean();
        if (!existente) {
            // Sem mexer no updatedAt: a data de atualização do Estoque é da loja.
            await DealerVehiclePrice.collection.updateOne({ _id: oferta._id }, { $set: { variationId: destinoId } });
            resultado.movidas += 1;
            continue;
        }

        const ativas = [oferta, existente].filter(o => o.ativo);
        const base = [...(ativas.length ? ativas : [oferta, existente])]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
        const unidades = ativas.reduce((soma, o) => soma + (o.quantidade || 0), 0);
        const ativo = ativas.length > 0;

        await DealerVehiclePrice.collection.updateOne({ _id: existente._id }, {
            $set: semIndefinidos({
                preco: base.preco ?? null,
                frete: base.frete ?? null,
                prazo: base.prazo ?? null,
                observacoes: base.observacoes,
                statusVeiculo: base.statusVeiculo,
                operador: base.operador,
                coresDisponiveis: base.coresDisponiveis || [],
                ativo,
                quantidade: ativo ? Math.max(1, unidades) : 0,
                updatedAt: base.updatedAt,
            }),
        });
        await DealerVehiclePrice.deleteOne({ _id: oferta._id });
        await remapearFavoritos(String(oferta._id), String(existente._id));
        resultado.juntadas += 1;
    }

    return resultado;
}

/** Repasse, estoque legado e favoritos guardam o nome da marca como texto. */
async function trocarNomeNasReferencias(nomeAntigo: string, nomeNovo: string) {
    const filtro = { marca: mesmoNome(nomeAntigo) };
    const [repasse, legado, favoritosPorOferta] = await Promise.all([
        RepasseVehicle.updateMany(filtro, { $set: { marca: nomeNovo } }),
        Vehicle.updateMany(filtro, { $set: { marca: nomeNovo } }),
        FavoritoVeiculo.updateMany(filtro, { $set: { marca: nomeNovo } }),
    ]);

    // Favorito por modelo: o índice é (cliente, marca, modelo). Se o cliente já
    // monitorava o mesmo modelo na outra grafia, o repetido sai.
    let favoritosPorModelo = 0;
    const favoritos = await Favorito.find(filtro).select('_id').lean();
    for (const favorito of favoritos) {
        try {
            await Favorito.updateOne({ _id: favorito._id }, { $set: { marca: nomeNovo } });
        } catch (error) {
            if (!ehDuplicidade(error)) throw error;
            await Favorito.deleteOne({ _id: favorito._id });
        }
        favoritosPorModelo += 1;
    }

    return {
        repasse: repasse.modifiedCount,
        estoqueLegado: legado.modifiedCount,
        favoritos: favoritosPorOferta.modifiedCount + favoritosPorModelo,
    };
}

/** Troca a marca nas concessionárias (id e nome, nos campos novos e nos legados). */
async function trocarMarcaNasLojas(origem: MarcaDoc, destino: MarcaDoc) {
    const origemId = String(origem._id);
    const lojas = await Concessionaria.find({ $or: [{ marcaId: origem._id }, { marcaIds: origem._id }] })
        .select('marcaId marca marcaIds marcas').lean();

    for (const loja of lojas as Array<{ _id: mongoose.Types.ObjectId; marcaId?: unknown; marca?: string; marcaIds?: unknown[]; marcas?: string[] }>) {
        const ids: string[] = [];
        for (const id of (loja.marcaIds || []).map(String)) {
            const novo = id === origemId ? String(destino._id) : id;
            if (!ids.includes(novo)) ids.push(novo);
        }
        const nomes: string[] = [];
        for (const nome of loja.marcas || []) {
            const novo = nome.trim().toUpperCase() === origem.nome.trim().toUpperCase() ? destino.nome : nome;
            if (!nomes.some(n => n.trim().toUpperCase() === novo.trim().toUpperCase())) nomes.push(novo);
        }
        if (ids.includes(String(destino._id)) && !nomes.some(n => n.trim().toUpperCase() === destino.nome.trim().toUpperCase())) {
            nomes.push(destino.nome);
        }

        const set: Record<string, unknown> = {};
        if (loja.marcaIds?.length) {
            set.marcaIds = ids.map(id => new mongoose.Types.ObjectId(id));
            set.marcas = nomes;
        }
        if (String(loja.marcaId) === origemId) {
            set.marcaId = destino._id;
            set.marca = destino.nome;
        }
        if (Object.keys(set).length) await Concessionaria.updateOne({ _id: loja._id }, { $set: set });
    }

    return lojas.length;
}

/* ── Operações da tela ── */

async function carregarMarca(id: string) {
    if (!mongoose.isValidObjectId(id)) throw new ErroMarca('Marca não encontrada', 404);
    const marca = await Marca.findById(id);
    if (!marca) throw new ErroMarca('Marca não encontrada', 404);
    return marca;
}

export interface ResultadoUnificacao {
    origem: string;
    destino: string;
    variacoesMovidas: number;
    variacoesJuntadas: number;
    ofertasMovidas: number;
    ofertasJuntadas: number;
    lojas: number;
    repasse: number;
    favoritos: number;
}

/**
 * Passa tudo da marca de origem para a de destino e apaga a origem. Variação
 * que já existe igual no destino não é duplicada: os anúncios dela vão para a
 * gêmea e ela sai do catálogo.
 */
export async function unificarMarcas(origemId: string, destinoId: string): Promise<ResultadoUnificacao> {
    if (origemId === destinoId) throw new ErroMarca('Escolha uma marca diferente para receber as variações.');
    const [origem, destino] = await Promise.all([carregarMarca(origemId), carregarMarca(destinoId)]);

    const resultado: ResultadoUnificacao = {
        origem: origem.nome, destino: destino.nome,
        variacoesMovidas: 0, variacoesJuntadas: 0, ofertasMovidas: 0, ofertasJuntadas: 0, lojas: 0, repasse: 0, favoritos: 0,
    };

    type Variacao = Record<string, any> & { _id: mongoose.Types.ObjectId };
    const variacoes = await VehicleVariation.find(filtroDaMarca(origem)).lean() as Variacao[];
    const ativasNoDestino = await VehicleVariation.find({ ativo: true, marca: destino.nome }).lean() as Variacao[];
    const chave = (v: Variacao) => JSON.stringify(chaveUnica(v, destino.nome));
    const gemeas = new Map(ativasNoDestino.map(v => [chave(v), v]));

    /** A variação já existe igual no destino: anúncios vão para a gêmea e a repetida sai. */
    const juntar = async (variacao: Variacao, gemea: Variacao) => {
        const ofertas = await moverOfertas(variacao._id, gemea._id);
        resultado.ofertasMovidas += ofertas.movidas;
        resultado.ofertasJuntadas += ofertas.juntadas;
        // A gêmea herda foto e FIPE se não tiver.
        const completar = semIndefinidos({
            imagemUrl: !gemea.imagemUrl && variacao.imagemUrl ? variacao.imagemUrl : undefined,
            codigoFipe: !gemea.codigoFipe && variacao.codigoFipe ? variacao.codigoFipe : undefined,
            descricaoFipe: !gemea.codigoFipe && variacao.codigoFipe ? variacao.descricaoFipe : undefined,
        });
        if (Object.keys(completar).length) {
            await VehicleVariation.updateOne({ _id: gemea._id }, { $set: completar });
            Object.assign(gemea, completar);
        }
        await VehicleVariation.updateOne({ _id: variacao._id }, { $set: { ativo: false, marcaId: destino._id, marca: destino.nome } });
        resultado.variacoesJuntadas += 1;
    };

    const mover: Variacao[] = [];
    for (const variacao of variacoes) {
        const gemea = variacao.ativo ? gemeas.get(chave(variacao)) : undefined;
        if (gemea && String(gemea._id) !== String(variacao._id)) await juntar(variacao, gemea);
        else mover.push(variacao);
    }

    if (mover.length) {
        try {
            await VehicleVariation.bulkWrite(mover.map(v => ({
                updateOne: { filter: { _id: v._id }, update: { $set: { marcaId: destino._id, marca: destino.nome } } },
            })), { ordered: false });
        } catch (error: any) {
            // Só aceita colisão no índice único (gêmea criada no meio do caminho); o resto foi gravado.
            if (!ehDuplicidade(error) && !String(error?.message || '').includes('E11000')) throw error;
        }
        const pendentes = await VehicleVariation.find({ _id: { $in: mover.map(v => v._id) }, marcaId: { $ne: destino._id } }).lean() as Variacao[];
        for (const pendente of pendentes) {
            const gemea = await VehicleVariation.findOne({ _id: { $ne: pendente._id }, ativo: true, ...chaveUnica(pendente, destino.nome) }).lean() as Variacao | null;
            if (!gemea) throw new ErroMarca(`Não foi possível mover ${pendente.modelo}. Tente de novo.`, 500);
            await juntar(pendente, gemea);
        }
        resultado.variacoesMovidas = mover.length - pendentes.length;
    }

    resultado.lojas = await trocarMarcaNasLojas(origem, destino);
    const referencias = await trocarNomeNasReferencias(origem.nome, destino.nome);
    resultado.repasse = referencias.repasse;
    resultado.favoritos = referencias.favoritos;

    await Marca.deleteOne({ _id: origem._id });
    return resultado;
}

export async function renomearMarca(id: string, dados: { nome?: unknown; tipoVeiculo?: unknown }) {
    const marca = await carregarMarca(id);
    const nome = typeof dados.nome === 'string' ? dados.nome.trim().replace(/\s+/g, ' ') : marca.nome;
    const tipo = typeof dados.tipoVeiculo === 'string' && dados.tipoVeiculo ? dados.tipoVeiculo : marca.tipoVeiculo;

    if (!nome) throw new ErroMarca('Informe o nome da marca.');
    if (nome.length > 60) throw new ErroMarca('Use até 60 caracteres no nome da marca.');
    if (pareceData(nome)) throw new ErroMarca('O nome parece uma data ou um número. Use o nome da marca.');
    if (!['carro', 'moto', 'caminhao', 'utilitario'].includes(tipo)) throw new ErroMarca('Tipo inválido.');

    const outra = await Marca.findOne({ _id: { $ne: marca._id }, nome: mesmoNome(nome) }).lean();
    if (outra) throw new ErroMarca(`Já existe a marca ${outra.nome}. Use Unificar para juntar as duas.`, 409);

    const nomeAntigo = marca.nome;
    marca.nome = nome;
    marca.tipoVeiculo = tipo as typeof marca.tipoVeiculo;
    await marca.save();

    const resultado = { nome, variacoes: 0, conflitos: 0, lojas: 0, repasse: 0, favoritos: 0 };
    if (nome === nomeAntigo) return resultado;

    const variacoes = await VehicleVariation.find(filtroDaMarca({ _id: marca._id, nome: nomeAntigo })).select('_id').lean();
    for (const variacao of variacoes) {
        try {
            await VehicleVariation.updateOne({ _id: variacao._id }, { $set: { marca: nome, marcaId: marca._id } });
            resultado.variacoes += 1;
        } catch (error) {
            // Variação antiga, sem marca vinculada, já usava o nome novo: fica como está.
            if (!ehDuplicidade(error)) throw error;
            resultado.conflitos += 1;
        }
    }

    const lojas = await Concessionaria.find({ $or: [{ marcaId: marca._id }, { marcaIds: marca._id }] }).select('marcaId marcas').lean();
    for (const loja of lojas as Array<{ _id: mongoose.Types.ObjectId; marcaId?: unknown; marcas?: string[] }>) {
        const set: Record<string, unknown> = {};
        if (String(loja.marcaId) === id) set.marca = nome;
        if (loja.marcas?.length) set.marcas = loja.marcas.map(n => (n.trim().toUpperCase() === nomeAntigo.trim().toUpperCase() ? nome : n));
        if (Object.keys(set).length) await Concessionaria.updateOne({ _id: loja._id }, { $set: set });
    }
    resultado.lojas = lojas.length;

    const referencias = await trocarNomeNasReferencias(nomeAntigo, nome);
    resultado.repasse = referencias.repasse;
    resultado.favoritos = referencias.favoritos;
    return resultado;
}

/** Só sai a marca sem variação ativa e sem concessionária vinculada. */
export async function excluirMarca(id: string) {
    const marca = await carregarMarca(id);
    const [variacoes, lojas] = await Promise.all([
        VehicleVariation.countDocuments({ ...filtroDaMarca(marca), ativo: true }),
        Concessionaria.countDocuments({ $or: [{ marcaId: marca._id }, { marcaIds: marca._id }] }),
    ]);
    if (variacoes > 0) {
        throw new ErroMarca(`${marca.nome} tem ${variacoes} ${variacoes === 1 ? 'variação ativa' : 'variações ativas'}. Unifique com outra marca para não perder o catálogo.`, 409);
    }
    if (lojas > 0) {
        throw new ErroMarca(`${marca.nome} está vinculada a ${lojas} ${lojas === 1 ? 'concessionária' : 'concessionárias'}. Unifique com outra marca ou desvincule antes.`, 409);
    }
    await Marca.deleteOne({ _id: marca._id });
    return { nome: marca.nome };
}
