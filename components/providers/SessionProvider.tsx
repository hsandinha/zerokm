'use client';

import { SessionProvider as NextAuthSessionProvider, useSession, signOut } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';

interface SessionProviderProps {
    children: ReactNode;
}

function SessionGuard({ children }: { children: ReactNode }) {
    const { data: session } = useSession();

    useEffect(() => {
        if (session?.error === 'SessionExpired') {
            signOut({ callbackUrl: '/', redirect: true });
        }
    }, [session]);

    return <>{children}</>;
}

export function SessionProvider({ children }: SessionProviderProps) {
    return (
        <NextAuthSessionProvider>
            <SessionGuard>
                {children}
            </SessionGuard>
        </NextAuthSessionProvider>
    );
}