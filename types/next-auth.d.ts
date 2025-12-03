import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            id: string
            profile?: string
            allowedProfiles?: string[]
            canViewLocation?: boolean
        } & DefaultSession["user"]
    }

    interface User {
        id: string
        profile?: string
        allowedProfiles?: string[]
        selectedProfile?: string
        canViewLocation?: boolean
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        profile?: string
        allowedProfiles?: string[]
    }
}