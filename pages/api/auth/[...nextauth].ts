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
            if (account && user) {
                token.email = user.email;
                token.name = user.name;
                token.image = user.image;
                token.profile = 'operator'; // Default profile
            }
            return token
        },
        async session({ session, token }: any) {
            if (token && session.user) {
                session.user.email = token.email as string;
                session.user.name = token.name as string;
                session.user.image = token.image as string;
                session.user.profile = token.profile as string;
            }
            return session
        }
    },
    pages: {
        signIn: '/'
    },
    session: {
        strategy: 'jwt'
    }
}

export default NextAuth(authOptions)