import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import Concessionaria from '@/models/Concessionaria';
import VehicleVariation from '@/models/VehicleVariation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

const ADMIN_PROFILES = new Set(['admin', 'administrador', 'gerente', 'operador', 'operator', 'administrativo']);
const DEALERSHIP_PROFILES = new Set(['concessionaria', 'dealership']);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveConcessionaria(session: any, request: Request) {
    const profile = session?.user?.profile;
    const requestedId = (new URL(request.url).searchParams.get('concessionariaId') || '').trim();

    if (profile && ADMIN_PROFILES.has(profile) && requestedId) {
        if (!mongoose.Types.ObjectId.isValid(requestedId)) return null;
        return Concessionaria.findById(requestedId);
    }

    if (profile && DEALERSHIP_PROFILES.has(profile)) {
        const user = await User.findOne({ email: session.user.email }).select('dealershipId');
        if (!user?.dealershipId) return null;
        return Concessionaria.findById(user.dealershipId);
    }

    return null;
}

function buildBrandMatch(concessionaria: any) {
    const orConditions = [];

    if (concessionaria?.marcaIds && concessionaria.marcaIds.length > 0) {
        orConditions.push({ marcaId: { $in: concessionaria.marcaIds } });
    } else if (concessionaria?.marcaId) {
        orConditions.push({ marcaId: concessionaria.marcaId });
    }

    if (concessionaria?.marcas && concessionaria.marcas.length > 0) {
        const regexList = concessionaria.marcas.map((m: string) => new RegExp(`^${escapeRegex(m)}$`, 'i'));
        orConditions.push({ marca: { $in: regexList } });
    } else if (concessionaria?.marca) {
        orConditions.push({ marca: { $regex: `^${escapeRegex(concessionaria.marca)}$`, $options: 'i' } });
    }

    if (orConditions.length > 0) {
        return { $or: orConditions };
    }
    return null;
}

function normalizeText(text: string | undefined | null) {
    if (!text) return '';
    return text.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseAno(anoStr: string) {
    if (!anoStr) return { anoFabricacao: undefined, anoModelo: undefined };
    const parts = anoStr.split('/');
    if (parts.length === 2) {
        const p0 = parseInt(parts[0]);
        const p1 = parseInt(parts[1]);
        return { 
            anoFabricacao: p0 < 100 ? 2000 + p0 : p0, 
            anoModelo: p1 < 100 ? 2000 + p1 : p1 
        };
    }
    const year = parseInt(anoStr);
    return { anoFabricacao: undefined, anoModelo: year < 100 ? 2000 + year : year };
}

export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const concessionaria = await resolveConcessionaria(session, request);
        if (!concessionaria) {
            return NextResponse.json({ error: 'Concessionária não encontrada ou acesso não permitido' }, { status: 403 });
        }
        const concessionariaId = concessionaria._id;

        const body = await request.json();
        const items = body.items; // Array of items from CSV
        const updates = body.updates; // Array of { variationId, preco } for mass deactivation

        // Handle mass deactivation by variationId (e.g., "Zerar Selecionados")
        if (Array.isArray(updates) && updates.length > 0) {
            const validUpdates = updates.filter(
                (u: { variationId?: string }) => !!u?.variationId && mongoose.Types.ObjectId.isValid(u.variationId)
            );

            if (validUpdates.length === 0) {
                return NextResponse.json({ error: 'Nenhum veículo válido informado' }, { status: 400 });
            }

            const bulkOps = validUpdates.map((u: { variationId: string; preco: number }) => {
                const ativo = typeof u.preco === 'number' && u.preco > 0;
                const $set: any = {
                    preco: ativo ? u.preco : null,
                    ativo,
                    updatedAt: new Date(),
                };
                if (!ativo) {
                    $set.quantidade = 0;
                    $set.prazo = null;
                }
                return {
                    updateOne: {
                        filter: {
                            concessionariaId,
                            variationId: new mongoose.Types.ObjectId(u.variationId),
                        },
                        update: { $set },
                        upsert: false,
                    },
                };
            });

            const result = await DealerVehiclePrice.bulkWrite(bulkOps);

            return NextResponse.json({
                success: true,
                matched: result.matchedCount,
                modified: result.modifiedCount,
                message: `${result.modifiedCount} veículos inativados com sucesso.`,
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'Nenhuma atualização enviada' }, { status: 400 });
        }

        // 1. Group items by identity
        const groupedMap = new Map();
        for (const item of items) {
            const key = `${normalizeText(item.marca)}|${normalizeText(item.modelo)}|${normalizeText(item.ano)}|${normalizeText(item.cor)}|${normalizeText(item.combustivel)}|${normalizeText(item.transmissao)}|${normalizeText(item.opcionais)}`;
            if (!groupedMap.has(key)) {
                groupedMap.set(key, { ...item, quantidade: 0 });
            }
            groupedMap.get(key).quantidade += 1;
        }

        const groupedItems = Array.from(groupedMap.values());

        // 2. Fetch all variations for the brand
        const brandMatch = buildBrandMatch(concessionaria);
        if (!brandMatch) {
            return NextResponse.json({ error: 'Concessionária sem marca vinculada' }, { status: 400 });
        }

        const matchQuery: any = { ativo: true };
        if (brandMatch.$or) {
            matchQuery.$or = brandMatch.$or;
        } else {
            Object.assign(matchQuery, brandMatch);
        }

        const allVariations = await VehicleVariation.find(matchQuery).lean();

        // 3. Match items
        const successes: any[] = [];
        const errors: any[] = [];
        const bulkOps: any[] = [];

        for (const item of groupedItems) {
            const { anoFabricacao, anoModelo } = parseAno(item.ano);
            
            const matched = allVariations.find(v => {
                const modeloMatch = normalizeText(v.modelo) === normalizeText(item.modelo);
                const corMatch = normalizeText(v.cor) === normalizeText(item.cor);
                const transMatch = normalizeText(v.transmissao) === normalizeText(item.transmissao);
                const combMatch = normalizeText(v.combustivel) === normalizeText(item.combustivel);
                const opcMatch = normalizeText(v.opcionais) === normalizeText(item.opcionais);
                
                let anoMatch = false;
                if (anoFabricacao && anoModelo) {
                    anoMatch = v.anoFabricacao === anoFabricacao && v.anoModelo === anoModelo;
                } else if (anoModelo) {
                    anoMatch = v.anoModelo === anoModelo;
                } else {
                    anoMatch = true; 
                }
                
                return modeloMatch && corMatch && transMatch && combMatch && opcMatch && anoMatch;
            });

            if (matched) {
                const precoNumber = item.preco;
                const ativo = precoNumber && typeof precoNumber === 'number' && precoNumber > 0;
                
                bulkOps.push({
                    updateOne: {
                        filter: {
                            concessionariaId,
                            variationId: matched._id
                        },
                        update: {
                            $set: {
                                preco: precoNumber > 0 ? precoNumber : null,
                                ativo: ativo,
                                quantidade: ativo ? item.quantidade : 0,
                                statusVeiculo: item.statusVeiculo || 'A faturar',
                                observacoes: item.observacoes || null,
                                frete: item.frete > 0 ? item.frete : null,
                                updatedAt: new Date(),
                                ...(ativo ? {} : { prazo: null })
                            }
                        },
                        upsert: true
                    }
                });
                successes.push({ item, matchedId: matched._id });
            } else {
                errors.push({
                    item,
                    message: "Não encontrado no catálogo."
                });
            }
        }

        if (bulkOps.length > 0) {
            await DealerVehiclePrice.bulkWrite(bulkOps);
        }

        return NextResponse.json({ 
            success: true, 
            message: `Atualizados ${bulkOps.length} registros com sucesso.`,
            report: {
                successes,
                errors
            }
        });

    } catch (error: any) {
        console.error('Erro no bulk update:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
