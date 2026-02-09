'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ChatLayout } from '@/components/ChatLayout';

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT PAGE
// Main chat interface with sidebar and message area
// ═══════════════════════════════════════════════════════════════════════════════

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <ChatLayout user={session.user} />;
}

