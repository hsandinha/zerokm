import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Banner from '@/models/Banner';
import { deactivateExpiredBanners } from '@/lib/services/bannerService';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        await deactivateExpiredBanners();
        const banners = await Banner.find({ dealershipId: session.user.uid }).lean() as any[];
        
        // Sort in memory to bypass MongoDB 32MB sort limit
        banners.sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        return NextResponse.json(banners);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
