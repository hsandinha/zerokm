import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransportadora extends Document {
    nome: string;
    cnpj: string;
    razaoSocial: string;
    inscricaoEstadual?: string;
    telefone: string;
    celular?: string;
    email: string;
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo: boolean;
    dataCreated: string;
}

const TransportadoraSchema: Schema = new Schema({
    nome: { type: String, required: true },
    cnpj: { type: String, required: true },
    razaoSocial: { type: String, required: true },
    inscricaoEstadual: { type: String },
    telefone: { type: String, required: true },
    celular: { type: String },
    email: { type: String, required: true },
    endereco: { type: String, required: true },
    numero: { type: String, required: true },
    complemento: { type: String },
    bairro: { type: String, required: true },
    cidade: { type: String, required: true },
    estado: { type: String, required: true },
    cep: { type: String, required: true },
    nomeResponsavel: { type: String, required: true },
    telefoneResponsavel: { type: String, required: true },
    emailResponsavel: { type: String },
    observacoes: { type: String },
    ativo: { type: Boolean, default: true },
    dataCreated: { type: String, default: () => new Date().toLocaleDateString('pt-BR') }
}, {
    timestamps: true
});

const Transportadora: Model<ITransportadora> = mongoose.models.Transportadora || mongoose.model<ITransportadora>('Transportadora', TransportadoraSchema);

export default Transportadora;
