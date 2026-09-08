import mongoose, { Schema, Document, Model } from 'mongoose';

export type TipoVeiculo = 'carro' | 'moto' | 'caminhao' | 'utilitario';

export interface IMarca extends Document {
    nome: string;
    /**
     * Tipo padrão das variações dessa marca. Serve de default quando a
     * variação chega sem tipo (formulário, CSV). Marcas mistas (ex.: SUZUKI,
     * que vende carro e moto) ficam como 'carro' e o tipo é definido por
     * variação.
     */
    tipoVeiculo: TipoVeiculo;
    createdAt: Date;
    updatedAt: Date;
}

const MarcaSchema: Schema = new Schema({
    nome: { type: String, required: true, unique: true },
    tipoVeiculo: {
        type: String,
        enum: ['carro', 'moto', 'caminhao', 'utilitario'],
        default: 'carro',
        index: true,
    },
}, {
    timestamps: true
});

if (process.env.NODE_ENV === 'development' && mongoose.models.Marca) {
    delete mongoose.models.Marca;
}

const Marca: Model<IMarca> = mongoose.models.Marca || mongoose.model<IMarca>('Marca', MarcaSchema);

export default Marca;
