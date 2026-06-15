import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransaction extends Document {
    userId: mongoose.Types.ObjectId;
    type: 'subscription' | 'invite' | 'credit' | 'charge';
    description: string;
    amount: number;
    referenceId?: string;
    month: string; // 'YYYY-MM'
    status: 'paid' | 'pending' | 'cancelled';
    createdAt: Date;
    updatedAt: Date;
}

const TransactionSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['subscription', 'invite', 'credit', 'charge'], required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    referenceId: { type: String },
    month: { type: String, required: true },
    status: { type: String, enum: ['paid', 'pending', 'cancelled'], default: 'pending' },
}, {
    timestamps: true,
});

if (process.env.NODE_ENV === 'development' && mongoose.models.Transaction) {
    delete mongoose.models.Transaction;
}

const Transaction: Model<ITransaction> = mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;
