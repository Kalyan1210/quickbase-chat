'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Suspense } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ERROR PAGE
// Displays authentication errors with helpful messages
// ═══════════════════════════════════════════════════════════════════════════════

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: Record<string, { title: string; description: string }> = {
    Configuration: {
      title: 'Configuration Error',
      description: 'There is a problem with the server configuration. Please contact your administrator.',
    },
    AccessDenied: {
      title: 'Access Denied',
      description: 'You do not have permission to access this application. Please contact your administrator.',
    },
    Verification: {
      title: 'Verification Error',
      description: 'The verification link may have expired or already been used.',
    },
    Default: {
      title: 'Authentication Error',
      description: 'An error occurred during authentication. Please try again.',
    },
  };

  const errorInfo = errorMessages[error || 'Default'] || errorMessages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-950">
      <div className="absolute inset-0 bg-gradient-mesh opacity-50" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-md w-full text-center"
      >
        {/* Error Icon */}
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-bold text-white mb-3">
          {errorInfo.title}
        </h1>
        <p className="text-surface-400 mb-8">
          {errorInfo.description}
        </p>

        {/* Error Code */}
        {error && (
          <p className="text-xs text-surface-500 mb-6 font-mono bg-surface-800/50 inline-block px-3 py-1 rounded">
            Error code: {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="btn-secondary px-6 py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary px-6 py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}

