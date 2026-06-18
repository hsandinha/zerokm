import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVehicleVariation extends Document {
    marcaId?: mongoose.Types.ObjectId;
    marca: string;
    modelo: string;
    versao?: string;
    codigoFipe?: string;
    tipoVeiculo: 'carro' | 'moto' | 'caminhao' | 'utilitario';
    anoModelo?: number;
    anoFabricacao?: number;
    combustivel?: string;
    transmissao?: string;
    motor?: string;
    carroceria?: string;
    portas?: number;
    opcionaisPadrao?: string[];
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
    versao: { type: String, trim: true },
    codigoFipe: { type: String, trim: true, index: true },
    tipoVeiculo: {
        type: String,
        enum: ['carro', 'moto', 'caminhao', 'utilitario'],
        default: 'carro',
        index: true,
    },
    anoModelo: { type: Number, index: true },
    anoFabricacao: { type: Number },
    combustivel: { type: String, trim: true, index: true },
    transmissao: { type: String, trim: true, index: true },
    motor: { type: String, trim: true },
    carroceria: { type: String, trim: true },
    portas: { type: Number },
    opcionaisPadrao: { type: [String], default: [] },
    imagemUrl: { type: String, trim: true },
    ativo: { type: Boolean, default: true, index: true },
    createdBy: { type: String, trim: true },
}, {
    timestamps: true,
});

VehicleVariationSchema.index({
    marca: 1,
    modelo: 1,
    versao: 1,
    anoModelo: 1,
    combustivel: 1,
    transmissao: 1,
}, {
    unique: true,
    partialFilterExpression: { ativo: true },
});

VehicleVariationSchema.index({
    modelo: 'text',
    versao: 'text',
    marca: 'text',
    codigoFipe: 'text',
});

if (process.env.NODE_ENV === 'development' && mongoose.models.VehicleVariation) {
    delete mongoose.models.VehicleVariation;
}

const VehicleVariation: Model<IVehicleVariation> =
    mongoose.models.VehicleVariation || mongoose.model<IVehicleVariation>('VehicleVariation', VehicleVariationSchema);

export default VehicleVariation;
