import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Banner from '@/models/Banner';
import { deactivateExpiredBanners } from '@/lib/services/bannerService';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await connectDB();

        // Inativa banners vencidos antes de listar
        await deactivateExpiredBanners();

        // Retorna todos os banners ativos, ordenados pelo campo 'order'
        const banners = await Banner.find({
            isActive: true,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }).sort({ order: 1, createdAt: -1 });
        
        return NextResponse.json(banners);
    } catch (error: any) {
        console.error('Error fetching public banners:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
