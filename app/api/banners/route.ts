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
        }).lean() as any[];

        // Sort in memory to bypass MongoDB 32MB sort limit
        banners.sort((a, b) => {
            if (a.order !== b.order) return (a.order || 0) - (b.order || 0);
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        
        return NextResponse.json(banners);
    } catch (error: any) {
        console.error('Error fetching public banners:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
