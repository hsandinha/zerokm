import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILeadTask extends Document {
    leadId: mongoose.Types.ObjectId;
    // Mesmo escopo do lead: `null` = pipeline global. Ver lib/utils/crmScope.ts.
    concessionariaId?: mongoose.Types.ObjectId | null;
    title: string;
    dueAt: Date;
    done: boolean;
    doneAt?: Date | null;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const LeadTaskSchema: Schema = new Schema({
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    concessionariaId: { type: Schema.Types.ObjectId, ref: 'Concessionaria', default: null },
    title: { type: String, required: true, trim: true },
    dueAt: { type: Date, required: true },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    createdBy: { type: String }
}, {
    timestamps: true
});

// Tarefas de um lead, em ordem de vencimento.
LeadTaskSchema.index({ leadId: 1, dueAt: 1 });
// Agenda de follow-ups pendentes do escopo (badge do quadro e visões futuras).
LeadTaskSchema.index({ concessionariaId: 1, done: 1, dueAt: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.LeadTask) {
    delete mongoose.models.LeadTask;
}

const LeadTask: Model<ILeadTask> = mongoose.models.LeadTask || mongoose.model<ILeadTask>('LeadTask', LeadTaskSchema);

export default LeadTask;
