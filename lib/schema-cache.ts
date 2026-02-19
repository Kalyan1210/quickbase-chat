// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA & REPORT CACHE - Comprehensive catalog of all QuickBase data
// Caches tables, fields, and ALL reports for fast AI access
// ═══════════════════════════════════════════════════════════════════════════════

import { QuickBaseTable, createSystemQuickBaseClient } from './quickbase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CachedReport {
  id: string;
  name: string;
  description?: string;
  tableId: string;
  tableName: string;
}

export interface CachedTable {
  id: string;
  name: string;
  description?: string;
  recordCount?: number;
}

interface ScoredMatch<T> {
  item: T;
  score: number;
}

interface FullCache {
  tables: CachedTable[];
  reports: CachedReport[];
  tableFields: Map<string, { id: number; label: string; type: string }[]>;
  lastUpdated: Date;
  expiresAt: Date;
}

// In-memory cache
let fullCache: FullCache | null = null;

// Cache duration: 24 hours
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreNameMatch(query: string, candidate: string): number {
  const q = normalizeText(query);
  const c = normalizeText(candidate);

  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.startsWith(q)) return 80;
  if (c.includes(q)) return 60;

  const words = q.split(' ').filter(w => w.length > 1);
  if (words.length === 0) return 0;

  const matchedWords = words.filter(w => c.includes(w)).length;
  if (matchedWords === 0) return 0;

  return 30 + matchedWords * 10;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize or get the full cache (tables + all reports)
 */
export async function getFullCache(): Promise<FullCache> {
  const now = new Date();
  
  // Return cached data if valid
  if (fullCache && fullCache.expiresAt > now) {
    console.log(`Using cached data: ${fullCache.tables.length} tables, ${fullCache.reports.length} reports`);
    return fullCache;
  }
  
  // Build fresh cache
  console.log('Building comprehensive QuickBase cache...');
  const qbClient = createSystemQuickBaseClient();
  
  // 1. Fetch all tables
  const tables = await qbClient.getTables();
  console.log(`Found ${tables.length} tables`);
  
  // 2. Fetch all reports from all tables (in parallel batches)
  const allReports: CachedReport[] = [];
  const batchSize = 10; // Process 10 tables at a time
  
  for (let i = 0; i < tables.length; i += batchSize) {
    const batch = tables.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (table) => {
        try {
          const reports = await qbClient.getReports(table.id);
          return reports.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            tableId: table.id,
            tableName: table.name,
          }));
        } catch (error) {
          console.warn(`Failed to fetch reports for ${table.name}:`, error);
          return [];
        }
      })
    );
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        allReports.push(...result.value);
      }
    }
  }
  
  console.log(`Found ${allReports.length} total reports across all tables`);
  
  // 3. Build cache
  fullCache = {
    tables: tables.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
    })),
    reports: allReports,
    tableFields: new Map(),
    lastUpdated: now,
    expiresAt: new Date(now.getTime() + CACHE_DURATION_MS),
  };
  
  console.log(`Cache built: expires at ${fullCache.expiresAt.toISOString()}`);
  return fullCache;
}

/**
 * Get all cached tables
 */
export async function getAllTables(): Promise<CachedTable[]> {
  const cache = await getFullCache();
  return cache.tables;
}

/**
 * Get all cached reports
 */
export async function getAllReports(): Promise<CachedReport[]> {
  const cache = await getFullCache();
  return cache.reports;
}

/**
 * Get reports for a specific table
 */
export async function getReportsForTable(tableNameOrId: string): Promise<CachedReport[]> {
  const cache = await getFullCache();
  const lowerName = tableNameOrId.toLowerCase();
  
  return cache.reports.filter(r => 
    r.tableId === tableNameOrId ||
    r.tableName.toLowerCase().includes(lowerName)
  );
}

/**
 * Search reports by name or description
 */
export async function searchReports(query: string): Promise<CachedReport[]> {
  const cache = await getFullCache();
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/).filter(w => w.length > 2);
  
  // Score each report based on match quality
  const scored = cache.reports.map(report => {
    let score = 0;
    const nameLower = report.name.toLowerCase();
    const descLower = (report.description || '').toLowerCase();
    
    // Exact name match
    if (nameLower === lowerQuery) score += 100;
    // Name contains query
    if (nameLower.includes(lowerQuery)) score += 50;
    // Description contains query
    if (descLower.includes(lowerQuery)) score += 25;
    
    // Word matching
    for (const word of words) {
      if (nameLower.includes(word)) score += 10;
      if (descLower.includes(word)) score += 5;
    }
    
    return { report, score };
  });
  
  // Return top matches (score > 0, sorted by score)
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(s => s.report);
}

/**
 * Find a specific report by name
 */
export async function findReport(reportName: string, tableName?: string): Promise<CachedReport | null> {
  const candidates = await findReportCandidates(reportName, tableName, 1);
  return candidates[0] || null;
}

/**
 * Find candidate reports by name
 */
export async function findReportCandidates(
  reportName: string,
  tableName?: string,
  limit: number = 5
): Promise<CachedReport[]> {
  const cache = await getFullCache();
  const lowerTableName = tableName?.toLowerCase().trim();
  
  // Filter by table if specified
  let candidates = cache.reports;
  if (lowerTableName) {
    candidates = candidates.filter(r => 
      r.tableName.toLowerCase().includes(lowerTableName)
    );
  }

  const scored: ScoredMatch<CachedReport>[] = candidates
    .map(report => {
      const nameScore = scoreNameMatch(reportName, report.name);
      const descScore = scoreNameMatch(reportName, report.description || '') / 2;
      return { item: report, score: Math.max(nameScore, descScore) };
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  return scored.slice(0, limit).map(match => match.item);
}

/**
 * Find a table by name
 */
export async function findTable(tableName: string): Promise<CachedTable | null> {
  const candidates = await findTableCandidates(tableName, 1);
  return candidates[0] || null;
}

/**
 * Find candidate tables by name
 */
export async function findTableCandidates(tableName: string, limit: number = 5): Promise<CachedTable[]> {
  const cache = await getFullCache();

  const scored: ScoredMatch<CachedTable>[] = cache.tables
    .map(table => ({
      item: table,
      score: Math.max(
        scoreNameMatch(tableName, table.name),
        scoreNameMatch(tableName, table.description || '') / 2
      ),
    }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  return scored.slice(0, limit).map(match => match.item);
}

/**
 * Get table fields (cached per-table)
 */
export async function getTableFields(tableId: string): Promise<{ id: number; label: string; type: string }[]> {
  const cache = await getFullCache();
  
  // Check if already cached
  if (cache.tableFields.has(tableId)) {
    return cache.tableFields.get(tableId)!;
  }
  
  // Fetch and cache
  const qbClient = createSystemQuickBaseClient();
  const fields = await qbClient.getTableFields(tableId);
  const mapped = fields.map(f => ({ id: f.id, label: f.label, type: f.fieldType }));
  
  cache.tableFields.set(tableId, mapped);
  return mapped;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Force refresh the cache
 */
export async function refreshCache(): Promise<FullCache> {
  fullCache = null;
  return getFullCache();
}

/**
 * Get cache status
 */
export function getCacheStatus(): {
  isCached: boolean;
  lastUpdated: Date | null;
  expiresAt: Date | null;
  tableCount: number;
  reportCount: number;
} {
  return {
    isCached: fullCache !== null,
    lastUpdated: fullCache?.lastUpdated || null,
    expiresAt: fullCache?.expiresAt || null,
    tableCount: fullCache?.tables.length || 0,
    reportCount: fullCache?.reports.length || 0,
  };
}

/**
 * Clear the cache
 */
export function clearCache(): void {
  fullCache = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT CATALOG FOR AI - Formatted for inclusion in prompts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a formatted summary of all reports grouped by table
 * This can be included in AI prompts for context
 */
export async function getReportCatalogSummary(): Promise<string> {
  const cache = await getFullCache();
  
  // Group reports by table
  const byTable = new Map<string, CachedReport[]>();
  for (const report of cache.reports) {
    if (!byTable.has(report.tableName)) {
      byTable.set(report.tableName, []);
    }
    byTable.get(report.tableName)!.push(report);
  }
  
  // Format as compact list
  const lines: string[] = [];
  lines.push(`Total: ${cache.reports.length} reports across ${cache.tables.length} tables\n`);
  
  // List tables with report counts
  Array.from(byTable.entries()).forEach(([tableName, reports]) => {
    lines.push(`• ${tableName}: ${reports.length} reports`);
  });
  
  return lines.join('\n');
}

/**
 * Get detailed report list for a table
 */
export async function getTableReportList(tableName: string): Promise<string> {
  const reports = await getReportsForTable(tableName);
  
  if (reports.length === 0) {
    return `No reports found for "${tableName}"`;
  }
  
  const lines = [`Reports for ${reports[0].tableName} (${reports.length} total):\n`];
  for (const report of reports) {
    const desc = report.description ? ` - ${report.description}` : '';
    lines.push(`• ${report.name}${desc}`);
  }
  
  return lines.join('\n');
}

// Legacy export for backward compatibility
export async function getSchema(): Promise<QuickBaseTable[]> {
  const qbClient = createSystemQuickBaseClient();
  return qbClient.getAppSchema();
}
