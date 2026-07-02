import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDealerVehiclePrice extends Document {
    variationId: mongoose.Types.ObjectId;
    concessionariaId: mongoose.Types.ObjectId;
    preco?: number | null;
    frete?: number | null;
    coresDisponiveis?: string[];
    observacoes?: string;
    operador?: string;
    statusVeiculo?: string;
    quantidade?: number;
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
    statusVeiculo: { type: String },
    quantidade: { type: Number, min: 0, default: 0 },
    ativo: { type: Boolean, default: false, index: true },
}, {
    timestamps: true,
});

DealerVehiclePriceSchema.index({ variationId: 1, concessionariaId: 1 }, { unique: true });
DealerVehiclePriceSchema.index({ concessionariaId: 1, ativo: 1, updatedAt: -1 });
DealerVehiclePriceSchema.index({ variationId: 1, ativo: 1 });

DealerVehiclePriceSchema.pre('save', function setActiveFromPrice() {
    const doc = this as unknown as IDealerVehiclePrice;
    const isNowActive = typeof doc.preco === 'number' && doc.preco > 0;
    doc.ativo = isNowActive;
    if (isNowActive && (!doc.quantidade || doc.quantidade < 1)) {
        doc.quantidade = 1;
    } else if (!isNowActive) {
        doc.quantidade = 0;
    }
});

DealerVehiclePriceSchema.pre('findOneAndUpdate', function setActiveOnUpdate() {
    const update = this.getUpdate() as any;
    const $set = update?.$set || {};

    if (Object.prototype.hasOwnProperty.call($set, 'preco')) {
        const isNowActive = typeof $set.preco === 'number' && $set.preco > 0;
        $set.ativo = isNowActive;
        if (isNowActive && !$set.quantidade && (!update.$inc || !update.$inc.quantidade)) {
            // Need to check current doc to see if we should set to 1, but findOneAndUpdate doesn't have doc access easily here.
            // A safer approach: if they explicitly pass preco > 0, we can't blindly set quantity to 1 if it already was e.g. 5.
            // But we can do this logic in the route.ts instead of mongoose hooks for update.
            // For now, if it's inactive, we zero it.
            if (!isNowActive) {
                $set.quantidade = 0;
            }
        }
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
