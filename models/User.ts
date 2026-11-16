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
        paymentMethod?: 'pix' | 'boleto' | 'card';
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
        /** Margem por faixa de preço; fora das faixas vale a geral. */
        faixas?: { ate: number; tipo: 'percent' | 'fixed'; valor: number }[];
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
    /** Funcionalidades liberadas pelo CNV ao lojista titular, só a diferença do padrão. Ver lib/recursos.ts. */
    recursos?: Record<string, boolean>;
    /** "@loja", obrigatório no cadastro do lojista (lib/utils/instagram.ts). */
    instagram?: string;
    /** Aceite dos termos no cadastro ("Li e concordo"). */
    termosAceitosEm?: Date;
    termosVersao?: string;
    /** Cliente que paga diferente da tabela (lib/utils/valorCombinado.ts). */
    valorCombinado?: {
        valor?: number;
        periodicidade?: 'monthly' | 'annual';
        planId?: string;
        observacao?: string;
        atualizadoPor?: string;
        atualizadoEm?: Date;
    };
    /** Equipe da concessionária (lib/utils/atendentesLoja.ts). Sem o campo, é o titular. */
    papelLoja?: 'titular' | 'atendente';
    /** Atendente desativado pelo titular ou pelo CNV: não entra nem ocupa vaga. */
    atendenteInativo?: boolean;
    /** Quem cadastrou o atendente (e-mail). */
    atendenteCriadoPor?: string;
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
        paymentMethod: { type: String, enum: ['pix', 'boleto', 'card'] },
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
        faixas: {
            type: [{
                _id: false,
                ate: { type: Number, required: true, min: 0 },
                tipo: { type: String, enum: ['percent', 'fixed'], required: true },
                valor: { type: Number, required: true, min: 0 },
            }],
            default: undefined,
        },
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
    isInvitee: { type: Boolean, default: false },
    recursos: { type: Schema.Types.Mixed },
    instagram: { type: String, trim: true },
    termosAceitosEm: { type: Date },
    termosVersao: { type: String },
    valorCombinado: {
        valor: { type: Number, min: 0 },
        periodicidade: { type: String, enum: ['monthly', 'annual'] },
        planId: { type: String },
        observacao: { type: String, trim: true },
        atualizadoPor: { type: String },
        atualizadoEm: { type: Date },
    },
    papelLoja: { type: String, enum: ['titular', 'atendente'] },
    atendenteInativo: { type: Boolean },
    atendenteCriadoPor: { type: String },
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
