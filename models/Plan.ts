import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPlan extends Document {
    name: string;
    description?: string;
    /**
     * Quem compra. 'cliente' = lojista (planos antigos, sem o campo, também).
     * 'concessionaria' = plano para a loja anunciar repasse; nunca aparece
     * para o lojista (landing, checkout, CRM). Ver lib/utils/planoRepasse.ts.
     */
    publico: 'cliente' | 'concessionaria';
    type: 'monthly' | 'credits';
    credits?: number | null;
    price: number;
    annualPrice?: number | null;
    invitePrice?: number;
    features?: string[];
    popular?: boolean;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const PlanSchema: Schema = new Schema({
    name: { type: String, required: true },
    description: { type: String },
    publico: { type: String, enum: ['cliente', 'concessionaria'], default: 'cliente', index: true },
    type: { type: String, enum: ['monthly', 'credits'], required: true },
    credits: { type: Number, default: null },
    price: { type: Number, required: true },
    annualPrice: { type: Number, default: null },
    invitePrice: { type: Number, default: 0 },
    features: { type: [String], default: [] },
    popular: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
}, {
    timestamps: true
});

if (process.env.NODE_ENV === 'development' && mongoose.models.Plan) {
    delete mongoose.models.Plan;
}

const Plan: Model<IPlan> = mongoose.models.Plan || mongoose.model<IPlan>('Plan', PlanSchema);

export default Plan;
