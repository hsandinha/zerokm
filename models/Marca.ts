import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMarca extends Document {
    nome: string;
    createdAt: Date;
    updatedAt: Date;
}

const MarcaSchema: Schema = new Schema({
    nome: { type: String, required: true, unique: true }
}, {
    timestamps: true
});

const Marca: Model<IMarca> = mongoose.models.Marca || mongoose.model<IMarca>('Marca', MarcaSchema);

export default Marca;
