import { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { SessionStrategy } from 'next-auth'
import { adminAuth } from '@/lib/firebase-admin'
import { getUserAllowedProfiles } from '@/lib/services/userService'

export const authOptions: AuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        }),
        CredentialsProvider({
            name: 'Credentials',
            credentials: {},
            async authorize(credentials): Promise<any> {
                const { token, selectedProfile } = credentials as any;
                if (token) {
                    try {
                        const decodedToken = await adminAuth.verifyIdToken(token);
                        const { profiles } = await getUserAllowedProfiles(decodedToken.email || '');

                        return {
                            id: decodedToken.uid,
                            email: decodedToken.email,
                            name: decodedToken.name || decodedToken.email?.split('@')[0],
                            image: decodedToken.picture,
                            selectedProfile: selectedProfile, // Pass selected profile to user object
                            allowedProfiles: profiles
                        }
                    } catch (error) {
                        console.error('Erro ao verificar token:', error);
                        return null;
                    }
                }
                return null;
            }
        })
    ],
    callbacks: {
        async jwt({ token, account, user, trigger, session }: any) {
            if (account && user) {
                token.email = user.email;
                token.name = user.name;
                token.image = user.image;
                token.allowedProfiles = user.allowedProfiles;

                // Use the selected profile passed from authorize, or fallback to logic
                if (user.selectedProfile) {
                    token.profile = user.selectedProfile;
                } else {
                    // Fallback logic
                    let profile = 'operador';
                    const email = user.email || '';

                    if (email.includes('admin')) {
                        profile = 'administrador';
                    } else if (email.includes('dealership') || email.includes('concessionaria')) {
                        profile = 'concessionaria';
                    } else if (email.includes('client') || email.includes('cliente')) {
                        profile = 'cliente';
                    }
                    token.profile = profile;
                }
            }

            // Handle profile update
            if (trigger === "update" && session?.profile) {
                // Verify if the requested profile is allowed
                if (token.allowedProfiles?.includes(session.profile)) {
                    token.profile = session.profile;
                }
            }

            return token
        },
        async session({ session, token }: any) {
            if (token && session.user) {
                session.user.email = token.email as string;
                session.user.name = token.name as string;
                session.user.image = token.image as string;
                session.user.profile = token.profile as string;
                session.user.allowedProfiles = token.allowedProfiles as string[];
            }
            return session
        }
    },
    pages: {
        signIn: '/'
    },
    session: {
        strategy: 'jwt' as SessionStrategy
    }
}
