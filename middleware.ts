import { withAuth } from 'next-auth/middleware';

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// Protects routes that require authentication
// ═══════════════════════════════════════════════════════════════════════════════

export default withAuth({
  pages: {
    signIn: '/',
  },
});

export const config = {
  matcher: ['/chat/:path*', '/api/chat/:path*', '/api/conversations/:path*'],
};

