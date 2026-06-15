import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Plan from '@/models/Plan';

export async function GET() {
    try {
        await connectDB();
        const plans = await Plan.find({}).sort({ createdAt: -1 });
        return NextResponse.json(plans.map(p => {
            const obj = p.toObject();
            return { ...obj, id: p._id.toString(), _id: undefined, popular: obj.popular ?? false };
        }));
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['administrador', 'admin'].includes(session.user?.profile as string)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await connectDB();
        const body = await request.json();
        const plan = await Plan.create(body);
        return NextResponse.json({ ...plan.toObject(), id: plan._id.toString(), _id: undefined }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
