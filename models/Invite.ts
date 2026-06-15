import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInvite extends Document {
    inviterId: mongoose.Types.ObjectId;
    inviteeName: string;
    inviteeEmail: string;
    inviteePhone?: string;
    inviteeUserId?: mongoose.Types.ObjectId;
    status: 'pending' | 'accepted' | 'cancelled';
    monthlyPrice: number;
    createdAt: Date;
    updatedAt: Date;
}

const InviteSchema: Schema = new Schema({
    inviterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inviteeName: { type: String, required: true },
    inviteeEmail: { type: String, required: true },
    inviteePhone: { type: String },
    inviteeUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'cancelled'], default: 'pending' },
    monthlyPrice: { type: Number, required: true, default: 0 },
}, {
    timestamps: true,
});

if (process.env.NODE_ENV === 'development' && mongoose.models.Invite) {
    delete mongoose.models.Invite;
}

const Invite: Model<IInvite> = mongoose.models.Invite || mongoose.model<IInvite>('Invite', InviteSchema);

export default Invite;
