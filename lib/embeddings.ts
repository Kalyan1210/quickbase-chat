import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from './db';

// ═══════════════════════════════════════════════════════════════════════════════
// EMBEDDING SERVICE
// Generates and manages embeddings for RAG using Gemini
// ═══════════════════════════════════════════════════════════════════════════════

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

/**
 * Generate embedding for text using Gemini
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Find similar query examples based on user question
 */
export async function findSimilarExamples(
  question: string,
  limit: number = 5
): Promise<Array<{ question: string; query: string; description: string | null }>> {
  try {
    // For now, use simple text matching until we set up full vector search
    // This is a fallback that still provides value
    const examples = await prisma.queryExample.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    
    // Simple keyword matching to rank examples
    const keywords = question.toLowerCase().split(/\s+/);
    const scored = examples.map(ex => {
      const text = `${ex.question} ${ex.description || ''} ${ex.category}`.toLowerCase();
      const score = keywords.filter(kw => text.includes(kw)).length;
      return { ...ex, score };
    });
    
    // Sort by score and return top matches
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, limit).map(({ question, query, description }) => ({
      question,
      query,
      description,
    }));
  } catch (error) {
    console.error('Error finding similar examples:', error);
    return [];
  }
}

/**
 * Get examples for a specific category
 */
export async function getExamplesByCategory(category: string): Promise<Array<{
  question: string;
  query: string;
  description: string | null;
}>> {
  try {
    const examples = await prisma.queryExample.findMany({
      where: { category },
      take: 10,
    });
    
    return examples.map(({ question, query, description }) => ({
      question,
      query,
      description,
    }));
  } catch (error) {
    console.error('Error getting examples by category:', error);
    return [];
  }
}

/**
 * Add a new query example
 */
export async function addQueryExample(data: {
  question: string;
  query: string;
  tableName?: string;
  tableId?: string;
  category?: string;
  description?: string;
}): Promise<void> {
  try {
    await prisma.queryExample.create({
      data: {
        question: data.question,
        query: data.query,
        tableName: data.tableName,
        tableId: data.tableId,
        category: data.category || 'general',
        description: data.description,
      },
    });
  } catch (error) {
    console.error('Error adding query example:', error);
    throw error;
  }
}

/**
 * Get all query examples formatted for AI context
 */
export async function getAllExamplesForContext(): Promise<string> {
  try {
    const examples = await prisma.queryExample.findMany({
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    });
    
    if (examples.length === 0) {
      return '';
    }
    
    const grouped: Record<string, typeof examples> = {};
    examples.forEach(ex => {
      if (!grouped[ex.category]) {
        grouped[ex.category] = [];
      }
      grouped[ex.category].push(ex);
    });
    
    let context = '## Verified Query Examples:\n\n';
    
    for (const [category, exs] of Object.entries(grouped)) {
      context += `### ${category.charAt(0).toUpperCase() + category.slice(1)}:\n`;
      exs.forEach(ex => {
        context += `Q: "${ex.question}"\n`;
        context += `Query: ${ex.query}\n\n`;
      });
    }
    
    return context;
  } catch (error) {
    console.error('Error getting examples for context:', error);
    return '';
  }
}

