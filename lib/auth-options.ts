import { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';

// ═══════════════════════════════════════════════════════════════════════════════
// NEXTAUTH CONFIGURATION
// Azure AD authentication - JWT only (no database required)
// ═══════════════════════════════════════════════════════════════════════════════

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID,
      authorization: {
        params: {
          scope: 'openid profile email',
        },
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  pages: {
    signIn: '/',
    error: '/auth/error',
  },

  callbacks: {
    jwt({ token, user, account }) {
      // Initial sign in - add user info to token
      if (account && user) {
        token.accessToken = account.access_token;
        token.userId = user.id ?? user.email ?? undefined;
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? token.email ?? '');
        session.accessToken = String(token.accessToken ?? '');
      }
      return session;
    },

    signIn() {
      return true;
    },
  },

  debug: process.env.NODE_ENV === 'development',
};

// Type augmentation for NextAuth
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    accessToken?: string;
  }

  interface User {
    id: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    accessToken?: string;
  }
}

