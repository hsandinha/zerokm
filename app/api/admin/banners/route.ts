import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Banner from '@/models/Banner';
import { deactivateExpiredBanners } from '@/lib/services/bannerService';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        // @ts-ignore
        const profile = session?.user?.profile;
        if (!session?.user || (profile !== 'admin' && profile !== 'administrador' && profile !== 'administrativo')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const statusFilter = searchParams.get('status') || 'all';
        const skip = (page - 1) * limit;

        await connectDB();
        await deactivateExpiredBanners();

        const query: any = {};
        if (statusFilter === 'pending') {
            query.status = 'pending';
        } else if (statusFilter === 'awaiting_payment') {
            query.status = 'awaiting_payment';
        } else if (statusFilter === 'expired') {
            query.status = 'expired';
        } else if (statusFilter === 'active') {
            query.isActive = true;
            query.status = { $nin: ['pending', 'awaiting_payment', 'expired', 'rejected'] };
        } else if (statusFilter === 'inactive') {
            query.isActive = false;
            query.status = { $nin: ['pending', 'awaiting_payment', 'expired', 'rejected'] };
        }

        const totalCount = await Banner.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);

        const banners = await Banner.find(query)
            .sort({ order: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return NextResponse.json({
            banners,
            currentPage: page,
            totalPages,
            totalCount
        });
    } catch (error: any) {
        console.error('Error fetching banners:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        // @ts-ignore
        if (!session?.user || (session.user.profile !== 'admin' && session.user.profile !== 'administrador' && session.user.profile !== 'administrativo')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        await connectDB();

        const allOrders = await Banner.find({}, { order: 1 }).lean() as any[];
        const maxOrder = allOrders.reduce((max, b) => Math.max(max, b.order || 0), 0);
        const nextOrder = allOrders.length > 0 ? maxOrder + 1 : 0;

        const newBanner = await Banner.create({
            title: body.title,
            imageUrl: body.imageUrl,
            linkUrl: body.linkUrl,
            isActive: body.isActive !== undefined ? body.isActive : true,
            order: body.order ?? nextOrder,
            dealershipId: body.dealershipId || null,
            vehicleId: body.vehicleId || null,
            badge: body.badge,
            price: body.price,
            priceSubtitle: body.priceSubtitle,
            vehicleModel: body.vehicleModel,
            storeName: body.storeName,
            year: body.year,
            color: body.color,
            fuel: body.fuel,
            delivery: body.delivery,
            statusCondition: body.statusCondition,
            ctaText: body.ctaText,
            expiresAt: body.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        return NextResponse.json(newBanner);
    } catch (error: any) {
        console.error('Error creating banner:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
