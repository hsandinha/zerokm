import mongoose, { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
    title: string;
    imageUrl: string;
    linkUrl?: string;
    isActive: boolean;
    order: number;
    dealershipId?: string;
    status?: 'active' | 'pending' | 'rejected' | 'awaiting_payment';
    expiresAt?: Date;
    paymentId?: string;
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
    status: { type: String, enum: ['active', 'pending', 'rejected', 'awaiting_payment'], default: 'active' },
    expiresAt: { type: Date },
    paymentId: { type: String },
}, { timestamps: true });

export default mongoose.models.Banner || mongoose.model<IBanner>('Banner', BannerSchema);
