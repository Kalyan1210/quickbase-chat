#!/usr/bin/env npx tsx
/**
 * Sync verified Q&A examples to Pinecone
 * 
 * Usage:
 *   npm run pinecone:sync          # Sync all verified examples
 *   npm run pinecone:sync -- --stats  # Show index statistics
 *   npm run pinecone:sync -- --reset  # Delete all vectors and re-sync
 */

// Load environment variables FIRST before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

// Now import modules that depend on env vars
import { Pinecone } from '@pinecone-database/pinecone';
import { syncToPinecone, getPineconeStats, loadVerifiedExamples } from '../lib/training-service';
import { deleteAllVectors } from '../lib/pinecone';

async function checkPineconeConnection(): Promise<boolean> {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    console.log('  API Key: NOT FOUND');
    return false;
  }
  console.log('  API Key: Found');
  
  try {
    const pc = new Pinecone({ apiKey });
    const indexes = await pc.listIndexes();
    console.log('  Connection: OK');
    console.log('  Existing indexes:', indexes.indexes?.map(i => i.name).join(', ') || '(none)');
    return true;
  } catch (error) {
    console.log('  Connection: FAILED');
    console.error('  Error:', error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const showStats = args.includes('--stats');
  const resetIndex = args.includes('--reset');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PINECONE SYNC TOOL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check Pinecone availability
  console.log('Checking Pinecone connection...');
  const available = await checkPineconeConnection();
  if (!available) {
    console.error('\n❌ Pinecone is not available. Check your PINECONE_API_KEY in .env.local');
    process.exit(1);
  }
  console.log('\n✅ Pinecone connection verified\n');

  // Show stats
  if (showStats) {
    const stats = await getPineconeStats();
    const examples = await loadVerifiedExamples();
    
    console.log('📊 Index Statistics:');
    console.log(`   Vectors in Pinecone: ${stats.totalVectors}`);
    console.log(`   Verified Q&As in DB: ${examples.length}`);
    
    if (stats.totalVectors !== examples.length) {
      console.log('\n⚠️  Vector count mismatch. Consider running sync.');
    } else {
      console.log('\n✅ Index is in sync with database.');
    }
    return;
  }

  // Reset index if requested
  if (resetIndex) {
    console.log('🗑️  Deleting all vectors from Pinecone index...');
    try {
      await deleteAllVectors();
      console.log('✅ All vectors deleted\n');
    } catch (error) {
      console.log('⚠️  Could not delete vectors (index may not exist yet)\n');
    }
  }

  // Sync to Pinecone
  console.log('🔄 Syncing verified Q&A examples to Pinecone...\n');
  
  const result = await syncToPinecone();
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SYNC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ✅ Synced:  ${result.synced}`);
  console.log(`  ❌ Errors:  ${result.errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Show final stats
  const finalStats = await getPineconeStats();
  console.log(`📊 Total vectors in index: ${finalStats.totalVectors}\n`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
