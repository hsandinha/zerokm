import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IModelo extends Document {
    nome: string;
    marca: string;
    createdAt: Date;
    updatedAt: Date;
}

const ModeloSchema: Schema = new Schema({
    nome: { type: String, required: true },
    marca: { type: String, required: true }
}, {
    timestamps: true
});

// Compound index to ensure unique model names per brand
ModeloSchema.index({ nome: 1, marca: 1 }, { unique: true });

const Modelo: Model<IModelo> = mongoose.models.Modelo || mongoose.model<IModelo>('Modelo', ModeloSchema);

export default Modelo;
