import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { adminAuth } from '../../../lib/firebase-admin'

export const authOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        })
    ],
    callbacks: {
        async jwt({ token, account, user }: any) {
            if (account && user?.email) {
                try {
                    // Create or get user in Firebase Auth using Admin SDK
                    let firebaseUser;
                    try {
                        firebaseUser = await adminAuth.getUserByEmail(user.email);
                    } catch (error) {
                        // User doesn't exist, create them
                        firebaseUser = await adminAuth.createUser({
                            email: user.email,
                            displayName: user.name || '',
                            photoURL: user.image || '',
                            emailVerified: true
                        });
                    }

                    token.firebaseUid = firebaseUser.uid;
                    token.email = user.email;
                    token.name = user.name;
                    token.profile = 'operator'; // Default profile
                } catch (error) {
                    console.error('Firebase Admin Error:', error);
                }
            }
            return token
        },
        async session({ session, token }: any) {
            if (token) {
                session.user.uid = token.firebaseUid as string;
                session.user.email = token.email as string;
                session.user.name = token.name as string;
                session.user.profile = token.profile as string;
            }
            return session
        },
        async redirect({ url, baseUrl }: any) {
            // Redireciona baseado no tipo de usuário
            // Por enquanto, vamos para /dashboard/operator como padrão
            if (url.startsWith(baseUrl)) return url
            return `${baseUrl}/dashboard/operator`
        }
    },
    pages: {
        signIn: '/',
        error: '/',
    }
}

export default NextAuth(authOptions)