import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { processMessage, ChatMessage } from '@/lib/claude';
import { createSystemQuickBaseClient } from '@/lib/quickbase';
import { generateConversationTitle } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACT EXTRACTION
// Converts query results to displayable artifacts (tables, charts)
// ═══════════════════════════════════════════════════════════════════════════════

interface Artifact {
  type: 'table' | 'bar' | 'pie' | 'line';
  title: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  data?: Array<{ name: string; value: number }>;
  source?: string;
}

function extractArtifacts(queryResults: unknown, provenance?: { source?: string }): Artifact[] {
  const artifacts: Artifact[] = [];
  
  if (!queryResults || typeof queryResults !== 'object') {
    return artifacts;
  }

  const results = queryResults as Record<string, unknown>;
  
  // Check for report data with records
  if (results.data && results.fields) {
    const data = results.data as Record<string, unknown>;
    if (data.records && Array.isArray(data.records) && data.records.length > 0) {
      const records = data.records as Record<string, unknown>[];
      const columns = Object.keys(records[0]);
      
      artifacts.push({
        type: 'table',
        title: provenance?.source || 'Query Results',
        columns,
        rows: records,
        source: provenance?.source,
      });

      // If there's a numeric column, create a bar chart
      const numericColumn = columns.find(col => 
        typeof records[0][col] === 'number'
      );
      const labelColumn = columns.find(col => 
        typeof records[0][col] === 'string' && col !== numericColumn
      );

      if (numericColumn && labelColumn && records.length <= 20) {
        artifacts.push({
          type: 'bar',
          title: `${numericColumn} by ${labelColumn}`,
          data: records.slice(0, 15).map(row => ({
            name: String(row[labelColumn] || 'Unknown').substring(0, 20),
            value: Number(row[numericColumn]) || 0,
          })),
          source: provenance?.source,
        });
      }
    }
  }

  // Check for list records result
  if (results.records && Array.isArray(results.records) && results.records.length > 0) {
    const records = results.records as Record<string, unknown>[];
    const columns = Object.keys(records[0]);
    
    artifacts.push({
      type: 'table',
      title: provenance?.source || 'Records',
      columns,
      rows: records,
      source: provenance?.source,
    });
  }

  return artifacts;
}

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

    // Extract artifacts from query results
    const artifacts = extractArtifacts(result.queryResults, result.provenance);

    return NextResponse.json({
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: result.response,
        createdAt: assistantMessage.createdAt,
      },
      conversationId: conversation.id,
      artifacts,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    
    return NextResponse.json(
      { error: 'Failed to process message. Please try again.' },
      { status: 500 }
    );
  }
}
