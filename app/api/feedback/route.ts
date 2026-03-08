import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════════════════
// GET - List feedback (for admin review)
// ═══════════════════════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '50');

    const feedback = await prisma.responseFeedback.findMany({
      where: { status },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Get status counts
    const statusCounts = await prisma.responseFeedback.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    // Get correct/incorrect counts
    const correctCounts = await prisma.responseFeedback.groupBy({
      by: ['isCorrect'],
      _count: { id: true },
    });

    return NextResponse.json({
      feedback,
      statusCounts: statusCounts.map((s: { status: string; _count: { id: number } }) => ({ status: s.status, count: s._count.id })),
      correctCounts: correctCounts.map((c: { isCorrect: boolean | null; _count: { id: number } }) => ({
        isCorrect: c.isCorrect,
        count: c._count.id,
      })),
      total: feedback.length,
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST - Submit feedback on an AI response
// ═══════════════════════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      question,
      aiResponse,
      toolCalled,
      toolParams,
      dataReturned,
      isCorrect,
      userComment,
      correctedAnswer,
    } = body;

    if (!question || !aiResponse) {
      return NextResponse.json(
        { error: 'Question and aiResponse are required' },
        { status: 400 }
      );
    }

    const feedback = await prisma.responseFeedback.create({
      data: {
        question,
        aiResponse,
        toolCalled,
        toolParams: toolParams ? JSON.stringify(toolParams) : null,
        dataReturned: dataReturned ? JSON.stringify(dataReturned) : null,
        isCorrect,
        userComment,
        correctedAnswer,
        userId: session.user.id || null,
        userEmail: session.user.email,
        status: 'pending',
      },
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}

