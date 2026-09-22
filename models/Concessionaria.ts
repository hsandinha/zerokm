import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IConcessionaria extends Document {
    nome: string;
    razaoSocial: string;
    cnpj: string;
    marcaId?: mongoose.Types.ObjectId;
    marca?: string;
    marcaIds?: mongoose.Types.ObjectId[];
    marcas?: string[];
    operadorId?: mongoose.Types.ObjectId;
    inscricaoEstadual?: string;
    telefone: string;
    celular?: string;
    contato: string;
    email: string;
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo: boolean;
    dataCadastro: Date;
    webhookSecret?: string;
    /** Plano pago pela loja para anunciar repasse. Ver lib/utils/planoRepasse.ts. */
    planoRepasse?: {
        planId?: mongoose.Types.ObjectId;
        planName?: string;
        status?: 'active' | 'inactive' | 'cancelled';
        billingType?: 'monthly' | 'annual';
        expiresAt?: Date | null;
        activationMethod?: 'manual' | 'cortesia' | 'pix' | 'boleto' | 'card';
        activatedAt?: Date | null;
        activatedBy?: string;
        lastPaymentId?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

const ConcessionariaSchema: Schema = new Schema({
    nome: { type: String },
    razaoSocial: { type: String },
    cnpj: { type: String, unique: true, sparse: true },
    marcaId: { type: Schema.Types.ObjectId, ref: 'Marca', index: true },
    marca: { type: String, trim: true, index: true },
    marcaIds: [{ type: Schema.Types.ObjectId, ref: 'Marca', index: true }],
    marcas: [{ type: String, trim: true }],
    operadorId: { type: Schema.Types.ObjectId, ref: 'User' },
    inscricaoEstadual: { type: String },
    telefone: { type: String },
    celular: { type: String },
    contato: { type: String },
    email: { type: String },
    endereco: { type: String },
    numero: { type: String },
    complemento: { type: String },
    bairro: { type: String },
    cidade: { type: String },
    uf: { type: String },
    cep: { type: String },
    nomeResponsavel: { type: String },
    telefoneResponsavel: { type: String },
    emailResponsavel: { type: String },
    observacoes: { type: String },
    ativo: { type: Boolean, default: true },
    dataCadastro: { type: Date, default: Date.now },
    webhookSecret: { type: String },
    planoRepasse: {
        planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
        planName: { type: String },
        status: { type: String, enum: ['active', 'inactive', 'cancelled'] },
        billingType: { type: String, enum: ['monthly', 'annual'] },
        expiresAt: { type: Date, default: null },
        activationMethod: { type: String, enum: ['manual', 'cortesia', 'pix', 'boleto', 'card'] },
        activatedAt: { type: Date, default: null },
        activatedBy: { type: String },
        lastPaymentId: { type: String },
    },
}, {
    timestamps: true
});

// Delete existing model to force re-compilation with new schema in development
if (process.env.NODE_ENV === 'development' && mongoose.models.Concessionaria) {
    delete mongoose.models.Concessionaria;
}

const Concessionaria: Model<IConcessionaria> = mongoose.models.Concessionaria || mongoose.model<IConcessionaria>('Concessionaria', ConcessionariaSchema);

export default Concessionaria;
