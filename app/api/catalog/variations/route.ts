import { findOrCreateMarca } from '@/lib/services/marcaResolver';
import { catalogFipeIdentity } from '@/lib/services/catalogFipeIdentity';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Marca from '@/models/Marca';
import VehicleVariation from '@/models/VehicleVariation';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import { lerAnoTexto, rotuloAno as rotuloDoAno, textoDoAno } from '@/lib/utils/anoVeiculo';
import { filtroDoCatalogo, ORDEM_DO_CATALOGO } from '@/lib/services/catalogoFiltro';
import { PERFIS_CATALOGO } from '@/lib/utils/permissoesCatalogo';
import mongoose from 'mongoose';
import { acrescentarOpcionais } from '@/lib/utils/opcionaisCatalogo';

const MASTER_CATALOG_PROFILES = PERFIS_CATALOGO;

// Edição em massa grava variação por variação.
export const maxDuration = 60;

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function parseNumber(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const normalized = normalizeText(value).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseYear(value: string) {
    const digits = value.replace(/\D/g, '');
    if (!digits) return undefined;
    const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits.slice(0, 4));
    return Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : undefined;
}

function parseAnoComposto(value: string) {
    const parts = value.split(/[/-]/).map(part => parseYear(part)).filter((year): year is number => Boolean(year));
    if (parts.length >= 2) {
        return {
            anoFabricacao: parts[0],
            anoModelo: parts[1],
        };
    }

    const year = parseYear(value);
    return {
        anoFabricacao: undefined,
        anoModelo: year,
    };
}

function parseOptionals(value: string) {
    if (!value.trim()) return [];
    return value
        .split(/[|;]/)
        .map(option => option.trim())
        .filter(Boolean);
}

function serializeVariation(doc: any) {
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        ...obj,
        id: obj._id?.toString(),
        _id: undefined,
        marcaId: obj.marcaId?.toString?.() || obj.marcaId,
    };
}

async function assertCanManageCatalog() {
    const session = await getServerSession(authOptions);
    const profile = session?.user?.profile;

    if (!session) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    if (!profile || !MASTER_CATALOG_PROFILES.has(profile)) {
        return { error: NextResponse.json({ error: 'Acesso negado ao catálogo' }, { status: 403 }) };
    }

    return { session };
}

async function resolveMarca(marcaId?: string, marcaName?: string) {
    if (marcaId) {
        const marca = await Marca.findById(marcaId);
        if (!marca) throw new Error('Marca não encontrada');
        return marca;
    }

    const nome = normalizeText(marcaName);
    if (!nome) throw new Error('Marca é obrigatória');

    return findOrCreateMarca(nome);
}

export async function GET(request: Request) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
        const skip = (page - 1) * limit;
        const query = await filtroDoCatalogo(searchParams);

        const [data, total] = await Promise.all([
            VehicleVariation.find(query)
                .sort(ORDEM_DO_CATALOGO)
                .skip(skip)
                .limit(limit),
            VehicleVariation.countDocuments(query),
        ]);

        return NextResponse.json({
            data: data.map(serializeVariation),
            total,
            page,
            totalPages: Math.ceil(total / limit),
            hasNextPage: skip + data.length < total,
        });
    } catch (error: any) {
        console.error('Erro ao buscar catálogo:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();

        const body = await request.json();
        const modelo = normalizeText(body.modelo);
        const marca = await resolveMarca(normalizeText(body.marcaId), body.marca);
        const anoComposto = parseAnoComposto(normalizeText(body.ano));

        if (!modelo) {
            return NextResponse.json({ error: 'Modelo é obrigatório' }, { status: 400 });
        }

        const anoModelo = parseNumber(body.anoModelo) || anoComposto.anoModelo;
        const anoFabricacao = parseNumber(body.anoFabricacao) || anoComposto.anoFabricacao;
        const identity = catalogFipeIdentity({ ...body, anoModelo, anoFabricacao });
        if (identity) {
            const existing = await VehicleVariation.findOne(identity);
            if (existing) return NextResponse.json({ error: 'Já existe uma variação com este código FIPE, ano, combustível, cor e opcionais. Use o cadastro existente.', existingId: existing._id.toString() }, { status: 409 });
        }
        const variation = await VehicleVariation.create({
            marcaId: marca._id,
            marca: marca.nome,
            modelo,
            codigoFipe: normalizeText(body.codigoFipe) || undefined,
            descricaoFipe: normalizeText(body.descricaoFipe) || undefined,
            // Sem tipo explícito, herda o da marca (HONDA MOTOS → moto).
            tipoVeiculo: normalizeText(body.tipoVeiculo) || (marca as any)?.tipoVeiculo || 'carro',
            // Texto do ano sempre a partir dos números (ver lib/utils/anoVeiculo.ts).
            ano: textoDoAno(anoFabricacao, anoModelo) || normalizeText(body.ano) || undefined,
            anoModelo,
            anoFabricacao,
            combustivel: normalizeText(body.combustivel) || undefined,
            cor: normalizeText(body.cor) || undefined,
            transmissao: normalizeText(body.transmissao) || undefined,
            motor: normalizeText(body.motor) || undefined,
            carroceria: normalizeText(body.carroceria) || undefined,
            portas: parseNumber(body.portas),
            cilindrada: parseNumber(body.cilindrada),
            opcionais: normalizeText(body.opcionais) || undefined,
            opcionaisPadrao: Array.isArray(body.opcionaisPadrao)
                ? body.opcionaisPadrao
                : parseOptionals(normalizeText(body.opcionais)),
            preco: parseNumber(body.preco),
            status: normalizeText(body.status) || undefined,
            observacoes: normalizeText(body.observacoes) || undefined,
            cidade: normalizeText(body.cidade) || undefined,
            estado: normalizeText(body.estado) || undefined,
            frete: parseNumber(body.frete),
            telefone: normalizeText(body.telefone) || undefined,
            concessionaria: normalizeText(body.concessionaria) || undefined,
            nomeContato: normalizeText(body.nomeContato) || undefined,
            operador: normalizeText(body.operador) || undefined,
            imagemUrl: normalizeText(body.imagemUrl) || undefined,
            ativo: body.ativo !== false,
            createdBy: access.session?.user?.email || undefined,
        });

        return NextResponse.json(serializeVariation(variation), { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar variação:', error);
        const status = error?.code === 11000 ? 409 : 500;
        return NextResponse.json({
            error: status === 409 ? 'Já existe uma variação idêntica (mesma marca, modelo, ano, combustível, cor, câmbio e opcionais)' : (error.message || 'Erro interno'),
        }, { status });
    }
}

export async function DELETE(request: Request) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();

        const body = await request.json();
        const { ids } = body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'Nenhum ID fornecido' }, { status: 400 });
        }

        const result = await VehicleVariation.updateMany(
            { _id: { $in: ids } },
            { $set: { ativo: false } }
        );

        // Desativa os preços das concessionárias vinculados às variações removidas
        await DealerVehiclePrice.updateMany(
            { variationId: { $in: ids }, ativo: true },
            { $set: { ativo: false, quantidade: 0 } }
        );

        return NextResponse.json({
            success: true, 
            message: `${result.modifiedCount} variações excluídas com sucesso` 
        });
    } catch (error: any) {
        console.error('Erro ao excluir variações em massa:', error);
        return NextResponse.json({ error: error.message || 'Erro interno ao excluir variações' }, { status: 500 });
    }
}

/* ── Edição em massa ── */

const CAMPOS_EM_MASSA = ['modelo', 'ano', 'combustivel', 'transmissao', 'opcionais'] as const;

/** Mesmas chaves do índice único das variações ativas. */
function chaveUnica(v: Record<string, any>) {
    const valor = (campo: string) => (v[campo] === undefined ? null : v[campo]);
    return {
        marca: v.marca,
        modelo: v.modelo,
        anoFabricacao: valor('anoFabricacao'),
        anoModelo: valor('anoModelo'),
        combustivel: valor('combustivel'),
        cor: valor('cor'),
        transmissao: valor('transmissao'),
        opcionais: valor('opcionais'),
    };
}

/**
 * Altera os mesmos campos em várias variações de uma vez. A variação que
 * ficaria igual a outra já cadastrada não é alterada e volta na lista de
 * ignoradas, com o motivo, para a equipe decidir (unificar ou excluir).
 */
export async function PATCH(request: Request) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();
        const body = await request.json().catch(() => ({}));

        const ids: string[] = Array.isArray(body?.ids)
            ? [...new Set<string>(body.ids.filter((id: unknown): id is string => typeof id === 'string' && mongoose.isValidObjectId(id)))]
            : [];
        if (ids.length === 0) return NextResponse.json({ error: 'Selecione ao menos uma variação.' }, { status: 400 });
        if (ids.length > 500) return NextResponse.json({ error: 'Edite até 500 variações por vez.' }, { status: 400 });

        const campos = body?.campos && typeof body.campos === 'object' ? body.campos : {};
        const mudar: Partial<Record<(typeof CAMPOS_EM_MASSA)[number], string>> = {};
        for (const campo of CAMPOS_EM_MASSA) {
            if (Object.prototype.hasOwnProperty.call(campos, campo)) mudar[campo] = normalizeText(campos[campo]);
        }
        if (Object.keys(mudar).length === 0) return NextResponse.json({ error: 'Marque ao menos um campo para alterar.' }, { status: 400 });
        if (mudar.modelo !== undefined && !mudar.modelo) return NextResponse.json({ error: 'O modelo não pode ficar vazio.' }, { status: 400 });

        let anoNovo: { anoFabricacao: number | null; anoModelo: number } | null = null;
        if (mudar.ano !== undefined) {
            const lido = lerAnoTexto(mudar.ano);
            if (!lido.anoModelo) return NextResponse.json({ error: 'Ano inválido. Use 26/27 ou 2027.' }, { status: 400 });
            anoNovo = { anoFabricacao: lido.anoFabricacao ?? null, anoModelo: lido.anoModelo };
        }
        const acrescentar = mudar.opcionais !== undefined && body?.opcionaisModo === 'acrescentar';
        if (acrescentar && !mudar.opcionais) return NextResponse.json({ error: 'Informe o opcional que vai ser acrescentado.' }, { status: 400 });

        const variacoes = await VehicleVariation.find({ _id: { $in: ids } }).lean();
        const nome = (v: any) => [v.marca, v.modelo, rotuloDoAno(v), v.cor].filter(Boolean).join(' · ');

        const planos = variacoes.map(v => {
            const set: Record<string, any> = {};
            const unset: Record<string, ''> = {};
            const texto = (campo: 'modelo' | 'combustivel' | 'transmissao', valor: string) => {
                if (valor) set[campo] = valor; else unset[campo] = '';
            };
            if (mudar.modelo !== undefined) texto('modelo', mudar.modelo);
            if (mudar.combustivel !== undefined) texto('combustivel', mudar.combustivel);
            if (mudar.transmissao !== undefined) texto('transmissao', mudar.transmissao);
            if (anoNovo) {
                set.anoModelo = anoNovo.anoModelo;
                set.anoFabricacao = anoNovo.anoFabricacao;
                set.ano = textoDoAno(anoNovo.anoFabricacao, anoNovo.anoModelo);
            }
            if (mudar.opcionais !== undefined && acrescentar) {
                const resultado = acrescentarOpcionais(v, mudar.opcionais);
                if (resultado.mudou) {
                    set.opcionais = resultado.opcionais;
                    set.opcionaisPadrao = resultado.padrao;
                }
            } else if (mudar.opcionais !== undefined) {
                if (mudar.opcionais) set.opcionais = mudar.opcionais; else unset.opcionais = '';
                set.opcionaisPadrao = parseOptionals(mudar.opcionais);
            }
            const final: Record<string, any> = { ...v, ...set };
            for (const campo of Object.keys(unset)) delete final[campo];
            return { v, set, unset, final };
        });

        // A identidade FIPE só muda com ano, combustível, câmbio ou opcionais. Trocar só o
        // nome do modelo não deve esbarrar numa duplicata FIPE antiga.
        const mexeNaIdentidadeFipe = ['ano', 'combustivel', 'transmissao', 'opcionais'].some(campo => mudar[campo as keyof typeof mudar] !== undefined);
        const ignoradas: Array<{ id: string; nome: string; motivo: string }> = [];
        let atualizadas = 0;
        let pendentes = planos;

        // Duas passadas: uma variação pode liberar a combinação que outra da seleção vai ocupar.
        for (let passada = 0; passada < 2 && pendentes.length; passada += 1) {
            const proximas: typeof planos = [];
            for (const plano of pendentes) {
                const id = String(plano.v._id);
                const ultima = passada === 1;
                if (plano.v.ativo) {
                    const igual = await VehicleVariation.findOne({ _id: { $ne: plano.v._id }, ativo: true, ...chaveUnica(plano.final) }).select('_id').lean();
                    const identidade = mexeNaIdentidadeFipe ? catalogFipeIdentity(plano.final) : null;
                    const mesmaFipe = !igual && identidade
                        ? await VehicleVariation.findOne({ ...identidade, _id: { $ne: plano.v._id } }).select('_id').lean()
                        : null;
                    if (igual || mesmaFipe) {
                        if (ultima) ignoradas.push({ id, nome: nome(plano.v), motivo: igual ? 'Ficaria igual a outra variação já cadastrada.' : 'Já existe outra variação com o mesmo código FIPE e ano.' });
                        else proximas.push(plano);
                        continue;
                    }
                }
                try {
                    const update: Record<string, any> = {};
                    if (Object.keys(plano.set).length) update.$set = plano.set;
                    if (Object.keys(plano.unset).length) update.$unset = plano.unset;
                    // Nada a mudar (ex.: o opcional acrescentado já estava lá).
                    if (Object.keys(update).length === 0) continue;
                    await VehicleVariation.updateOne({ _id: plano.v._id }, update);
                    atualizadas += 1;
                } catch (error: any) {
                    if (error?.code !== 11000) throw error;
                    if (ultima) ignoradas.push({ id, nome: nome(plano.v), motivo: 'Ficaria igual a outra variação já cadastrada.' });
                    else proximas.push(plano);
                }
            }
            pendentes = proximas;
        }

        const naoEncontradas = ids.length - variacoes.length;
        return NextResponse.json({ atualizadas, ignoradas, naoEncontradas });
    } catch (error: any) {
        console.error('Erro na edição em massa do catálogo:', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
