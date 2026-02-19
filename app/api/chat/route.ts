import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { processMessage, ChatMessage } from '@/lib/claude';
import { createSystemQuickBaseClient } from '@/lib/quickbase';
import { generateConversationTitle } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT API ENDPOINT
// Handles chat messages and AI responses
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { message, conversationId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get or create user
    let user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
        },
      });
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId: user.id,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20, // Last 20 messages for context
          },
        },
      });

      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }
    } else {
      // Create new conversation
      conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          title: generateConversationTitle(message),
        },
        include: {
          messages: true,
        },
      });
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    // Build conversation history for AI context
    const conversationHistory: ChatMessage[] = conversation.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Create QuickBase client (using system token for now)
    // In production, you'd use the user's QuickBase token
    const qbClient = createSystemQuickBaseClient();

    // Process message with AI
    const result = await processMessage(message, qbClient, conversationHistory);

    // Save assistant response
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: result.response,
        quickbaseQuery: result.queryExecuted,
        queryResults: result.queryResults ? JSON.stringify(result.queryResults) : null,
      },
    });

    // Update conversation title if it's the first message
    if (conversation.messages.length === 0) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { title: generateConversationTitle(message) },
      });
    }

    return NextResponse.json({
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: result.response,
        createdAt: assistantMessage.createdAt,
      },
      conversationId: conversation.id,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    
    return NextResponse.json(
      { error: 'Failed to process message. Please try again.' },
      { status: 500 }
    );
  }
}
