import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Vehicle from '@/models/Vehicle';
import User from '@/models/User';
import Concessionaria from '@/models/Concessionaria';
import Modelo from '@/models/Modelo';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { searchParams } = new URL(request.url);

        // Check for dealership restriction
        let restrictedDealershipName: string | null = null;
        // @ts-ignore
        if (session.user?.profile === 'concessionaria') {
            const user = await User.findOne({ email: session.user.email });
            if (user && user.dealershipId) {
                const dealership = await Concessionaria.findById(user.dealershipId);
                if (dealership) {
                    restrictedDealershipName = dealership.nome;
                }
            }

            // If logged in as concessionaria but no dealership found/linked, return empty
            if (!restrictedDealershipName) {
                return NextResponse.json({
                    data: [],
                    total: 0,
                    hasNextPage: false,
                    page: 1,
                    totalPages: 0
                });
            }
        }

        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const search = searchParams.get('search') || '';
        const sortKey = searchParams.get('sortKey') || 'dataEntrada';
        const sortDir = searchParams.get('sortDir') === 'asc' ? 1 : -1;
        const semConcessionaria = searchParams.get('semConcessionaria') === 'true';

        const filters: any = {};
        if (searchParams.get('status')) filters.status = searchParams.get('status');
        if (searchParams.get('combustivel')) filters.combustivel = searchParams.get('combustivel');
        if (searchParams.get('transmissao')) filters.transmissao = searchParams.get('transmissao');
        if (searchParams.get('ano')) filters.ano = searchParams.get('ano');
        if (searchParams.get('modelo')) filters.modelo = searchParams.get('modelo');
        if (searchParams.get('opcionais')) filters.opcionais = searchParams.get('opcionais');
        if (searchParams.get('estado')) filters.estado = searchParams.get('estado');
        if (searchParams.get('cidade')) filters.cidade = searchParams.get('cidade');
        if (searchParams.get('operador')) filters.operador = searchParams.get('operador');
        if (searchParams.get('concessionaria')) filters.concessionaria = searchParams.get('concessionaria');

        // Filtro para veículos sem concessionária
        if (semConcessionaria) {
            filters.semConcessionaria = true;
        }

        // Enforce restriction
        if (restrictedDealershipName) {
            filters.concessionaria = restrictedDealershipName;
        }

        if (searchParams.get('nomeContato')) filters.nomeContato = searchParams.get('nomeContato');

        // Build base query from filters, using regex for cor to allow partial matches
        let query: any = {};
        if (filters.status) query.status = filters.status;
        if (filters.combustivel) query.combustivel = filters.combustivel;
        if (filters.transmissao) query.transmissao = filters.transmissao;
        if (filters.ano) query.ano = filters.ano;
        if (filters.modelo) {
            query.modelo = { $regex: escapeRegex(filters.modelo), $options: 'i' };
        }
        if (filters.estado) {
            query.estado = { $regex: escapeRegex(filters.estado), $options: 'i' };
        }
        if (filters.cidade) {
            query.cidade = { $regex: escapeRegex(filters.cidade), $options: 'i' };
        }

        // Filtro para veículos sem concessionária - tem prioridade sobre filtro de concessionária
        if (filters.semConcessionaria) {
            query.$or = [
                { concessionaria: { $exists: false } },
                { concessionaria: null },
                { concessionaria: '' }
            ];
        } else if (filters.concessionaria) {
            // Só aplica filtro de concessionária se NÃO estiver buscando sem concessionária
            query.concessionaria = { $regex: escapeRegex(filters.concessionaria), $options: 'i' };
        }

        if (filters.nomeContato) {
            query.nomeContato = { $regex: escapeRegex(filters.nomeContato), $options: 'i' };
        }
        if (filters.operador) {
            query.operador = { $regex: escapeRegex(filters.operador), $options: 'i' };
        }
        const corParam = searchParams.get('cor');
        if (corParam) query.cor = { $regex: escapeRegex(corParam), $options: 'i' };
        const opcionaisParam = searchParams.get('opcionais');
        if (opcionaisParam) {
            query.opcionais = { $regex: escapeRegex(opcionaisParam), $options: 'i' };
        }

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            // Se o termo de busca corresponde exatamente a valores de enum conhecidos, aplicar como filtro específico
            const normalized = search.trim().toLowerCase();
            const fuelMap: Record<string, string> = {
                'flex': 'Flex',
                'gasolina': 'Gasolina',
                'etanol': 'Etanol',
                'alcool': 'Etanol',
                'álcool': 'Etanol',
                'diesel': 'Diesel',
                'elétrico': 'Elétrico',
                'eletrico': 'Elétrico',
                'híbrido': 'Híbrido',
                'hibrido': 'Híbrido'
            };
            const transMap: Record<string, string> = {
                'manual': 'Manual',
                'automatico': 'Automático',
                'automático': 'Automático',
                'cvt': 'CVT'
            };
            const statusMap: Record<string, string> = {
                'a faturar': 'A faturar',
                'refaturamento': 'Refaturamento',
                'licenciado': 'Licenciado'
            };

            if (fuelMap[normalized]) {
                query.combustivel = fuelMap[normalized];
            } else if (transMap[normalized]) {
                query.transmissao = transMap[normalized];
            } else if (statusMap[normalized]) {
                query.status = statusMap[normalized];
            }

            const orConditions: any[] = [
                { transmissao: searchRegex },
                { combustivel: searchRegex },
                { cor: searchRegex },
                { ano: searchRegex },
                { opcionais: searchRegex },
                { observacoes: searchRegex },
                { estado: searchRegex }
            ];

            // Only search in model if we are not already filtering by a specific model
            if (!filters.modelo) {
                orConditions.unshift({ modelo: searchRegex });
            }

            query.$or = orConditions;
        }

        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            Vehicle.find(query)
                .populate('modeloId', 'nome marca') // Popula dados do modelo
                .sort({ [sortKey]: sortDir })
                .skip(skip)
                .limit(limit),
            Vehicle.countDocuments(query)
        ]);

        const serializedData = data.map(doc => {
            const obj = doc.toObject();
            const modeloPopulado = obj.modeloId as any;
            
            return {
                ...obj,
                id: obj._id.toString(),
                _id: undefined,
                // Se o modelo foi populado, usar o nome atualizado
                modelo: modeloPopulado?.nome || obj.modelo,
                marca: modeloPopulado?.marca || obj.marca,
                modeloId: modeloPopulado?._id?.toString() || obj.modeloId?.toString()
            };
        });

        return NextResponse.json({
            data: serializedData,
            total,
            hasNextPage: skip + data.length < total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error: any) {
        console.error('Erro ao buscar veículos:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();

        // Buscar o modelo pelo nome para obter o ID
        let modeloId = body.modeloId;
        if (!modeloId && body.modelo) {
            const modeloDoc = await Modelo.findOne({ 
                nome: { $regex: new RegExp(`^${body.modelo.trim()}$`, 'i') }
            });
            if (modeloDoc) {
                modeloId = modeloDoc._id;
                // Também atualizar a marca se o modelo foi encontrado e não foi informada
                if (!body.marca && modeloDoc.marca) {
                    body.marca = modeloDoc.marca;
                }
            }
        }

        // Ensure required fields are present or set defaults
        let dataEntrada = body.dataEntrada;
        if (!dataEntrada) {
            dataEntrada = new Date();
        } else if (typeof dataEntrada === 'string' && dataEntrada.includes('/')) {
            // Handle DD/MM/YYYY format manually if it comes through
            const [dia, mes, ano] = dataEntrada.split('/');
            dataEntrada = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
        }

        const vehicleData = {
            ...body,
            dataEntrada: dataEntrada,
            modeloId: modeloId, // Salvar referência ao modelo
            status: body.status || 'A faturar',
            transmissao: body.transmissao || 'Manual',
            combustivel: body.combustivel || 'Flex',
            preco: body.preco || 0
        };

        // Enforce dealership for concessionaria profile
        // @ts-ignore
        if (session.user?.profile === 'concessionaria') {
            const user = await User.findOne({ email: session.user.email });
            if (user && user.dealershipId) {
                const dealership = await Concessionaria.findById(user.dealershipId);
                if (dealership) {
                    vehicleData.concessionaria = dealership.nome;
                }
            }
        }

        const newVehicle = await Vehicle.create(vehicleData);
        const doc = newVehicle as any;

        return NextResponse.json({
            ...doc.toObject(),
            id: doc._id.toString(),
            _id: undefined
        }, { status: 201 });
    } catch (error: any) {
        console.error('Erro ao criar veículo:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const body = await request.json();

        if (body.action === 'reset_sales_price') {
            await Vehicle.updateMany({}, { $unset: { valorVenda: "" } });
            return NextResponse.json({ message: 'Preços de venda resetados com sucesso' });
        }

        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    } catch (error: any) {
        console.error('Erro na atualização em massa:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
