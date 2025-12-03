import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransportadora extends Document {
    estado: string;
    valor: number;
    ativo: boolean;
}

const TransportadoraSchema: Schema = new Schema({
    estado: { type: String, required: true },
    valor: { type: Number, required: true },
    ativo: { type: Boolean, default: true }
}, {
    timestamps: true
});

const Transportadora: Model<ITransportadora> = mongoose.models.Transportadora || mongoose.model<ITransportadora>('Transportadora', TransportadoraSchema);

export default Transportadora;
