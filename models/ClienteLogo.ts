import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Logo do lojista para o orçamento (cotação em PDF).
 *
 * Fica numa coleção própria, fora do User, para não pesar as listas que leem
 * todos os usuários (CRM, Equipe). É uma imagem pequena, redimensionada no
 * navegador antes do envio (ver lib/utils/logoImagem.ts), guardada como data URL
 * para o orçamento imprimir sem depender de outro serviço.
 *
 * Só a equipe grava: o cliente se cadastra sozinho, mas a logo é pedida depois
 * da assinatura e colocada por um funcionário.
 */
export interface IClienteLogo extends Document {
    userId: mongoose.Types.ObjectId;
    logo: string;
    atualizadoPor?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ClienteLogoSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    logo: { type: String, required: true },
    atualizadoPor: { type: String },
}, {
    timestamps: true,
});

if (process.env.NODE_ENV === 'development' && mongoose.models.ClienteLogo) {
    delete mongoose.models.ClienteLogo;
}

const ClienteLogo: Model<IClienteLogo> = mongoose.models.ClienteLogo || mongoose.model<IClienteLogo>('ClienteLogo', ClienteLogoSchema);

export default ClienteLogo;
