import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICor extends Document {
    nome: string;
    hex?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CorSchema: Schema = new Schema({
    nome: { type: String, required: true, unique: true },
    hex: { type: String }
}, {
    timestamps: true
});

const Cor: Model<ICor> = mongoose.models.Cor || mongoose.model<ICor>('Cor', CorSchema);

export default Cor;
