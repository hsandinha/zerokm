import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Aviso geral para os assinantes ("Confira o novo campo ORÇAMENTO", "Agora o
 * CNV tem RENAVE"). Criado por Administrador e Administrativo; aparece uma vez
 * para cada pessoa do público escolhido, até ela marcar como lido.
 */
export type PublicoAviso = 'clientes' | 'concessionarias' | 'todos';

export interface IAviso extends Document {
    titulo: string;
    mensagem: string;
    publico: PublicoAviso;
    linkUrl?: string;
    linkTexto?: string;
    ativo: boolean;
    inicio?: Date | null;
    fim?: Date | null;
    criadoPor?: string;
    createdAt: Date;
    updatedAt: Date;
}

const AvisoSchema = new Schema<IAviso>({
    titulo: { type: String, required: true, trim: true, maxlength: 120 },
    mensagem: { type: String, required: true, trim: true, maxlength: 2000 },
    publico: { type: String, enum: ['clientes', 'concessionarias', 'todos'], default: 'clientes', index: true },
    linkUrl: { type: String, trim: true },
    linkTexto: { type: String, trim: true, maxlength: 40 },
    ativo: { type: Boolean, default: true, index: true },
    inicio: { type: Date, default: null },
    fim: { type: Date, default: null },
    criadoPor: { type: String },
}, { timestamps: true });

if (process.env.NODE_ENV === 'development' && mongoose.models.Aviso) {
    delete mongoose.models.Aviso;
}

const Aviso: Model<IAviso> = mongoose.models.Aviso || mongoose.model<IAviso>('Aviso', AvisoSchema);
export default Aviso;
