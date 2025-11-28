import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
    firebaseUid: string;
    email: string;
    displayName?: string;
    phoneNumber?: string;
    cpf?: string;
    allowedProfiles: string[];
    defaultProfile?: string;
    dealershipId?: string;
    forcePasswordChange: boolean;
    address?: {
        street: string;
        number: string;
        complement?: string;
        neighborhood: string;
        city: string;
        state: string;
        zipCode: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema: Schema = new Schema({
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    displayName: { type: String },
    phoneNumber: { type: String },
    cpf: { type: String },
    allowedProfiles: { type: [String], default: ['operador'] },
    defaultProfile: { type: String },
    dealershipId: { type: String },
    forcePasswordChange: { type: Boolean, default: false },
    address: {
        street: String,
        number: String,
        complement: String,
        neighborhood: String,
        city: String,
        state: String,
        zipCode: String
    }
}, {
    timestamps: true
});

// Prevent model recompilation error in development
const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
