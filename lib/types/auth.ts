export type UserProfile = 'concessionaria' | 'operador' | 'administrador' | 'cliente' | 'operator' | 'dealership' | 'admin' | 'gerente';

// NextAuth session extension
declare module "next-auth" {
    interface Session {
        user: {
            uid?: string;
            email?: string;
            name?: string;
            image?: string;
            profile?: UserProfile;
            canViewLocation?: boolean;
        }
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        firebaseUid?: string;
        profile?: UserProfile;
    }
}