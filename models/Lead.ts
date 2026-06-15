import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILead extends Document {
    name: string;
    phone: string;
    email?: string;
    source?: string;
    campaign?: string;
    stageId: mongoose.Types.ObjectId;
    concessionariaId?: mongoose.Types.ObjectId;
    notes?: string;
    ativo: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const LeadSchema: Schema = new Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    source: { type: String },
    campaign: { type: String },
    stageId: { type: Schema.Types.ObjectId, ref: 'LeadStage', required: true },
    concessionariaId: { type: Schema.Types.ObjectId, ref: 'Concessionaria' },
    notes: { type: String },
    ativo: { type: Boolean, default: true }
}, {
    timestamps: true
});

if (process.env.NODE_ENV === 'development' && mongoose.models.Lead) {
    delete mongoose.models.Lead;
}

const Lead: Model<ILead> = mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema);

export default Lead;
