import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
    firebaseUid: string;
    email: string;
    displayName?: string;
    phoneNumber?: string;
    cpf?: string;
    allowedProfiles: string[];
    defaultProfile?: string;
    dealershipId?: string;
    vendedorId?: string;
    forcePasswordChange: boolean;
    canViewLocation?: boolean;
    credits?: number;
    freeTrialStartedAt?: Date;
    freeTrialExpiresAt?: Date;
    subscription?: {
        planId?: string;
        status?: 'active' | 'inactive' | 'cancelled';
        expiresAt?: Date;
        billingType?: 'monthly' | 'annual';
        activationMethod?: 'manual' | 'cortesia' | 'card' | 'pix' | 'boleto';
        mpPreapprovalId?: string;
        mpPreapprovalStatus?: string;
        nextPaymentDate?: Date;
        lastAuthorizedPaymentId?: string;
        recurrenceCancelledAt?: Date;
    };
    marginConfig?: {
        mode: 'percent' | 'fixed';
        percentValue: number;
        fixedValue: number;
    };
    currentSessionToken?: string;
    webhookSecret?: string;
    profileVersion?: number;
    address?: {
        street: string;
        number: string;
        complement?: string;
        neighborhood: string;
        city: string;
        state: string;
        zipCode: string;
    };
    creditCard?: {
        holderName?: string;
        lastFour?: string;
        brand?: string;
        expiry?: string;
        mpCardId?: string;
    };
    mpCustomerId?: string;
    isInvitee?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema: Schema = new Schema({
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    displayName: { type: String },
    phoneNumber: { type: String },
    cpf: { type: String },
    allowedProfiles: { type: [String], default: ['operador'] },
    defaultProfile: { type: String },
    dealershipId: { type: String },
    vendedorId: { type: String },
    forcePasswordChange: { type: Boolean, default: false },
    canViewLocation: { type: Boolean, default: false },
    credits: { type: Number, default: 0 },
    freeTrialStartedAt: { type: Date },
    freeTrialExpiresAt: { type: Date },
    subscription: {
        planId: { type: String },
        status: { type: String, enum: ['active', 'inactive', 'cancelled'] },
        expiresAt: { type: Date },
        billingType: { type: String, enum: ['monthly', 'annual'] },
        activationMethod: { type: String, enum: ['manual', 'cortesia', 'card', 'pix', 'boleto'] },
        mpPreapprovalId: { type: String },
        mpPreapprovalStatus: { type: String },
        nextPaymentDate: { type: Date },
        lastAuthorizedPaymentId: { type: String },
        recurrenceCancelledAt: { type: Date }
    },
    marginConfig: {
        mode: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
        percentValue: { type: Number, default: 0 },
        fixedValue: { type: Number, default: 0 },
    },
    currentSessionToken: { type: String },
    webhookSecret: { type: String },
    profileVersion: { type: Number, default: 0 },
    address: {
        street: String,
        number: String,
        complement: String,
        neighborhood: String,
        city: String,
        state: String,
        zipCode: String
    },
    creditCard: {
        holderName: String,
        lastFour: String,
        brand: String,
        expiry: String,
        mpCardId: String
    },
    mpCustomerId: { type: String },
    isInvitee: { type: Boolean, default: false }
}, {
    timestamps: true
});

// Force model recompilation in development to ensure schema updates are applied
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.User) {
        delete mongoose.models.User;
    }
}

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
