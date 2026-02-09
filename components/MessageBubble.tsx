'use client';

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { User, Sparkles, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { formatTime } from '@/lib/utils';
import type { Message } from './ChatLayout';

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE COMPONENT
// Individual chat message display
// ═══════════════════════════════════════════════════════════════════════════════

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
}

export function MessageBubble({ message, isLast }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-start gap-4 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
        ${isUser 
          ? 'bg-surface-700' 
          : 'bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/20'
        }
      `}>
        {isUser ? (
          <User className="w-4 h-4 text-surface-300" />
        ) : (
          <Sparkles className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className={`
          relative group rounded-2xl px-4 py-3
          ${isUser 
            ? 'message-user rounded-tr-md' 
            : 'message-assistant rounded-tl-md'
          }
        `}>
          {/* Copy Button (for assistant messages) */}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-surface-700/50 transition-all"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-surface-400" />
              )}
            </button>
          )}

          {/* Message Text */}
          {isUser ? (
            <p className="text-white whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="markdown-content text-surface-200">
              <ReactMarkdown
                components={{
                  // Custom rendering for code blocks
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match;
                    
                    if (isInline) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                    
                    return (
                      <pre className="relative group/code">
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  },
                  // Custom table styling
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full">{children}</table>
                    </div>
                  ),
                  // Custom link styling
                  a: ({ children, href }) => (
                    <a 
                      href={href} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-brand-400 hover:text-brand-300 underline"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Timestamp */}
        <p className={`text-xs text-surface-500 mt-1 ${isUser ? 'text-right' : ''}`}>
          {formatTime(message.createdAt)}
        </p>
      </div>
    </motion.div>
  );
}

