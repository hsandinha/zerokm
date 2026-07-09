import mongoose, { Schema, Document, Model } from 'mongoose';
import { LEAD_STAGE_TYPES, LeadStageType } from '@/lib/utils/crmFunnel';

export interface ILeadStage extends Document {
    name: string;
    order: number;
    color?: string;
    /** Semântica da fase. Sem isso nenhum relatório sabe o que é proposta, venda ou perda. */
    type: LeadStageType;
    // `null` = pipeline global (admin/marketing). Ver lib/utils/crmScope.ts.
    concessionariaId?: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

const LeadStageSchema: Schema = new Schema({
    name: { type: String, required: true },
    order: { type: Number, required: true },
    color: { type: String, default: '#E5E7EB' }, // Default grayish color
    type: { type: String, enum: LEAD_STAGE_TYPES, default: 'open' },
    concessionariaId: { type: Schema.Types.ObjectId, ref: 'Concessionaria' }
}, {
    timestamps: true
});

if (process.env.NODE_ENV === 'development' && mongoose.models.LeadStage) {
    delete mongoose.models.LeadStage;
}

const LeadStage: Model<ILeadStage> = mongoose.models.LeadStage || mongoose.model<ILeadStage>('LeadStage', LeadStageSchema);

export default LeadStage;
