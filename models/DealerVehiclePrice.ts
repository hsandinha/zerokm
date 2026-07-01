import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDealerVehiclePrice extends Document {
    variationId: mongoose.Types.ObjectId;
    concessionariaId: mongoose.Types.ObjectId;
    preco?: number | null;
    frete?: number | null;
    coresDisponiveis?: string[];
    observacoes?: string;
    operador?: string;
    ativo: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const DealerVehiclePriceSchema: Schema = new Schema({
    variationId: {
        type: Schema.Types.ObjectId,
        ref: 'VehicleVariation',
        required: true,
        index: true,
    },
    concessionariaId: {
        type: Schema.Types.ObjectId,
        ref: 'Concessionaria',
        required: true,
        index: true,
    },
    preco: { type: Number, min: 0, default: null },
    frete: { type: Number, min: 0, default: null },
    coresDisponiveis: { type: [String], default: [] },
    observacoes: { type: String },
    operador: { type: String },
    ativo: { type: Boolean, default: false, index: true },
}, {
    timestamps: true,
});

DealerVehiclePriceSchema.index({ variationId: 1, concessionariaId: 1 }, { unique: true });
DealerVehiclePriceSchema.index({ concessionariaId: 1, ativo: 1, updatedAt: -1 });
DealerVehiclePriceSchema.index({ variationId: 1, ativo: 1 });

DealerVehiclePriceSchema.pre('save', function setActiveFromPrice() {
    const doc = this as unknown as IDealerVehiclePrice;
    doc.ativo = typeof doc.preco === 'number' && doc.preco > 0;
});

DealerVehiclePriceSchema.pre('findOneAndUpdate', function setActiveOnUpdate() {
    const update = this.getUpdate() as any;
    const $set = update?.$set || {};

    if (Object.prototype.hasOwnProperty.call($set, 'preco')) {
        $set.ativo = typeof $set.preco === 'number' && $set.preco > 0;
        update.$set = $set;
        this.setUpdate(update);
    }
});

if (process.env.NODE_ENV === 'development' && mongoose.models.DealerVehiclePrice) {
    delete mongoose.models.DealerVehiclePrice;
}

const DealerVehiclePrice: Model<IDealerVehiclePrice> =
    mongoose.models.DealerVehiclePrice || mongoose.model<IDealerVehiclePrice>('DealerVehiclePrice', DealerVehiclePriceSchema);

export default DealerVehiclePrice;
