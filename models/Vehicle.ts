import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVehicle extends Document {
    dataEntrada: Date;
    modelo: string;
    transmissao: 'Manual' | 'Automática' | 'CVT';
    combustivel: 'Flex' | 'Gasolina' | 'Etanol' | 'Diesel' | 'Elétrico' | 'Híbrido';
    cor: string;
    ano: string;
    opcionais: string;
    preco: number;
    status: 'A faturar' | 'Refaturamento' | 'Licenciado';
    observacoes: string;
    cidade: string;
    estado: string;
    frete: number;
    telefone: string;
    nomeContato: string;
    operador: string;
    fotos?: string[];
    marca?: string;
    versao?: string;
    anoModelo?: string;
    chassi?: string;
    motor?: string;
    vendedor?: string;
    quilometragem?: number;
    categoria?: string;
    descricao?: string;
    createdAt: Date;
    updatedAt: Date;
}

const VehicleSchema: Schema = new Schema({
    dataEntrada: { type: Date, required: true },
    modelo: { type: String, required: true },
    transmissao: { type: String, required: true },
    combustivel: { type: String, required: true },
    cor: { type: String, required: true },
    ano: { type: String, required: true },
    opcionais: { type: String },
    preco: { type: Number, required: true },
    status: {
        type: String,
        enum: ['A faturar', 'Refaturamento', 'Licenciado'],
        required: true
    },
    observacoes: { type: String },
    cidade: { type: String, required: true },
    estado: { type: String, required: true },
    frete: { type: Number, required: true },
    telefone: { type: String, required: true },
    nomeContato: { type: String, required: true },
    operador: { type: String, required: true },
    fotos: { type: [String] },
    marca: String,
    versao: String,
    anoModelo: String,
    chassi: String,
    motor: String,
    vendedor: String,
    quilometragem: Number,
    categoria: String,
    descricao: String
}, {
    timestamps: true
});

// Delete existing model to prevent hot-reload issues with schema changes in development
if (process.env.NODE_ENV === 'development' && mongoose.models.Vehicle) {
    delete mongoose.models.Vehicle;
}

const Vehicle: Model<IVehicle> = mongoose.models.Vehicle || mongoose.model<IVehicle>('Vehicle', VehicleSchema);

export default Vehicle;
