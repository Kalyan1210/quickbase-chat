// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA CACHE - Caches QuickBase schema to reduce API calls
// Refreshes daily or on demand
// ═══════════════════════════════════════════════════════════════════════════════

import { QuickBaseTable, createSystemQuickBaseClient } from './quickbase';

interface SchemaCache {
  tables: QuickBaseTable[];
  lastUpdated: Date;
  expiresAt: Date;
}

// In-memory cache (in production, use Redis or similar)
let schemaCache: SchemaCache | null = null;

// Cache duration: 24 hours
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Get cached schema or fetch fresh if expired
 */
export async function getSchema(): Promise<QuickBaseTable[]> {
  const now = new Date();
  
  // Return cached schema if valid
  if (schemaCache && schemaCache.expiresAt > now) {
    console.log('Using cached schema (expires:', schemaCache.expiresAt.toISOString(), ')');
    return schemaCache.tables;
  }
  
  // Fetch fresh schema
  console.log('Fetching fresh schema from QuickBase...');
  const qbClient = createSystemQuickBaseClient();
  const tables = await qbClient.getAppSchema();
  
  // Update cache
  schemaCache = {
    tables,
    lastUpdated: now,
    expiresAt: new Date(now.getTime() + CACHE_DURATION_MS),
  };
  
  console.log(`Schema cached: ${tables.length} tables, expires at ${schemaCache.expiresAt.toISOString()}`);
  return tables;
}

/**
 * Force refresh the schema cache
 */
export async function refreshSchema(): Promise<QuickBaseTable[]> {
  schemaCache = null;
  return getSchema();
}

/**
 * Get cache status
 */
export function getCacheStatus(): {
  isCached: boolean;
  lastUpdated: Date | null;
  expiresAt: Date | null;
  tableCount: number;
} {
  return {
    isCached: schemaCache !== null,
    lastUpdated: schemaCache?.lastUpdated || null,
    expiresAt: schemaCache?.expiresAt || null,
    tableCount: schemaCache?.tables.length || 0,
  };
}

/**
 * Clear the cache
 */
export function clearCache(): void {
  schemaCache = null;
}

