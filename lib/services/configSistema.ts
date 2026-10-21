import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';

/**
 * Ajustes do sistema editados em Configurações. Mesma coleção `configs` do
 * contato e dos banners, com a chave 'sistema'.
 */
export interface ConfigSistema {
    /** Link do vídeo tutorial (YouTube, Vimeo ou .mp4) mostrado no teste grátis. */
    videoTutorialUrl: string;
    /** Dias sem atualizar o estoque até a concessionária receber o aviso. */
    diasEstoqueDesatualizado: number;
    /** Liga o lembrete automático por WhatsApp (Vera) para a concessionária atrasada. */
    lembreteEstoqueWhatsApp: boolean;
    /** Modelo de mensagem aprovado na Meta usado no lembrete ({{1}} loja, {{2}} dias). */
    templateLembreteEstoque: string;
}

export const CONFIG_SISTEMA_PADRAO: ConfigSistema = {
    videoTutorialUrl: '',
    diasEstoqueDesatualizado: 3,
    lembreteEstoqueWhatsApp: false,
    templateLembreteEstoque: 'lembrete_estoque',
};

function colecao() {
    return mongoose.connection.useDb('zerokm').collection('configs');
}

export function normalizarConfigSistema(doc: any): ConfigSistema {
    const dias = Number(doc?.diasEstoqueDesatualizado);
    return {
        videoTutorialUrl: typeof doc?.videoTutorialUrl === 'string' ? doc.videoTutorialUrl.trim() : CONFIG_SISTEMA_PADRAO.videoTutorialUrl,
        diasEstoqueDesatualizado: Number.isInteger(dias) && dias >= 1 && dias <= 60 ? dias : CONFIG_SISTEMA_PADRAO.diasEstoqueDesatualizado,
        lembreteEstoqueWhatsApp: doc?.lembreteEstoqueWhatsApp === true,
        templateLembreteEstoque: typeof doc?.templateLembreteEstoque === 'string' && /^[a-z0-9_]{1,512}$/.test(doc.templateLembreteEstoque.trim())
            ? doc.templateLembreteEstoque.trim()
            : CONFIG_SISTEMA_PADRAO.templateLembreteEstoque,
    };
}

export async function lerConfigSistema(): Promise<ConfigSistema> {
    await connectDB();
    const doc = await colecao().findOne({ key: 'sistema' });
    return normalizarConfigSistema(doc);
}

export async function salvarConfigSistema(parcial: Partial<ConfigSistema>): Promise<ConfigSistema> {
    const atual = await lerConfigSistema();
    const proxima = normalizarConfigSistema({ ...atual, ...parcial });
    await colecao().updateOne({ key: 'sistema' }, { $set: { key: 'sistema', ...proxima } }, { upsert: true });
    return proxima;
}
