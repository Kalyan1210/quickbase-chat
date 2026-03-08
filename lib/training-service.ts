import { prisma } from './db';
import * as fs from 'fs';
import * as path from 'path';
import { TOOLS } from './tools';

// ═══════════════════════════════════════════════════════════════════════════════
// TRAINING SERVICE
// Manages verified Q&A examples for improving AI responses
// Uses keyword matching to find similar examples
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

interface NormalizedExample {
  question: string;
  expectedAnswer: string;
  expectedTool?: string;
  expectedParams?: Record<string, unknown>;
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
 * Find similar examples using keyword matching
 */
async function findSimilarExamplesKeyword(
  question: string,
  limit: number = 5
): Promise<VerifiedExample[]> {
  const examples = await loadVerifiedExamples();
  const lowerQuestion = question.toLowerCase();
  
  const scored = examples.map(ex => {
    const exLower = ex.question.toLowerCase();
    let score = 0;
    
    const questionWords = lowerQuestion.split(/\s+/).filter(w => w.length > 2);
    
    for (const word of questionWords) {
      if (exLower.includes(word)) {
        score += 2;
      }
      if (ex.tags.some(tag => tag.toLowerCase().includes(word))) {
        score += 1;
      }
    }
    
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
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.example);
}

/**
 * Find similar examples based on question text
 * Uses keyword matching (fast and effective for hundreds of examples)
 */
export async function findSimilarExamples(
  question: string,
  limit: number = 5
): Promise<VerifiedExample[]> {
  return findSimilarExamplesKeyword(question, limit);
}

function normalizeDateRangeValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const normalized = value.toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    'this_week': 'this_week',
    'last_week': 'last_week',
    'this_month': 'this_month',
    'last_month': 'last_month',
    'last_30_days': 'last_30_days',
    'this_year': 'this_year',
    'today': 'today',
    'yesterday': 'yesterday',
  };

  return map[normalized] || normalized;
}

function normalizeTableValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const key = value.toLowerCase().trim();

  // Map aliases to valid table keys (must match tools.ts enum)
  const tableAliases: Record<string, string> = {
    children: 'clients',           // "children" questions use clients table
    students: 'clients',           // "students" = children
    kids: 'clients',               // "kids" = children
    child: 'clients',              // singular
    child_status: 'clients',       // map old child_status references to clients
    family: 'families',
    class: 'classes',
    classroom: 'classes',
    enrollments: 'class_enrollments',
    class_enrollment: 'class_enrollments',
  };

  return tableAliases[key] || key;
}

function normalizeReportValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const key = value.toLowerCase().trim();

  const reportAliases: Record<string, string> = {
    currentenrollment: 'current_enrollment',
    current_enrollment: 'current_enrollment',
    enrollmentbycoordinator: 'enrollment_by_coordinator',
    enrollment_by_coordinator: 'enrollment_by_coordinator',
    expiringauthorizations: 'expiring_authorizations',
    expiring_authorizations: 'expiring_authorizations',
    familiesmissingdata: 'families_missing_data',
    families_missing_data: 'families_missing_data',
    waitlistsummary: 'waitlist_summary',
    waitlist_summary: 'waitlist_summary',
  };

  const compact = key.replace(/[\s-]/g, '');
  return reportAliases[compact] || reportAliases[key] || key;
}

function normalizeToolName(toolName?: string): string | undefined {
  if (!toolName) return undefined;

  const aliases: Record<string, string> = {
    search_reports: 'search_all_reports',
  };

  return aliases[toolName] || toolName;
}

function normalizeToolParams(
  toolName: string,
  params?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!params) return undefined;

  const normalized: Record<string, unknown> = { ...params };

  if ('entity' in normalized && !('table' in normalized)) {
    normalized.table = normalizeTableValue(normalized.entity);
    delete normalized.entity;
  }

  if ('dateFilter' in normalized && !('dateRange' in normalized)) {
    normalized.dateRange = normalizeDateRangeValue(normalized.dateFilter);
    delete normalized.dateFilter;
  }

  if ('query' in normalized && toolName === 'search_all_reports' && !('searchQuery' in normalized)) {
    normalized.searchQuery = normalized.query;
    delete normalized.query;
  }

  if ('reportType' in normalized && toolName === 'run_report' && !('report' in normalized)) {
    normalized.report = normalizeReportValue(normalized.reportType);
    delete normalized.reportType;
  }

  // Normalize various status field names to 'status'
  const statusAliases = ['Child_enrollment_status', 'enrollment_status', 'childStatus', 'enrollmentStatus'];
  for (const alias of statusAliases) {
    if (alias in normalized && !('status' in normalized)) {
      normalized.status = normalized[alias];
      delete normalized[alias];
    }
  }

  // Remove invalid/unknown parameters that aren't in tool schema
  const validParams: Record<string, string[]> = {
    count_records: ['table', 'status', 'dateRange', 'metric'],
    list_records: ['table', 'status', 'dateRange', 'limit'],
    run_report: ['report'],
    run_dynamic_report: ['tableName', 'reportName'],
    search_all_reports: ['searchQuery'],
    list_table_reports: ['tableName'],
    explore_table_fields: ['tableName'],
    query_any_table: ['tableName', 'action', 'limit'],
    get_help: ['topic'],
  };

  if (toolName in validParams) {
    const allowed = validParams[toolName];
    for (const key of Object.keys(normalized)) {
      if (!allowed.includes(key)) {
        delete normalized[key];
      }
    }
  }

  if ('table' in normalized) {
    normalized.table = normalizeTableValue(normalized.table);
  }

  if ('dateRange' in normalized) {
    normalized.dateRange = normalizeDateRangeValue(normalized.dateRange);
  }

  if ('report' in normalized) {
    normalized.report = normalizeReportValue(normalized.report);
  }

  return normalized;
}

function isValidToolPayload(
  toolName: string,
  params?: Record<string, unknown>
): boolean {
  const tool = TOOLS.find(t => t.name === toolName);
  if (!tool || !tool.parameters) return false;
  if (!params) return false;

  const required = ((tool.parameters as unknown as { required?: string[] }).required || []);
  const properties = ((tool.parameters as unknown as { properties?: Record<string, { enum?: unknown[] }> }).properties || {});

  for (const field of required) {
    if (!(field in params) || params[field] === undefined || params[field] === null || params[field] === '') {
      return false;
    }
  }

  for (const [key, value] of Object.entries(params)) {
    const property = properties[key];
    if (!property) continue;
    if (property.enum && property.enum.length > 0 && !property.enum.includes(value)) {
      return false;
    }
  }

  return true;
}

function normalizeExampleForPrompt(example: VerifiedExample): NormalizedExample {
  const toolName = normalizeToolName(example.expectedTool);
  const normalizedParams = toolName ? normalizeToolParams(toolName, example.expectedParams) : undefined;
  const validTool = toolName && normalizedParams && isValidToolPayload(toolName, normalizedParams);

  return {
    question: example.question,
    expectedAnswer: example.expectedAnswer,
    expectedTool: validTool ? toolName : undefined,
    expectedParams: validTool ? normalizedParams : undefined,
  };
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
    const normalized = normalizeExampleForPrompt(ex);
    lines.push(`\nQ: "${normalized.question}"`);
    if (normalized.expectedTool) {
      lines.push(`Tool: ${normalized.expectedTool}`);
      if (normalized.expectedParams) {
        lines.push(`Params: ${JSON.stringify(normalized.expectedParams)}`);
      }
    }
    lines.push(`Expected Answer Pattern: ${normalized.expectedAnswer}`);
  }
  
  lines.push('\nUse these as guidance for handling similar questions. If no valid tool mapping is shown, do not infer tool arguments from that example.');
  
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
    
    await prisma.responseFeedback.update({
      where: { id: feedbackId },
      data: {
        status: 'converted',
        convertedToQAId: example.id,
      },
    });
    
    cacheLastUpdated = null;
    
    return example.id;
  } catch (error) {
    console.error('Error converting feedback to example:', error);
    return null;
  }
}

/**
 * Delete a verified example from database
 */
export async function deleteVerifiedExample(exampleId: string): Promise<boolean> {
  try {
    await prisma.verifiedQA.delete({
      where: { id: exampleId },
    });
    
    cacheLastUpdated = null;
    return true;
  } catch (error) {
    console.error('Error deleting verified example:', error);
    return false;
  }
}
