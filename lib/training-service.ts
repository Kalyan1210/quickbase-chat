import { prisma } from './db';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// TRAINING SERVICE
// Manages verified Q&A examples for improving AI responses
// ═══════════════════════════════════════════════════════════════════════════════

export interface VerifiedExample {
  id: string;
  question: string;
  expectedAnswer: string;
  expectedTool?: string;
  expectedParams?: Record<string, unknown>;
  category: string;
  tags: string[];
  verified: boolean;
}

// In-memory cache for verified examples
let examplesCache: VerifiedExample[] = [];
let cacheLastUpdated: Date | null = null;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Load verified examples from database into memory cache
 */
export async function loadVerifiedExamples(): Promise<VerifiedExample[]> {
  const now = new Date();
  
  // Return cache if still valid
  if (cacheLastUpdated && (now.getTime() - cacheLastUpdated.getTime()) < CACHE_DURATION_MS) {
    return examplesCache;
  }

  try {
    const dbExamples = await prisma.verifiedQA.findMany({
      where: { verified: true },
      orderBy: [
        { usageCount: 'desc' },
        { successCount: 'desc' },
      ],
    });

    examplesCache = dbExamples.map(ex => ({
      id: ex.id,
      question: ex.question,
      expectedAnswer: ex.expectedAnswer,
      expectedTool: ex.expectedTool || undefined,
      expectedParams: ex.expectedParams ? JSON.parse(ex.expectedParams) : undefined,
      category: ex.category,
      tags: ex.tags || [],
      verified: ex.verified,
    }));

    cacheLastUpdated = now;
    console.log(`Loaded ${examplesCache.length} verified Q&A examples into cache`);
    return examplesCache;
  } catch (error) {
    console.error('Error loading verified examples from database:', error);
    // Return existing cache on error
    return examplesCache;
  }
}

/**
 * Find similar examples based on question text
 */
export async function findSimilarExamples(
  question: string,
  limit: number = 5
): Promise<VerifiedExample[]> {
  const examples = await loadVerifiedExamples();
  const lowerQuestion = question.toLowerCase();
  
  // Score each example based on word overlap and category relevance
  const scored = examples.map(ex => {
    const exLower = ex.question.toLowerCase();
    let score = 0;
    
    // Word overlap scoring
    const questionWords = lowerQuestion.split(/\s+/).filter(w => w.length > 2);
    const exampleWords = exLower.split(/\s+/).filter(w => w.length > 2);
    
    for (const word of questionWords) {
      if (exLower.includes(word)) {
        score += 2;
      }
      // Check tags too
      if (ex.tags.some(tag => tag.toLowerCase().includes(word))) {
        score += 1;
      }
    }
    
    // Bonus for similar structure
    if (lowerQuestion.startsWith('how many') && exLower.startsWith('how many')) {
      score += 3;
    }
    if (lowerQuestion.startsWith('show me') && exLower.startsWith('show me')) {
      score += 3;
    }
    if (lowerQuestion.startsWith('what') && exLower.startsWith('what')) {
      score += 2;
    }
    if (lowerQuestion.startsWith('list') && exLower.startsWith('list')) {
      score += 2;
    }
    
    return { example: ex, score };
  });
  
  // Sort by score and return top matches
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.example);
}

/**
 * Format examples as context for the AI system prompt
 */
export function formatExamplesForPrompt(examples: VerifiedExample[]): string {
  if (examples.length === 0) {
    return '';
  }

  const lines = ['Here are similar questions that have been verified with correct answers:'];
  
  for (const ex of examples) {
    lines.push(`\nQ: "${ex.question}"`);
    if (ex.expectedTool) {
      lines.push(`Tool: ${ex.expectedTool}`);
      if (ex.expectedParams) {
        lines.push(`Params: ${JSON.stringify(ex.expectedParams)}`);
      }
    }
    lines.push(`Expected Answer Pattern: ${ex.expectedAnswer}`);
  }
  
  lines.push('\nUse these as guidance for handling similar questions.');
  
  return lines.join('\n');
}

/**
 * Track usage of an example
 */
export async function trackExampleUsage(exampleId: string, wasSuccessful: boolean): Promise<void> {
  try {
    await prisma.verifiedQA.update({
      where: { id: exampleId },
      data: {
        usageCount: { increment: 1 },
        successCount: wasSuccessful ? { increment: 1 } : undefined,
      },
    });
  } catch (error) {
    console.error('Error tracking example usage:', error);
  }
}

/**
 * Get examples by category
 */
export async function getExamplesByCategory(category: string): Promise<VerifiedExample[]> {
  const examples = await loadVerifiedExamples();
  return examples.filter(ex => ex.category === category);
}

/**
 * Get all categories with counts
 */
export async function getCategoryCounts(): Promise<Record<string, number>> {
  const examples = await loadVerifiedExamples();
  const counts: Record<string, number> = {};
  
  for (const ex of examples) {
    counts[ex.category] = (counts[ex.category] || 0) + 1;
  }
  
  return counts;
}

/**
 * Seed verified examples from JSONL file
 */
export async function seedFromJSONL(filePath: string): Promise<number> {
  try {
    const fullPath = path.resolve(filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    let count = 0;
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        
        // Check if example already exists (by question)
        const existing = await prisma.verifiedQA.findFirst({
          where: { question: data.question },
        });
        
        if (!existing) {
          await prisma.verifiedQA.create({
            data: {
              question: data.question,
              expectedAnswer: data.expectedAnswer,
              expectedTool: data.expectedTool || null,
              expectedParams: data.expectedParams ? JSON.stringify(data.expectedParams) : null,
              category: data.category || 'general',
              tags: data.tags || [],
              notes: data.notes || null,
              verified: data.verified || false,
              verifiedBy: data.verified ? 'system-seed' : null,
              verifiedAt: data.verified ? new Date() : null,
            },
          });
          count++;
        }
      } catch (parseError) {
        console.error('Error parsing JSONL line:', parseError);
      }
    }
    
    // Invalidate cache
    cacheLastUpdated = null;
    
    console.log(`Seeded ${count} new verified Q&A examples from ${filePath}`);
    return count;
  } catch (error) {
    console.error('Error seeding from JSONL:', error);
    throw error;
  }
}

/**
 * Export verified examples to JSONL format
 */
export async function exportToJSONL(): Promise<string> {
  const examples = await loadVerifiedExamples();
  
  const lines = examples.map(ex => JSON.stringify({
    question: ex.question,
    expectedAnswer: ex.expectedAnswer,
    expectedTool: ex.expectedTool,
    expectedParams: ex.expectedParams,
    category: ex.category,
    tags: ex.tags,
    verified: ex.verified,
  }));
  
  return lines.join('\n');
}

/**
 * Convert user feedback to verified Q&A example
 */
export async function convertFeedbackToExample(feedbackId: string): Promise<string | null> {
  try {
    const feedback = await prisma.responseFeedback.findUnique({
      where: { id: feedbackId },
    });
    
    if (!feedback || !feedback.correctedAnswer) {
      return null;
    }
    
    // Create new verified example
    const example = await prisma.verifiedQA.create({
      data: {
        question: feedback.question,
        expectedAnswer: feedback.correctedAnswer,
        expectedTool: feedback.toolCalled || null,
        expectedParams: feedback.toolParams,
        category: 'user-corrected',
        verified: true,
        verifiedBy: 'user-feedback',
        verifiedAt: new Date(),
        notes: `Converted from feedback ${feedbackId}. Original AI response: ${feedback.aiResponse.substring(0, 200)}...`,
      },
    });
    
    // Update feedback status
    await prisma.responseFeedback.update({
      where: { id: feedbackId },
      data: {
        status: 'converted',
        convertedToQAId: example.id,
      },
    });
    
    // Invalidate cache
    cacheLastUpdated = null;
    
    return example.id;
  } catch (error) {
    console.error('Error converting feedback to example:', error);
    return null;
  }
}

