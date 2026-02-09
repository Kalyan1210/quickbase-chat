'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  MoreHorizontal,
  Search,
  Sparkles
} from 'lucide-react';
import { formatDate, truncate } from '@/lib/utils';
import type { Conversation } from './ChatLayout';

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENT
// Conversation list and navigation
// ═══════════════════════════════════════════════════════════════════════════════

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function Sidebar({
  conversations,
  currentConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group conversations by date
  const groupedConversations = filteredConversations.reduce((groups, conv) => {
    const date = new Date(conv.updatedAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    let group: string;
    if (date.toDateString() === today.toDateString()) {
      group = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      group = 'Yesterday';
    } else if (date > lastWeek) {
      group = 'This Week';
    } else {
      group = 'Older';
    }

    if (!groups[group]) groups[group] = [];
    groups[group].push(conv);
    return groups;
  }, {} as Record<string, Conversation[]>);

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Older'];

  return (
    <div className="w-72 h-full glass-dark border-r border-surface-800/50 flex flex-col">
      {/* New Chat Button */}
      <div className="p-4">
        <button
          onClick={onNewConversation}
          className="w-full btn-primary py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-800/50 border border-surface-700/50 rounded-lg text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500/50"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-12 h-12 rounded-full bg-surface-800/50 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-surface-500" />
            </div>
            <p className="text-sm text-surface-400">
              {searchQuery ? 'No conversations found' : 'Start a new conversation'}
            </p>
          </div>
        ) : (
          groupOrder.map(group => {
            const convs = groupedConversations[group];
            if (!convs || convs.length === 0) return null;

            return (
              <div key={group} className="mb-4">
                <p className="text-xs font-medium text-surface-500 uppercase tracking-wider px-3 mb-2">
                  {group}
                </p>
                <div className="space-y-1">
                  {convs.map(conversation => (
                    <motion.div
                      key={conversation.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative"
                      onMouseEnter={() => setHoveredId(conversation.id)}
                      onMouseLeave={() => {
                        setHoveredId(null);
                        setDeleteConfirmId(null);
                      }}
                    >
                      <button
                        onClick={() => onSelectConversation(conversation.id)}
                        className={`
                          w-full text-left px-3 py-2.5 rounded-lg transition-all
                          ${currentConversationId === conversation.id
                            ? 'bg-brand-500/20 border-l-2 border-brand-500'
                            : 'hover:bg-surface-800/50'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            currentConversationId === conversation.id 
                              ? 'text-brand-400' 
                              : 'text-surface-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${
                              currentConversationId === conversation.id 
                                ? 'text-white font-medium' 
                                : 'text-surface-300'
                            }`}>
                              {truncate(conversation.title, 30)}
                            </p>
                            <p className="text-xs text-surface-500 mt-0.5">
                              {conversation.messageCount} messages
                            </p>
                          </div>
                        </div>
                      </button>

                      {/* Delete Button */}
                      <AnimatePresence>
                        {hoveredId === conversation.id && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                          >
                            {deleteConfirmId === conversation.id ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteConversation(conversation.id);
                                  setDeleteConfirmId(null);
                                }}
                                className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(conversation.id);
                                }}
                                className="p-1.5 rounded hover:bg-surface-700/50 text-surface-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-surface-800/50">
        <p className="text-xs text-surface-500 text-center">
          Powered by QuickBase &amp; Claude AI
        </p>
      </div>
    </div>
  );
}

