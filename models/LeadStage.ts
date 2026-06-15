import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILeadStage extends Document {
    name: string;
    order: number;
    color?: string;
    concessionariaId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const LeadStageSchema: Schema = new Schema({
    name: { type: String, required: true },
    order: { type: Number, required: true },
    color: { type: String, default: '#E5E7EB' }, // Default grayish color
    concessionariaId: { type: Schema.Types.ObjectId, ref: 'Concessionaria' }
}, {
    timestamps: true
});

if (process.env.NODE_ENV === 'development' && mongoose.models.LeadStage) {
    delete mongoose.models.LeadStage;
}

const LeadStage: Model<ILeadStage> = mongoose.models.LeadStage || mongoose.model<ILeadStage>('LeadStage', LeadStageSchema);

export default LeadStage;
