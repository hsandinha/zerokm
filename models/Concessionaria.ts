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
    nome: { type: String, required: true },
    razaoSocial: { type: String, required: true },
    cnpj: { type: String, required: true, unique: true },
    inscricaoEstadual: { type: String },
    telefone: { type: String, required: true },
    celular: { type: String },
    contato: { type: String, required: true },
    email: { type: String, required: true },
    endereco: { type: String, required: true },
    numero: { type: String, required: true },
    complemento: { type: String },
    bairro: { type: String, required: true },
    cidade: { type: String, required: true },
    uf: { type: String, required: true },
    cep: { type: String, required: true },
    nomeResponsavel: { type: String, required: true },
    telefoneResponsavel: { type: String, required: true },
    emailResponsavel: { type: String },
    observacoes: { type: String },
    ativo: { type: Boolean, default: true },
    dataCadastro: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Prevent model recompilation error in development
const Concessionaria: Model<IConcessionaria> = mongoose.models.Concessionaria || mongoose.model<IConcessionaria>('Concessionaria', ConcessionariaSchema);

export default Concessionaria;
