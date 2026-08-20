import mongoose, { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
    title: string;
    imageUrl: string;
    linkUrl?: string;
    isActive: boolean;
    order: number;
    dealershipId?: string;
    vehicleId?: string;
    status?: 'active' | 'pending' | 'rejected' | 'awaiting_payment' | 'expired';
    expiresAt?: Date;
    paymentId?: string;
    badge?: string;
    price?: string;
    priceSubtitle?: string;
    vehicleModel?: string;
    storeName?: string;
    year?: string;
    color?: string;
    fuel?: string;
    delivery?: string;
    statusCondition?: string;
    ctaText?: string;
    createdAt: Date;
    updatedAt: Date;
}

const BannerSchema: Schema = new Schema({
    title: { type: String, required: true },
    imageUrl: { type: String, required: true }, // Suporta Base64 ou URL de link
    linkUrl: { type: String },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    dealershipId: { type: String },
    vehicleId: { type: String },
    status: { type: String, enum: ['active', 'pending', 'rejected', 'awaiting_payment', 'expired'], default: 'active' },
    expiresAt: { type: Date },
    paymentId: { type: String },
    badge: { type: String },
    price: { type: String },
    priceSubtitle: { type: String },
    vehicleModel: { type: String },
    storeName: { type: String },
    year: { type: String },
    color: { type: String },
    fuel: { type: String },
    delivery: { type: String },
    statusCondition: { type: String },
    ctaText: { type: String },
}, { timestamps: true });

/**
 * Banner vencido é apagado pelo próprio Mongo 10 dias depois do vencimento.
 *
 * O deactivateExpiredBanners só marca `isActive: false` — o documento ficava
 * para sempre. Como a imagem é gravada em base64, 631 banners vencidos já
 * ocupavam 80 MB parados. O índice TTL resolve no banco: não depende de cron
 * saudável nem de alguém abrir a listagem.
 *
 * O TTL age sobre `expiresAt`; documentos sem essa data nunca são removidos.
 */
export const BANNER_TTL_APOS_VENCIMENTO_S = 10 * 24 * 60 * 60;

BannerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: BANNER_TTL_APOS_VENCIMENTO_S });

export default mongoose.models.Banner || mongoose.model<IBanner>('Banner', BannerSchema);
