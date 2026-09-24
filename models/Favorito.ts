import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Carro monitorado por um cliente. O favorito é o modelo (marca + modelo, como vem
 * do catálogo/FIPE), não uma oferta específica: toda oferta nova desse modelo que
 * entrar na vitrine depois de `lastSeenAt` conta como novidade até ele abrir Favoritos.
 */
export interface IFavorito extends Document {
    userEmail: string;
    marca: string;
    modelo: string;
    tipoVeiculo?: string;
    imagemUrl?: string;
    lastSeenAt: Date;
    createdAt: Date;
}

const FavoritoSchema = new Schema<IFavorito>({
    userEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    marca: { type: String, required: true, trim: true },
    modelo: { type: String, required: true, trim: true },
    tipoVeiculo: { type: String, trim: true },
    imagemUrl: { type: String, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: true, updatedAt: false } });

FavoritoSchema.index({ userEmail: 1, marca: 1, modelo: 1 }, { unique: true });

const Favorito: Model<IFavorito> = mongoose.models.Favorito || mongoose.model<IFavorito>('Favorito', FavoritoSchema);
export default Favorito;
