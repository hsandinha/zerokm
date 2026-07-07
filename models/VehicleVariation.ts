import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVehicleVariation extends Document {
    marcaId?: mongoose.Types.ObjectId;
    marca: string;
    modelo: string;
    codigoFipe?: string;
    tipoVeiculo: 'carro' | 'moto' | 'caminhao' | 'utilitario';
    ano?: string;
    anoModelo?: number;
    anoFabricacao?: number;
    combustivel?: string;
    cor?: string;
    transmissao?: string;
    motor?: string;
    carroceria?: string;
    portas?: number;
    opcionais?: string;
    opcionaisPadrao?: string[];
    preco?: number;
    status?: string;
    observacoes?: string;
    cidade?: string;
    estado?: string;
    frete?: number;
    telefone?: string;
    concessionaria?: string;
    nomeContato?: string;
    operador?: string;
    imagemUrl?: string;
    ativo: boolean;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const VehicleVariationSchema: Schema = new Schema({
    marcaId: { type: Schema.Types.ObjectId, ref: 'Marca', index: true },
    marca: { type: String, required: true, trim: true, index: true },
    modelo: { type: String, required: true, trim: true, index: true },
    codigoFipe: { type: String, trim: true, index: true },
    tipoVeiculo: {
        type: String,
        enum: ['carro', 'moto', 'caminhao', 'utilitario'],
        default: 'carro',
        index: true,
    },
    ano: { type: String, trim: true },
    anoModelo: { type: Number, index: true },
    anoFabricacao: { type: Number },
    combustivel: { type: String, trim: true, index: true },
    cor: { type: String, trim: true, index: true },
    transmissao: { type: String, trim: true, index: true },
    motor: { type: String, trim: true },
    carroceria: { type: String, trim: true },
    portas: { type: Number },
    opcionais: { type: String, trim: true },
    opcionaisPadrao: { type: [String], default: [] },
    preco: { type: Number },
    status: { type: String, trim: true, index: true },
    observacoes: { type: String, trim: true },
    cidade: { type: String, trim: true },
    estado: { type: String, trim: true },
    frete: { type: Number },
    telefone: { type: String, trim: true },
    concessionaria: { type: String, trim: true, index: true },
    nomeContato: { type: String, trim: true },
    operador: { type: String, trim: true, index: true },
    imagemUrl: { type: String, trim: true },
    ativo: { type: Boolean, default: true, index: true },
    createdBy: { type: String, trim: true },
}, {
    timestamps: true,
});

VehicleVariationSchema.index({
    marca: 1,
    modelo: 1,
    anoFabricacao: 1,
    anoModelo: 1,
    combustivel: 1,
    cor: 1,
    transmissao: 1,
    opcionais: 1,
}, {
    unique: true,
    partialFilterExpression: { ativo: true },
});

VehicleVariationSchema.index({
    modelo: 'text',
    marca: 'text',
    codigoFipe: 'text',
    concessionaria: 'text',
    operador: 'text',
    cidade: 'text',
});

if (process.env.NODE_ENV === 'development' && mongoose.models.VehicleVariation) {
    delete mongoose.models.VehicleVariation;
}

const VehicleVariation: Model<IVehicleVariation> =
    mongoose.models.VehicleVariation || mongoose.model<IVehicleVariation>('VehicleVariation', VehicleVariationSchema);

export default VehicleVariation;
