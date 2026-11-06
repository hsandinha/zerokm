import mongoose, { Schema, Document, Model } from 'mongoose';
import { REPASSE_STATUS, REPASSE_TIPOS, type RepasseStatus, type RepasseTipo } from '@/lib/utils/repasse';

/**
 * Veículo de repasse: uma unidade usada, cadastrada pela concessionária.
 *
 * Também guarda o ESTOQUE LOCAL do lojista que assina o atendimento (com
 * `lojistaId` e sem concessionária): é a mesma coisa — um usado, uma unidade —
 * e não justifica outra tabela. Esse estoque é só da IA da própria loja: as
 * consultas de sempre (vitrine, favoritos, sugestões, painel da
 * concessionária) não o enxergam — ver o filtro automático no fim do arquivo.
 * Regras e motivo de não reaproveitar DealerVehiclePrice: lib/utils/repasse.ts.
 * Placa e fotos do repasse não ficam aqui: o lojista pede à concessionária
 * pelo WhatsApp, como no 0KM. Só o carro do pátio do lojista tem fotos e placa
 * interna (bloco no fim da interface), porque ali quem vende é o próprio dono.
 */
export interface IRepasseVehicle extends Document {
    concessionariaId?: mongoose.Types.ObjectId;
    /** Estoque local de um lojista (User titular). Ausente = repasse de concessionária. */
    lojistaId?: mongoose.Types.ObjectId | null;
    tipoVeiculo: RepasseTipo;
    marca: string;
    modelo: string;
    ano: string;
    anoFabricacao?: number;
    anoModelo: number;
    km: number;
    cor?: string;
    combustivel?: string;
    transmissao?: string;
    opcionais?: string;
    preco: number;
    observacoes?: string;
    /** true = modelo digitado à mão, sem correspondência no catálogo mestre. */
    foraDoCatalogo?: boolean;
    /** Vínculo FIPE escolhido no cadastro (000000-0) e a descrição original da FIPE. */
    codigoFipe?: string;
    descricaoFipe?: string;
    status: RepasseStatus;
    /** false = removido pela concessionária (vendeu ou desistiu). Fica no histórico. */
    ativo: boolean;
    removidoEm?: Date | null;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;

    // ── Só do estoque local (pátio do lojista) ── ver wa/lib/estoque-ficha.ts.
    // O repasse da concessionária não usa nada daqui: segue sem foto e sem
    // placa, pedidas pelo WhatsApp.
    versao?: string;
    portas?: number;
    aceitaTroca?: boolean;
    unicoDono?: boolean;
    /** Placa para a equipe achar o carro no pátio. Nunca vai à IA nem ao cliente. */
    placaInterna?: string;
    /** Preço FIPE de referência no cadastro (só a equipe vê). */
    precoFipe?: number;
    referenciaFipe?: string;
    /** disponivel | reservado | vendido | pausado. Ausente = disponível. A IA só oferece disponível. */
    situacao?: 'disponivel' | 'reservado' | 'vendido' | 'pausado';
    situacaoEm?: Date | null;
    /** Fotos (WaFotoEstoque) na ordem de exibição; a primeira é a capa. */
    fotos?: mongoose.Types.ObjectId[];
}

const RepasseVehicleSchema: Schema = new Schema({
    concessionariaId: {
        type: Schema.Types.ObjectId,
        ref: 'Concessionaria',
        index: true,
        required: function (this: { lojistaId?: unknown }) { return !this.lojistaId; },
    },
    lojistaId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    tipoVeiculo: { type: String, enum: REPASSE_TIPOS, default: 'carro', index: true },
    marca: { type: String, required: true, trim: true, index: true },
    modelo: { type: String, required: true, trim: true, index: true },
    ano: { type: String, trim: true },
    anoFabricacao: { type: Number },
    anoModelo: { type: Number, required: true, index: true },
    km: { type: Number, required: true, min: 0 },
    cor: { type: String, trim: true },
    combustivel: { type: String, trim: true },
    transmissao: { type: String, trim: true },
    opcionais: { type: String, trim: true },
    preco: { type: Number, required: true, min: 0 },
    observacoes: { type: String, trim: true },
    foraDoCatalogo: { type: Boolean, default: false },
    codigoFipe: { type: String, trim: true, index: true },
    descricaoFipe: { type: String, trim: true },
    status: { type: String, enum: REPASSE_STATUS, default: 'Disponível', index: true },
    ativo: { type: Boolean, default: true, index: true },
    removidoEm: { type: Date, default: null },
    createdBy: { type: String, trim: true },

    // Estoque local (pátio do lojista): ver a interface acima.
    versao: { type: String, trim: true },
    portas: { type: Number, min: 0, max: 9 },
    aceitaTroca: { type: Boolean },
    unicoDono: { type: Boolean },
    placaInterna: { type: String, trim: true, uppercase: true },
    precoFipe: { type: Number, min: 0 },
    referenciaFipe: { type: String, trim: true },
    situacao: { type: String, enum: ['disponivel', 'reservado', 'vendido', 'pausado'] },
    situacaoEm: { type: Date, default: null },
    fotos: { type: [{ type: Schema.Types.ObjectId, ref: 'WaFotoEstoque' }], default: undefined },
}, {
    timestamps: true,
});

// Painel da concessionária: lista dela, mais recentes primeiro.
RepasseVehicleSchema.index({ concessionariaId: 1, ativo: 1, updatedAt: -1 });
// Vitrine: só ativos em status visível.
RepasseVehicleSchema.index({ ativo: 1, status: 1, updatedAt: -1 });
RepasseVehicleSchema.index({ lojistaId: 1, ativo: 1, updatedAt: -1 });

// Estoque local de lojista fica fora de toda consulta que não pede por ele.
// O filtro entra aqui, e não em cada rota, para nenhuma tela antiga (vitrine,
// favoritos, sugestões) passar a mostrar carro de lojista por esquecimento.
// `$unionWith` não passa por hook: a vitrine filtra também no próprio pipeline.
function mencionaLojista(filtro: unknown): boolean {
    return JSON.stringify(filtro ?? {}).includes('"lojistaId"');
}
for (const op of ['find', 'findOne', 'countDocuments', 'distinct', 'updateMany', 'findOneAndUpdate'] as const) {
    RepasseVehicleSchema.pre(op, function excluirEstoqueDeLojista() {
        const filtro = this.getFilter();
        if (!mencionaLojista(filtro) && !('_id' in filtro)) this.where({ lojistaId: null });
    });
}
RepasseVehicleSchema.pre('aggregate', function excluirEstoqueDeLojista() {
    const pipeline = this.pipeline();
    if (!mencionaLojista(pipeline[0])) pipeline.unshift({ $match: { lojistaId: null } });
});

if (process.env.NODE_ENV === 'development' && mongoose.models.RepasseVehicle) {
    delete mongoose.models.RepasseVehicle;
}

const RepasseVehicle: Model<IRepasseVehicle> =
    mongoose.models.RepasseVehicle || mongoose.model<IRepasseVehicle>('RepasseVehicle', RepasseVehicleSchema);

export default RepasseVehicle;
