import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Concessionaria from '@/models/Concessionaria';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import RepasseVehicle from '@/models/RepasseVehicle';
import { lerConfigSistema } from '@/lib/services/configSistema';
import { enviarLembreteEstoque } from '@wa/lib/lembrete-estoque';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Teto por execução, para o cron caber no tempo da Vercel. */
const MAX_POR_EXECUCAO = 40;

/**
 * GET /api/cron/lembrete-estoque (todo dia às 9h de Brasília, vercel.json)
 *
 * Concessionária ativa que passou do prazo sem atualizar o estoque recebe um
 * WhatsApp da Vera (pedido do Márcio). Liga e desliga em Configurações, onde
 * também ficam o prazo (padrão 3 dias) e o modelo de mensagem aprovado na Meta.
 * Repete a cada período enquanto a loja continuar sem atualizar.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        await connectDB();
        const config = await lerConfigSistema();
        if (!config.lembreteEstoqueWhatsApp) {
            return NextResponse.json({ ok: true, desligado: true });
        }

        const agora = Date.now();
        const limiteMs = config.diasEstoqueDesatualizado * 864e5;

        // Última mexida no estoque de cada loja (0KM e repasse).
        const [novos, usados] = await Promise.all([
            DealerVehiclePrice.aggregate([{ $group: { _id: '$concessionariaId', ultima: { $max: '$updatedAt' } } }]),
            RepasseVehicle.aggregate([{ $group: { _id: '$concessionariaId', ultima: { $max: '$updatedAt' } } }]),
        ]);
        const ultimaPorLoja = new Map<string, number>();
        for (const d of [...novos, ...usados]) {
            if (!d._id || !d.ultima) continue;
            const chave = String(d._id);
            ultimaPorLoja.set(chave, Math.max(ultimaPorLoja.get(chave) ?? 0, new Date(d.ultima).getTime()));
        }

        const lojas = await Concessionaria.find({ ativo: { $ne: false } })
            .select('nome celular telefone telefoneResponsavel nomeResponsavel lembreteEstoqueEnviadoEm')
            .lean() as any[];

        const resultado = { avaliadas: lojas.length, enviados: 0, falhas: [] as Array<{ loja: string; motivo: string }>, adiadas: 0 };
        for (const loja of lojas) {
            const ultima = ultimaPorLoja.get(String(loja._id));
            // Loja que nunca publicou estoque é caso de onboarding, não de lembrete.
            if (!ultima) continue;
            const atraso = agora - ultima;
            if (atraso < limiteMs) continue;
            const ultimoLembrete = loja.lembreteEstoqueEnviadoEm ? new Date(loja.lembreteEstoqueEnviadoEm).getTime() : 0;
            // Um lembrete por período de atraso, e nunca antes da última atualização.
            if (ultimoLembrete > ultima && agora - ultimoLembrete < limiteMs) continue;
            if (resultado.enviados + resultado.falhas.length >= MAX_POR_EXECUCAO) { resultado.adiadas++; continue; }

            const telefone = loja.celular || loja.telefoneResponsavel || loja.telefone;
            if (!telefone) { resultado.falhas.push({ loja: loja.nome, motivo: 'sem telefone' }); continue; }

            const r = await enviarLembreteEstoque({
                telefone,
                loja: loja.nome || loja.nomeResponsavel || 'sua loja',
                dias: Math.floor(atraso / 864e5),
                templateName: config.templateLembreteEstoque,
            }).catch((error: any) => ({ ok: false as const, motivo: error?.message || 'falha no envio' }));

            if (r.ok) {
                resultado.enviados++;
                await Concessionaria.updateOne({ _id: loja._id }, { $set: { lembreteEstoqueEnviadoEm: new Date() } });
            } else {
                resultado.falhas.push({ loja: loja.nome, motivo: r.motivo });
                // Modelo inexistente ou WABA fora: não adianta tentar as outras lojas.
                if (/modelo|WhatsApp do CNV/.test(r.motivo)) break;
            }
        }

        console.log('[cron/lembrete-estoque]', JSON.stringify(resultado));
        return NextResponse.json({ ok: true, ...resultado });
    } catch (error: any) {
        console.error('[cron/lembrete-estoque]', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
