import mongoose, { Schema, Document, Model } from 'mongoose';
import { LOST_REASON_VALUES, LostReason } from '@/lib/utils/crmFunnel';

export interface ILead extends Document {
    name: string;
    phone: string;
    email?: string;
    source?: string;
    campaign?: string;
    /** Origem reconhecida a partir da frase inicial. Ver lib/utils/leadTags.ts. */
    tags: string[];
    /** Frase inicial recebida na integração — é dela que as tags são derivadas. */
    firstMessage?: string;
    stageId: mongoose.Types.ObjectId;
    ownerId?: mongoose.Types.ObjectId | null;
    ownerName?: string;
    /** Obrigatório quando o lead entra numa fase do tipo `lost`. */
    lostReason?: LostReason | null;
    lostReasonNote?: string;
    // `null` = pipeline global (admin/marketing). Ver lib/utils/crmScope.ts.
    concessionariaId?: mongoose.Types.ObjectId | null;
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
    tags: { type: [String], default: [] },
    firstMessage: { type: String },
    stageId: { type: Schema.Types.ObjectId, ref: 'LeadStage', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ownerName: { type: String },
    lostReason: { type: String, enum: [...LOST_REASON_VALUES, null], default: null },
    lostReasonNote: { type: String },
    concessionariaId: { type: Schema.Types.ObjectId, ref: 'Concessionaria' },
    notes: { type: String },
    ativo: { type: Boolean, default: true }
}, {
    timestamps: true
});

// Filtro temporal + escopo: base do quadro e dos relatórios.
LeadSchema.index({ concessionariaId: 1, createdAt: -1 });
LeadSchema.index({ concessionariaId: 1, tags: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.Lead) {
    delete mongoose.models.Lead;
}

const Lead: Model<ILead> = mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema);

export default Lead;
