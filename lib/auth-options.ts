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

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    },
  },

  pages: {
    signIn: '/',
    error: '/auth/error',
  },

  callbacks: {
    async redirect({ url, baseUrl }) {
      // After sign in, always redirect to /chat
      if (url.startsWith(baseUrl)) {
        return `${baseUrl}/chat`;
      }
      return baseUrl;
    },

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

  debug: true, // Enable debug for now to see what's happening
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

