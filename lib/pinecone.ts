import { Pinecone, Index } from '@pinecone-database/pinecone';
import { generateEmbedding } from './embeddings';

// ═══════════════════════════════════════════════════════════════════════════════
// PINECONE SERVICE
// Vector database for semantic search of verified Q&A examples
// ═══════════════════════════════════════════════════════════════════════════════

const PINECONE_API_KEY = process.env.PINECONE_API_KEY || '';
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'quickbase-qa';
const EMBEDDING_DIMENSION = 768; // Google text-embedding-004 dimension

let pineconeClient: Pinecone | null = null;
let indexInstance: Index<QAMetadata> | null = null;

export type QAMetadata = {
  question: string;
  expectedAnswer: string;
  expectedTool: string;
  expectedParams: string;
  category: string;
  tags: string[];
  verified: boolean;
};

export interface QAMetadataInput {
  expectedAnswer: string;
  expectedTool?: string;
  expectedParams?: string;
  category: string;
  tags?: string[];
  verified: boolean;
}

export interface SimilarResult {
  id: string;
  score: number;
  metadata: QAMetadata;
}

/**
 * Initialize Pinecone client
 */
function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    if (!PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY is not configured');
    }
    pineconeClient = new Pinecone({ apiKey: PINECONE_API_KEY });
  }
  return pineconeClient;
}

/**
 * Get or create the Pinecone index
 */
export async function getIndex(): Promise<Index<QAMetadata>> {
  if (indexInstance) {
    return indexInstance;
  }

  const pc = getPineconeClient();
  
  // Check if index exists
  const existingIndexes = await pc.listIndexes();
  const indexExists = existingIndexes.indexes?.some(idx => idx.name === INDEX_NAME);
  
  if (!indexExists) {
    console.log(`Creating Pinecone index: ${INDEX_NAME}`);
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: EMBEDDING_DIMENSION,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });
    
    // Wait for index to be ready
    console.log('Waiting for index to initialize...');
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  
  indexInstance = pc.index<QAMetadata>(INDEX_NAME);
  return indexInstance;
}

/**
 * Build clean metadata object with all required fields
 */
function buildMetadata(question: string, input: QAMetadataInput): QAMetadata {
  return {
    question,
    expectedAnswer: input.expectedAnswer,
    expectedTool: input.expectedTool || '',
    expectedParams: input.expectedParams || '',
    category: input.category,
    tags: input.tags || [],
    verified: input.verified,
  };
}

/**
 * Upsert a verified Q&A example into Pinecone
 */
export async function upsertQAExample(
  id: string,
  question: string,
  input: QAMetadataInput
): Promise<void> {
  try {
    const index = await getIndex();
    const embedding = await generateEmbedding(question);
    const metadata = buildMetadata(question, input);
    
    await index.upsert({
      records: [
        {
          id,
          values: embedding,
          metadata,
        },
      ],
    });
    
    console.log(`Upserted Q&A example: ${id}`);
  } catch (error) {
    console.error('Error upserting to Pinecone:', error);
    throw error;
  }
}

/**
 * Batch upsert multiple Q&A examples
 */
export async function batchUpsertQAExamples(
  examples: Array<{
    id: string;
    question: string;
    metadata: QAMetadataInput;
  }>
): Promise<number> {
  try {
    const index = await getIndex();
    const batchSize = 100;
    let upsertedCount = 0;
    
    for (let i = 0; i < examples.length; i += batchSize) {
      const batch = examples.slice(i, i + batchSize);
      
      const vectors = await Promise.all(
        batch.map(async (ex) => {
          const embedding = await generateEmbedding(ex.question);
          const metadata = buildMetadata(ex.question, ex.metadata);
          return {
            id: ex.id,
            values: embedding,
            metadata,
          };
        })
      );
      
      await index.upsert({ records: vectors });
      upsertedCount += vectors.length;
      console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}: ${vectors.length} examples`);
    }
    
    return upsertedCount;
  } catch (error) {
    console.error('Error batch upserting to Pinecone:', error);
    throw error;
  }
}

/**
 * Query Pinecone for similar Q&A examples
 */
export async function querySimilarQA(
  question: string,
  topK: number = 5,
  filter?: { category?: string; verified?: boolean }
): Promise<SimilarResult[]> {
  try {
    const index = await getIndex();
    const embedding = await generateEmbedding(question);
    
    // Build filter if provided
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pineconeFilter: Record<string, any> | undefined;
    if (filter) {
      pineconeFilter = {};
      if (filter.category) {
        pineconeFilter.category = { $eq: filter.category };
      }
      if (filter.verified !== undefined) {
        pineconeFilter.verified = { $eq: filter.verified };
      }
    }
    
    const results = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      filter: pineconeFilter,
    });
    
    return (results.matches || []).map(match => ({
      id: match.id,
      score: match.score || 0,
      metadata: match.metadata as QAMetadata,
    }));
  } catch (error) {
    console.error('Error querying Pinecone:', error);
    throw error;
  }
}

/**
 * Delete a Q&A example from Pinecone
 */
export async function deleteQAExample(id: string): Promise<void> {
  try {
    const index = await getIndex();
    await index.deleteOne({ id });
    console.log(`Deleted Q&A example: ${id}`);
  } catch (error) {
    console.error('Error deleting from Pinecone:', error);
    throw error;
  }
}

/**
 * Delete all vectors (for re-indexing)
 */
export async function deleteAllVectors(): Promise<void> {
  try {
    const index = await getIndex();
    await index.deleteAll();
    console.log('Deleted all vectors from Pinecone index');
  } catch (error) {
    console.error('Error deleting all vectors:', error);
    throw error;
  }
}

/**
 * Get index statistics
 */
export async function getIndexStats(): Promise<{
  totalVectors: number;
  dimension: number;
}> {
  try {
    const index = await getIndex();
    const stats = await index.describeIndexStats();
    
    return {
      totalVectors: stats.totalRecordCount || 0,
      dimension: stats.dimension || EMBEDDING_DIMENSION,
    };
  } catch (error) {
    console.error('Error getting index stats:', error);
    return { totalVectors: 0, dimension: EMBEDDING_DIMENSION };
  }
}

/**
 * Check if Pinecone is properly configured and reachable
 */
export async function isPineconeAvailable(): Promise<boolean> {
  try {
    if (!PINECONE_API_KEY) {
      return false;
    }
    await getIndex();
    return true;
  } catch (error) {
    console.error('Pinecone not available:', error);
    return false;
  }
}
