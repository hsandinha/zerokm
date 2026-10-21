import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import VehicleVariation from '@/models/VehicleVariation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { lerAnoTexto, rotuloAno, textoDoAno } from '@/lib/utils/anoVeiculo';
import User from '@/models/User';

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : typeof valor === 'number' ? String(valor) : '');

/** Campos que são da variação do catálogo, não do preço da loja. */
const CAMPOS_DA_VARIACAO = ['modelo', 'cor', 'combustivel', 'transmissao', 'opcionais'] as const;

/**
 * Edição de modelo, ano, cor, combustível, câmbio ou opcionais na consulta de
 * Veículos. Antes o PUT só olhava preço, quantidade, observações e prazo: a
 * tela aceitava a edição e o servidor descartava, e o carro continuava com o
 * ano errado (o caso do Argo 26/27 que aparecia 26/26).
 *
 * Esses campos são do catálogo mestre, compartilhado por todas as lojas. Mudar
 * a variação aqui mudaria o carro de todo mundo, então o anúncio DESTA loja é
 * movido para a variação certa (a existente ou uma nova, copiada da atual).
 * Para corrigir o carro de todas as lojas, a edição é no Catálogo.
 */
async function variacaoDestino(atual: any, body: any, criadoPor?: string): Promise<{ destino: any | null; erro?: string }> {
    const mudancas: Record<string, any> = {};

    for (const campo of CAMPOS_DA_VARIACAO) {
        if (!Object.prototype.hasOwnProperty.call(body, campo)) continue;
        const novo = texto(body[campo]);
        if (novo !== texto(atual[campo])) mudancas[campo] = novo || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'ano')) {
        const novoAno = texto(body.ano);
        if (novoAno && novoAno !== rotuloAno(atual)) {
            const lido = lerAnoTexto(novoAno);
            if (!lido.anoModelo) return { destino: null, erro: 'Ano inválido. Use o formato 26/27.' };
            mudancas.anoFabricacao = lido.anoFabricacao ?? null;
            mudancas.anoModelo = lido.anoModelo;
        }
    }

    if (Object.keys(mudancas).length === 0) return { destino: null };
    if (mudancas.modelo === null) return { destino: null, erro: 'O modelo não pode ficar vazio.' };

    const alvo = {
        marca: atual.marca,
        modelo: atual.modelo,
        anoFabricacao: atual.anoFabricacao ?? null,
        anoModelo: atual.anoModelo ?? null,
        combustivel: atual.combustivel || null,
        cor: atual.cor || null,
        transmissao: atual.transmissao || null,
        opcionais: atual.opcionais || null,
        ...mudancas,
    };

    // Mesmas chaves do índice único das variações ativas.
    const existente = await VehicleVariation.findOne({ ativo: true, ...alvo });
    if (existente) return { destino: existente };

    const { _id, createdAt, updatedAt, __v, ...copia } = atual;
    const dados = {
        ...copia,
        ...Object.fromEntries(Object.entries(alvo).map(([k, v]) => [k, v ?? undefined])),
        ano: textoDoAno(alvo.anoFabricacao, alvo.anoModelo) || undefined,
        ativo: true,
        createdBy: criadoPor,
    };
    try {
        return { destino: await VehicleVariation.create(dados) };
    } catch (error: any) {
        // Outra edição criou a mesma variação ao mesmo tempo.
        if (error?.code === 11000) return { destino: await VehicleVariation.findOne({ ativo: true, ...alvo }) };
        throw error;
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const allowedProfiles = ['admin', 'administrador', 'administrativo', 'operator', 'operador', 'gerente'];
        const userProfile = session.user?.profile;
        // Concessionária edita os números dos próprios anúncios (Meus veículos).
        const ehConcessionaria = userProfile === 'concessionaria' || userProfile === 'dealership';
        if (!allowedProfiles.includes(userProfile || '') && !ehConcessionaria) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const rawBody = await request.json();

        await connectDB();

        let lojaDoUsuario: string | null = null;
        if (ehConcessionaria) {
            const usuario = await User.findOne({ email: session.user?.email }).select('dealershipId').lean() as any;
            lojaDoUsuario = usuario?.dealershipId ? String(usuario.dealershipId) : null;
            if (!lojaDoUsuario) return NextResponse.json({ error: 'Usuário sem concessionária vinculada' }, { status: 403 });
        }
        // A loja não mexe no catálogo mestre: só preço, quantidade, prazo, observações e status.
        const body = ehConcessionaria
            ? Object.fromEntries(Object.entries(rawBody || {}).filter(([campo]) => ['preco', 'quantidade', 'prazo', 'observacoes', 'status'].includes(campo)))
            : rawBody;

        const updateData: any = {};
        
        if (body.preco !== undefined) {
            const numPreco = Number(body.preco);
            if (numPreco <= 0 || isNaN(numPreco)) {
                updateData.preco = null;
                updateData.ativo = false;
                updateData.quantidade = 0;
            } else {
                updateData.preco = numPreco;
                updateData.ativo = true;
            }
        }

        if (body.quantidade !== undefined) {
            updateData.quantidade = Number(body.quantidade);
        }

        // Status do veículo (A faturar, Licenciado...) e frete também eram
        // aceitos na tela e descartados aqui.
        if (typeof body.status === 'string' && body.status.trim()) {
            updateData.statusVeiculo = body.status.trim();
        }
        if (body.frete !== undefined) {
            const frete = body.frete === null || body.frete === '' ? null : Number(body.frete);
            if (frete !== null && (!Number.isFinite(frete) || frete < 0)) {
                return NextResponse.json({ error: 'Frete inválido' }, { status: 400 });
            }
            updateData.frete = frete;
        }

        if (body.observacoes !== undefined) {
            updateData.observacoes = body.observacoes;
        }

        // Prazo de entrega: 0 = pronta entrega, null limpa o campo. Sem este
        // bloco a edição na Consulta de Veículos era aceita na tela e descartada
        // aqui, porque o PUT só olhava preço, quantidade e observações.
        if (body.prazo !== undefined) {
            const prazo = body.prazo === null || body.prazo === '' ? null : Number(body.prazo);
            if (prazo !== null && (!Number.isFinite(prazo) || prazo < 0)) {
                return NextResponse.json({ error: 'Prazo inválido' }, { status: 400 });
            }
            updateData.prazo = prazo;
        }

        // Preço zerado desativa o registro; manter prazo seria prometer entrega
        // de um veículo que saiu do catálogo.
        if (updateData.ativo === false) {
            updateData.prazo = null;
        }

        const currentDoc = await DealerVehiclePrice.findById(id);
        if (!currentDoc) {
            return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
        }
        if (lojaDoUsuario && String(currentDoc.concessionariaId) !== lojaDoUsuario) {
            return NextResponse.json({ error: 'Este veículo não é da sua concessionária' }, { status: 403 });
        }

        // O frete só muda se mudou de fato: a tela manda o veículo inteiro a
        // cada edição, e o 0 de "sem frete" viraria frete gravado em todo lugar.
        if ('frete' in updateData && (updateData.frete ?? 0) === (currentDoc.frete ?? 0)) {
            delete updateData.frete;
        }

        const variacaoAtual = await VehicleVariation.findById(currentDoc.variationId).lean();
        const { destino, erro } = variacaoAtual
            ? await variacaoDestino(variacaoAtual, body, session.user?.email || undefined)
            : { destino: null, erro: undefined };
        if (erro) {
            return NextResponse.json({ error: erro }, { status: 400 });
        }

        if (destino && String(destino._id) !== String(currentDoc.variationId)) {
            const jaExiste = await DealerVehiclePrice.findOne({
                variationId: destino._id,
                concessionariaId: currentDoc.concessionariaId,
            });

            if (jaExiste) {
                // A loja já anunciava a variação certa: junta as unidades num anúncio só.
                const precoFinal = updateData.preco !== undefined ? updateData.preco : currentDoc.preco;
                const unidades = (jaExiste.ativo ? jaExiste.quantidade || 0 : 0)
                    + (updateData.quantidade !== undefined ? updateData.quantidade : currentDoc.quantidade || 0);
                const juntado = await DealerVehiclePrice.findByIdAndUpdate(
                    jaExiste._id,
                    {
                        $set: {
                            preco: precoFinal,
                            ativo: typeof precoFinal === 'number' && precoFinal > 0,
                            quantidade: typeof precoFinal === 'number' && precoFinal > 0 ? Math.max(1, unidades) : 0,
                            frete: updateData.frete !== undefined ? updateData.frete : currentDoc.frete ?? jaExiste.frete,
                            prazo: updateData.prazo !== undefined ? updateData.prazo : currentDoc.prazo ?? jaExiste.prazo,
                            observacoes: updateData.observacoes !== undefined ? updateData.observacoes : currentDoc.observacoes || jaExiste.observacoes,
                            statusVeiculo: updateData.statusVeiculo || currentDoc.statusVeiculo || jaExiste.statusVeiculo,
                        },
                    },
                    { new: true }
                );
                await DealerVehiclePrice.deleteOne({ _id: currentDoc._id });
                return NextResponse.json({ ...juntado?.toObject(), movidoPara: String(destino._id), juntado: true });
            }

            updateData.variationId = destino._id;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ message: 'Nada a atualizar' });
        }

        if (updateData.ativo === true && currentDoc.quantidade === 0 && updateData.quantidade === undefined) {
            updateData.quantidade = 1;
        }

        const updated = await DealerVehiclePrice.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        );

        if (!updated) {
            return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
        }

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error('Erro ao atualizar DealerVehiclePrice:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return NextResponse.json({ error: 'Exclusão desativada. Use a tela de Catálogo/Preços e zere o valor para remover o veículo.' }, { status: 405 });
}
