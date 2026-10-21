import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Veículo favoritado pelo cliente: a oferta específica da linha (o anúncio 0KM
 * de uma concessionária ou o usado de repasse), não o modelo inteiro.
 *
 * Coleção nova de propósito: a antiga (Favorito) tem índice único por
 * marca + modelo e não aceitaria dois Argos de lojas diferentes. Os favoritos
 * antigos por modelo continuam valendo até o cliente removê-los.
 *
 * `veiculoId` é o id da oferta (DealerVehiclePrice no 0KM, RepasseVehicle no
 * usado), o mesmo `id` que a consulta devolve em cada linha. Os demais campos
 * são uma foto de quando foi favoritado, para mostrar o carro mesmo depois de
 * ele sair da vitrine.
 */
export interface IFavoritoVeiculo extends Document {
    userEmail: string;
    veiculoId: string;
    origem: 'novo' | 'repasse';
    marca: string;
    modelo: string;
    ano?: string;
    cor?: string;
    tipoVeiculo?: string;
    imagemUrl?: string;
    lastSeenAt: Date;
    createdAt: Date;
}

const FavoritoVeiculoSchema = new Schema<IFavoritoVeiculo>({
    userEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    veiculoId: { type: String, required: true, trim: true },
    origem: { type: String, enum: ['novo', 'repasse'], default: 'novo' },
    marca: { type: String, trim: true, default: '' },
    modelo: { type: String, trim: true, default: '' },
    ano: { type: String, trim: true },
    cor: { type: String, trim: true },
    tipoVeiculo: { type: String, trim: true },
    imagemUrl: { type: String, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: true, updatedAt: false } });

FavoritoVeiculoSchema.index({ userEmail: 1, veiculoId: 1 }, { unique: true });

const FavoritoVeiculo: Model<IFavoritoVeiculo> = mongoose.models.FavoritoVeiculo
    || mongoose.model<IFavoritoVeiculo>('FavoritoVeiculo', FavoritoVeiculoSchema);
export default FavoritoVeiculo;
