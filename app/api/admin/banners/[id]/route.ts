import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Banner from '@/models/Banner';
import { BANNER_DURATION_MS } from '@/lib/services/bannerService';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        // @ts-ignore
        if (!session?.user || (session.user.profile !== 'admin' && session.user.profile !== 'administrador')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        await connectDB();

        const { id } = await params;

        // Editar, aprovar ou reativar reinicia o timer de 24h; apenas ocultar/rejeitar mantém o prazo
        const isDeactivating = body.isActive === false || body.status === 'rejected';
        if (!isDeactivating && body.expiresAt === undefined) {
            body.expiresAt = new Date(Date.now() + BANNER_DURATION_MS);
            if (body.isActive === true && body.status === undefined) body.status = 'active';
        }

        const updatedBanner = await Banner.findByIdAndUpdate(
            id,
            { $set: body },
            { new: true }
        );

        if (!updatedBanner) {
            return NextResponse.json({ error: 'Banner not found' }, { status: 404 });
        }

        return NextResponse.json(updatedBanner);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        // @ts-ignore
        if (!session?.user || (session.user.profile !== 'admin' && session.user.profile !== 'administrador')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        
        const { id } = await params;

        const deletedBanner = await Banner.findByIdAndDelete(id);

        if (!deletedBanner) {
            return NextResponse.json({ error: 'Banner not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
