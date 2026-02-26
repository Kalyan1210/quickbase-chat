import { NextResponse } from 'next/server';
import { syncToPinecone, getPineconeStats, loadVerifiedExamples } from '@/lib/training-service';
import { deleteAllVectors, isPineconeAvailable } from '@/lib/pinecone';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'stats';

  try {
    const available = await isPineconeAvailable();
    
    if (!available) {
      return NextResponse.json({
        success: false,
        error: 'Pinecone is not available. Check PINECONE_API_KEY.',
      }, { status: 500 });
    }

    if (action === 'stats') {
      const stats = await getPineconeStats();
      const examples = await loadVerifiedExamples();
      
      return NextResponse.json({
        success: true,
        pineconeVectors: stats.totalVectors,
        verifiedExamples: examples.length,
        inSync: stats.totalVectors === examples.length,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Use POST to sync or reset',
      availableActions: ['stats', 'sync', 'reset'],
    });
  } catch (error) {
    console.error('Pinecone stats error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'sync';

  try {
    const available = await isPineconeAvailable();
    
    if (!available) {
      return NextResponse.json({
        success: false,
        error: 'Pinecone is not available. Check PINECONE_API_KEY.',
      }, { status: 500 });
    }

    if (action === 'reset') {
      try {
        await deleteAllVectors();
      } catch {
        console.log('Could not delete vectors (index may not exist yet)');
      }
    }

    if (action === 'sync' || action === 'reset') {
      const result = await syncToPinecone();
      const stats = await getPineconeStats();
      
      return NextResponse.json({
        success: true,
        action,
        synced: result.synced,
        errors: result.errors,
        totalVectors: stats.totalVectors,
      });
    }

    return NextResponse.json({
      success: false,
      error: `Unknown action: ${action}`,
    }, { status: 400 });
  } catch (error) {
    console.error('Pinecone sync error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
