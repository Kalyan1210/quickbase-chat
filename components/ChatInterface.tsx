'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Database, HelpCircle } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import type { Message } from './ChatLayout';

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT INTERFACE COMPONENT
// Message display and input area
// ═══════════════════════════════════════════════════════════════════════════════

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
}

const exampleQuestions = [
  {
    icon: Database,
    text: "How many students are enrolled?",
    color: "text-brand-400",
  },
  {
    icon: Sparkles,
    text: "Show me enrollment trends this month",
    color: "text-accent-400",
  },
  {
    icon: HelpCircle,
    text: "What data is available?",
    color: "text-emerald-400",
  },
];

export function ChatInterface({ messages, isLoading, onSendMessage }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleExampleClick = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          // Empty State
          <div className="h-full flex flex-col items-center justify-center p-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center max-w-2xl"
            >
              {/* Logo */}
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-500/20">
                <Sparkles className="w-10 h-10 text-white" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-3">
                Welcome to Early Education Chat
              </h2>
              <p className="text-surface-400 mb-8 max-w-md mx-auto">
                Ask me anything about your Early Education data. I can help you find
                information, generate reports, and answer questions.
              </p>

              {/* Example Questions */}
              <div className="grid sm:grid-cols-3 gap-3 max-w-xl mx-auto">
                {exampleQuestions.map((example, index) => (
                  <motion.button
                    key={example.text}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + index * 0.1 }}
                    onClick={() => handleExampleClick(example.text)}
                    className="p-4 glass rounded-xl text-left hover:bg-surface-800/50 transition-all group"
                  >
                    <example.icon className={`w-5 h-5 ${example.color} mb-2`} />
                    <p className="text-sm text-surface-300 group-hover:text-white transition-colors">
                      {example.text}
                    </p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          // Messages List
          <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
            <AnimatePresence mode="popLayout">
              {messages.map((message, index) => {
                // Find the previous user message for feedback context
                let previousUserMessage: string | undefined;
                if (message.role === 'assistant') {
                  // Look backwards for the most recent user message
                  for (let i = index - 1; i >= 0; i--) {
                    if (messages[i].role === 'user') {
                      previousUserMessage = messages[i].content;
                      break;
                    }
                  }
                }
                
                return (
                  <MessageBubble 
                    key={message.id} 
                    message={message}
                    isLast={index === messages.length - 1}
                    previousUserMessage={previousUserMessage}
                  />
                );
              })}
            </AnimatePresence>

            {/* Loading Indicator */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-4"
              >
                <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="message-assistant rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-surface-800/50 p-4 bg-surface-950/80 backdrop-blur-lg">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative input-glow rounded-2xl bg-surface-800/50 border border-surface-700/50">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me about your Early Education data..."
              className="w-full px-4 py-3 pr-14 bg-transparent text-white placeholder:text-surface-500 resize-none focus:outline-none rounded-2xl min-h-[52px] max-h-[200px]"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`
                absolute right-2 bottom-2 p-2.5 rounded-xl transition-all
                ${input.trim() && !isLoading
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/20'
                  : 'bg-surface-700/50 text-surface-500 cursor-not-allowed'
                }
              `}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-surface-500 mt-2 text-center">
            Press Enter to send, Shift + Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}

