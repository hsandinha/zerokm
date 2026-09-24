import mongoose, { Schema, Document, Model } from 'mongoose';
import { REPASSE_STATUS, REPASSE_TIPOS, type RepasseStatus, type RepasseTipo } from '@/lib/utils/repasse';

/**
 * Veículo de repasse: uma unidade usada, cadastrada pela concessionária.
 * Regras e motivo de não reaproveitar DealerVehiclePrice: lib/utils/repasse.ts.
 * Placa e fotos não ficam aqui: o lojista pede à concessionária pelo WhatsApp,
 * como no 0KM.
 */
export interface IRepasseVehicle extends Document {
    concessionariaId: mongoose.Types.ObjectId;
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
}

const RepasseVehicleSchema: Schema = new Schema({
    concessionariaId: { type: Schema.Types.ObjectId, ref: 'Concessionaria', required: true, index: true },
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
}, {
    timestamps: true,
});

// Painel da concessionária: lista dela, mais recentes primeiro.
RepasseVehicleSchema.index({ concessionariaId: 1, ativo: 1, updatedAt: -1 });
// Vitrine: só ativos em status visível.
RepasseVehicleSchema.index({ ativo: 1, status: 1, updatedAt: -1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.RepasseVehicle) {
    delete mongoose.models.RepasseVehicle;
}

const RepasseVehicle: Model<IRepasseVehicle> =
    mongoose.models.RepasseVehicle || mongoose.model<IRepasseVehicle>('RepasseVehicle', RepasseVehicleSchema);

export default RepasseVehicle;
