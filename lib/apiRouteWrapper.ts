import { NextResponse, NextRequest } from 'next/server';
import { getServerSession, Session } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';

type RouteHandler = (
    request: any,
    context: { params?: any; session: Session }
) => Promise<NextResponse> | NextResponse;

interface RouteOptions {
    allowedProfiles?: string[];
    requireAuth?: boolean;
    requireDB?: boolean;
}

export function withApiRoute(handler: RouteHandler, options: RouteOptions = {}) {
    const { allowedProfiles, requireAuth = true, requireDB = true } = options;

    return async (request: Request, context: any) => {
        try {
            if (requireDB) {
                await connectDB();
            }

            let session: Session | null = null;
            if (requireAuth) {
                session = await getServerSession(authOptions);
                if (!session || !session.user) {
                    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                }

                if (allowedProfiles && allowedProfiles.length > 0) {
                    const profile = session.user.profile as string;
                    if (!allowedProfiles.includes(profile)) {
                        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                    }
                }
            }

            return await handler(request, { ...context, session: session! });
        } catch (error: any) {
            console.error('API Route Error:', error);
            return NextResponse.json(
                { error: 'Internal Server Error', details: error.message },
                { status: 500 }
            );
        }
    };
}
