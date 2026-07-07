import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Banner from '@/models/Banner';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        // @ts-ignore
        if (!session?.user || (session.user.profile !== 'admin' && session.user.profile !== 'administrador')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
        return NextResponse.json(banners);
    } catch (error: any) {
        console.error('Error fetching banners:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        // @ts-ignore
        if (!session?.user || (session.user.profile !== 'admin' && session.user.profile !== 'administrador')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        await connectDB();

        const lastBanner = await Banner.findOne().sort({ order: -1 });
        const nextOrder = lastBanner ? lastBanner.order + 1 : 0;

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
