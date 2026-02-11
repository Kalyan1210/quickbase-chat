import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════════════════
// GET - Get single verified Q&A example
// ═══════════════════════════════════════════════════════════════════════════════
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const example = await prisma.verifiedQA.findUnique({
      where: { id: params.id },
    });

    if (!example) {
      return NextResponse.json({ error: 'Example not found' }, { status: 404 });
    }

    return NextResponse.json({ example });
  } catch (error) {
    console.error('Error fetching training example:', error);
    return NextResponse.json({ error: 'Failed to fetch example' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH - Update verified Q&A example (including verification)
// ═══════════════════════════════════════════════════════════════════════════════
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      category,
      tags,
      notes,
      verified,
    } = body;

    const updateData: any = {};
    
    if (question !== undefined) updateData.question = question;
    if (expectedAnswer !== undefined) updateData.expectedAnswer = expectedAnswer;
    if (expectedTool !== undefined) updateData.expectedTool = expectedTool;
    if (expectedParams !== undefined) {
      updateData.expectedParams = expectedParams ? JSON.stringify(expectedParams) : null;
    }
    if (expectedData !== undefined) {
      updateData.expectedData = expectedData ? JSON.stringify(expectedData) : null;
    }
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;
    if (notes !== undefined) updateData.notes = notes;
    
    // Handle verification
    if (verified !== undefined) {
      updateData.verified = verified;
      if (verified) {
        updateData.verifiedBy = session.user.email;
        updateData.verifiedAt = new Date();
      } else {
        updateData.verifiedBy = null;
        updateData.verifiedAt = null;
      }
    }

    const example = await prisma.verifiedQA.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ success: true, example });
  } catch (error) {
    console.error('Error updating training example:', error);
    return NextResponse.json({ error: 'Failed to update example' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE - Remove verified Q&A example
// ═══════════════════════════════════════════════════════════════════════════════
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.verifiedQA.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting training example:', error);
    return NextResponse.json({ error: 'Failed to delete example' }, { status: 500 });
  }
}

