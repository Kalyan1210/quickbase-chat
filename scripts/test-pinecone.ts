import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { Pinecone } from '@pinecone-database/pinecone';

async function testConnection() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PINECONE CONNECTION TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const apiKey = process.env.PINECONE_API_KEY;
  
  console.log('API Key present:', !!apiKey);
  console.log('API Key prefix:', apiKey ? apiKey.substring(0, 15) + '...' : 'N/A');
  console.log('Index name:', process.env.PINECONE_INDEX_NAME || 'quickbase-qa');
  
  if (!apiKey) {
    console.error('\n❌ PINECONE_API_KEY not found in .env.local');
    process.exit(1);
  }

  try {
    console.log('\nConnecting to Pinecone...');
    const pc = new Pinecone({ apiKey });
    
    console.log('Listing indexes...');
    const indexes = await pc.listIndexes();
    const indexNames = indexes.indexes?.map(i => i.name) || [];
    
    console.log('Existing indexes:', indexNames.length > 0 ? indexNames.join(', ') : '(none)');
    
    const targetIndex = process.env.PINECONE_INDEX_NAME || 'quickbase-qa';
    if (indexNames.includes(targetIndex)) {
      console.log(`\n📊 Index "${targetIndex}" exists. Getting stats...`);
      const index = pc.index(targetIndex);
      const stats = await index.describeIndexStats();
      console.log('   Total vectors:', stats.totalRecordCount || 0);
      console.log('   Dimension:', stats.dimension || 'N/A');
    } else {
      console.log(`\n📝 Index "${targetIndex}" does not exist yet.`);
      console.log('   It will be created when you run: npm run pinecone:sync');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ PINECONE CONNECTION SUCCESSFUL');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ Connection failed:', error);
    process.exit(1);
  }
}

testConnection();
