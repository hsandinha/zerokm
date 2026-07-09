import mongoose, { Schema, Document, Model } from 'mongoose';

export type LeadEventType = 'created' | 'stage_changed';
export type LeadEventActor = 'user' | 'webhook';

export interface ILeadEvent extends Document {
    leadId: mongoose.Types.ObjectId;
    concessionariaId?: mongoose.Types.ObjectId | null;
    type: LeadEventType;
    fromStageId?: mongoose.Types.ObjectId | null;
    toStageId: mongoose.Types.ObjectId;
    actor: LeadEventActor;
    actorEmail?: string;
    /** Preenchido quando o destino é uma fase do tipo `lost`. Guardado no evento para que
     *  o relatório de motivos de perda não dependa do estado atual do lead. */
    lostReason?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const LeadEventSchema: Schema = new Schema({
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    concessionariaId: { type: Schema.Types.ObjectId, ref: 'Concessionaria', default: null },
    type: { type: String, enum: ['created', 'stage_changed'], required: true },
    fromStageId: { type: Schema.Types.ObjectId, ref: 'LeadStage', default: null },
    toStageId: { type: Schema.Types.ObjectId, ref: 'LeadStage', required: true },
    actor: { type: String, enum: ['user', 'webhook'], required: true },
    actorEmail: { type: String },
    lostReason: { type: String, default: null }
}, {
    timestamps: true
});

// Histórico de um lead, em ordem cronológica.
LeadEventSchema.index({ leadId: 1, createdAt: 1 });
// Quantos leads entraram na fase X, num período — base do Radar Comercial e dos relatórios.
LeadEventSchema.index({ concessionariaId: 1, toStageId: 1, createdAt: -1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.LeadEvent) {
    delete mongoose.models.LeadEvent;
}

const LeadEvent: Model<ILeadEvent> = mongoose.models.LeadEvent || mongoose.model<ILeadEvent>('LeadEvent', LeadEventSchema);

export default LeadEvent;
