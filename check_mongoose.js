require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

// Definir o schema manual aqui
const BannerSchema = new mongoose.Schema({
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    dealershipId: { type: String },
    status: { type: String, enum: ['active', 'pending', 'rejected', 'awaiting_payment'], default: 'active' },
    expiresAt: { type: Date },
    paymentId: { type: String },
}, { timestamps: true });

const Banner = mongoose.models.Banner || mongoose.model('Banner', BannerSchema);

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    console.log("Banners using Mongoose:", JSON.stringify(banners, null, 2));
    process.exit(0);
}
check();
