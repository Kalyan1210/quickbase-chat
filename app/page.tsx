'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  Database,
  Shield,
  Zap,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// Beautiful landing page with Azure AD sign-in
// ═══════════════════════════════════════════════════════════════════════════════

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push('/chat');
    }
  }, [session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: MessageSquare,
      title: 'Natural Conversations',
      description: 'Ask questions in plain English and get instant answers from your data.',
    },
    {
      icon: Database,
      title: 'QuickBase Connected',
      description: 'Seamlessly query your Early Education app data in real-time.',
    },
    {
      icon: Shield,
      title: 'Secure Access',
      description: 'Azure AD authentication ensures only authorized users can access.',
    },
    {
      icon: Zap,
      title: 'AI-Powered',
      description: 'Claude AI understands context and provides intelligent responses.',
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-mesh" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-white">Early Education Chat</span>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-6xl w-full grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Side - Hero */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
                <span className="text-white">Talk to your</span>
                <br />
                <span className="text-gradient">QuickBase data</span>
              </h1>
              <p className="text-lg text-surface-400 mb-8 max-w-lg">
                Access your Early Education information through natural conversation. 
                Ask questions, get insights, and explore your data like never before.
              </p>

              <motion.button
                onClick={() => signIn('azure-ad', { callbackUrl: '/chat' })}
                className="btn-primary px-8 py-4 rounded-xl text-lg flex items-center gap-3 group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Sign in with Microsoft
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>

              <p className="text-sm text-surface-500 mt-4">
                Use your organization&apos;s Microsoft account to sign in securely.
              </p>
            </motion.div>

            {/* Right Side - Features */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid sm:grid-cols-2 gap-4"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                  className="glass rounded-2xl p-6 hover:bg-surface-800/60 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-brand-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-surface-400">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center text-sm text-surface-500">
          <p>Powered by QuickBase &amp; Claude AI</p>
        </footer>
      </div>
    </div>
  );
}

