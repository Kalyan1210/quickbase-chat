import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════════════════
// GET - List verified Q&A examples
// ═══════════════════════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const verified = searchParams.get('verified');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (category) where.category = category;
    if (verified !== null) where.verified = verified === 'true';

    const examples = await prisma.verifiedQA.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Get category counts
    const categories = await prisma.verifiedQA.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    return NextResponse.json({
      examples,
      categories: categories.map((c: { category: string; _count: { id: number } }) => ({ name: c.category, count: c._count.id })),
      total: examples.length,
    });
  } catch (error) {
    console.error('Error fetching training examples:', error);
    return NextResponse.json({ error: 'Failed to fetch examples' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST - Create new verified Q&A example
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
      expectedAnswer,
      expectedTool,
      expectedParams,
      expectedData,
      category = 'general',
      tags = [],
      notes,
      verified = false,
    } = body;

    if (!question || !expectedAnswer) {
      return NextResponse.json(
        { error: 'Question and expectedAnswer are required' },
        { status: 400 }
      );
    }

    const example = await prisma.verifiedQA.create({
      data: {
        question,
        expectedAnswer,
        expectedTool,
        expectedParams: expectedParams ? JSON.stringify(expectedParams) : null,
        expectedData: expectedData ? JSON.stringify(expectedData) : null,
        category,
        tags,
        notes,
        verified,
        verifiedBy: verified ? session.user.email : null,
        verifiedAt: verified ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true, example });
  } catch (error) {
    console.error('Error creating training example:', error);
    return NextResponse.json({ error: 'Failed to create example' }, { status: 500 });
  }
}

