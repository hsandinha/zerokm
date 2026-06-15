import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPayment extends Document {
    userId: mongoose.Types.ObjectId;
    planId?: mongoose.Types.ObjectId;
    mpPaymentId: string;
    mpPreferenceId?: string;
    mpPreapprovalId?: string;
    mpAuthorizedPaymentId?: string;
    externalReference: string;
    method: string;       // credit_card, debit_card, pix, bolbradesco, ticket, account_money
    methodDetail?: string; // visa, master, elo, etc.
    status: 'approved' | 'pending' | 'in_process' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';
    statusDetail?: string;
    amount: number;
    currency: string;
    installments?: number;
    billingType?: 'monthly' | 'annual';
    // PIX specific
    pixQrCode?: string;
    pixQrCodeBase64?: string;
    // Boleto specific
    boletoUrl?: string;
    boletoBarcode?: string;
    boletoEmailSentAt?: Date;
    // Payer info
    payerEmail?: string;
    payerName?: string;
    payerCpf?: string;
    // Dates
    mpDateCreated?: Date;
    mpDateApproved?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    mpPaymentId: { type: String, unique: true, sparse: true },
    mpPreferenceId: { type: String },
    mpPreapprovalId: { type: String, index: true },
    mpAuthorizedPaymentId: { type: String, index: true },
    externalReference: { type: String, index: true },
    method: { type: String, required: true },
    methodDetail: { type: String },
    status: {
        type: String,
        enum: ['approved', 'pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back'],
        default: 'pending',
        index: true,
    },
    statusDetail: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'BRL' },
    installments: { type: Number, default: 1 },
    billingType: { type: String, enum: ['monthly', 'annual'] },
    // PIX
    pixQrCode: { type: String },
    pixQrCodeBase64: { type: String },
    // Boleto
    boletoUrl: { type: String },
    boletoBarcode: { type: String },
    boletoEmailSentAt: { type: Date },
    // Payer
    payerEmail: { type: String },
    payerName: { type: String },
    payerCpf: { type: String },
    // MP dates
    mpDateCreated: { type: Date },
    mpDateApproved: { type: Date },
}, {
    timestamps: true,
});

if (process.env.NODE_ENV === 'development' && mongoose.models.Payment) {
    delete mongoose.models.Payment;
}

const Payment: Model<IPayment> = mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);

export default Payment;
