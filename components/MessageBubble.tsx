'use client';

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { User, Sparkles, Copy, Check } from 'lucide-react';
import { useState, useMemo } from 'react';
import { formatTime } from '@/lib/utils';
import type { Message } from './ChatLayout';
import { FeedbackButtons } from './FeedbackButtons';

/**
 * Fix malformed markdown tables that are on a single line
 */
function fixMarkdownTables(text: string): string {
  // Look for patterns like: | Col | Col | |---| | Val | Val |
  // These happen when AI generates tables without proper newlines
  
  // First, try to fix tables where separator is immediately after headers
  let fixed = text.replace(
    /(\|[^\n|]+(?:\|[^\n|]+)+\|)\s*(\|[-:]+(?:\|[-:]+)+\|)/g,
    '$1\n$2'
  );
  
  // Then fix rows that follow the separator
  fixed = fixed.replace(
    /(\|[-:]+(?:\|[-:]+)+\|)\s*(\|[^\n]+)/g,
    (match, sep, firstRow) => {
      // Split remaining content by pattern that looks like row boundaries
      const rows = firstRow.split(/\|\s*(?=\|)/).filter((r: string) => r.trim());
      if (rows.length > 1) {
        return sep + '\n' + rows.map((r: string) => r.trim()).join('\n');
      }
      return sep + '\n' + firstRow.trim();
    }
  );
  
  return fixed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE COMPONENT
// Individual chat message display
// ═══════════════════════════════════════════════════════════════════════════════

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  previousUserMessage?: string; // For feedback context
}

export function MessageBubble({ message, isLast, previousUserMessage }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  
  // Fix any malformed markdown tables in the content
  const processedContent = useMemo(() => {
    if (isUser) return message.content;
    return fixMarkdownTables(message.content);
  }, [message.content, isUser]);

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
                {processedContent}
              </ReactMarkdown>
              
              {/* Feedback Buttons - Only show for assistant messages */}
              {previousUserMessage && (
                <FeedbackButtons
                  question={previousUserMessage}
                  response={message.content}
                />
              )}
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

