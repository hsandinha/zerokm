import mongoose, { Schema, Document, Model } from 'mongoose';

/** Quem já viu e fechou cada aviso: vale em qualquer aparelho. */
export interface IAvisoLeitura extends Document {
    avisoId: mongoose.Types.ObjectId;
    userEmail: string;
    createdAt: Date;
}

const AvisoLeituraSchema = new Schema<IAvisoLeitura>({
    avisoId: { type: Schema.Types.ObjectId, ref: 'Aviso', required: true },
    userEmail: { type: String, required: true, lowercase: true, trim: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

AvisoLeituraSchema.index({ avisoId: 1, userEmail: 1 }, { unique: true });
AvisoLeituraSchema.index({ userEmail: 1 });

const AvisoLeitura: Model<IAvisoLeitura> = mongoose.models.AvisoLeitura
    || mongoose.model<IAvisoLeitura>('AvisoLeitura', AvisoLeituraSchema);
export default AvisoLeitura;
