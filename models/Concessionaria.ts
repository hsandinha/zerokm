import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IConcessionaria extends Document {
    nome: string;
    razaoSocial: string;
    cnpj: string;
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
    createdAt: Date;
    updatedAt: Date;
}

const ConcessionariaSchema: Schema = new Schema({
    nome: { type: String },
    razaoSocial: { type: String },
    cnpj: { type: String, unique: true, sparse: true },
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
    dataCadastro: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Delete existing model to force re-compilation with new schema in development
if (process.env.NODE_ENV === 'development' && mongoose.models.Concessionaria) {
    delete mongoose.models.Concessionaria;
}

const Concessionaria: Model<IConcessionaria> = mongoose.models.Concessionaria || mongoose.model<IConcessionaria>('Concessionaria', ConcessionariaSchema);

export default Concessionaria;
