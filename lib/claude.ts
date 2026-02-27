// ═══════════════════════════════════════════════════════════════════════════════
// CLAUDE AI SERVICE WITH TOOL USE
// Uses structured tools for reliable, deterministic query generation
// Full access to all tables and 900+ reports via comprehensive cache
// ═══════════════════════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { QuickBaseClient } from './quickbase';
import {
  TOOLS,
  buildCountQuery,
  buildListQuery,
  getReportConfig,
  HELP_RESPONSES,
  CountParams,
  ListParams,
  ReportParams,
} from './tools';
import {
  getAllTables,
  getAllReports,
  searchReports,
  findReportCandidates,
  findTableCandidates,
  getTableFields,
  getReportsForTable,
} from './schema-cache';
import {
  findSimilarExamples,
  formatExamplesForPrompt,
} from './training-service';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY LOGIC - Handle rate limits gracefully
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || '';
      
      // Check if it's a rate limit error (429)
      if (errorMessage.includes('429') || errorMessage.includes('rate_limit') || errorMessage.includes('overloaded')) {
        if (attempt < retries) {
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          console.log(`Rate limited. Retrying in ${delay}ms (attempt ${attempt + 1}/${retries})...`);
          await sleep(delay);
          continue;
        }
      }
      
      // For non-rate-limit errors, throw immediately
      throw error;
    }
  }
  
  throw lastError;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Provenance {
  source: string;       // Table or report name
  filter?: string;      // What filter was applied
  timestamp: string;    // When the query was run
  recordCount?: number; // How many records matched
}

export interface ProcessResult {
  response: string;
  provenance?: Provenance;
  queryExecuted?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryResults?: any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT - User-friendly persona
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a friendly data assistant for an Early Education program called Horizons.

## YOUR CAPABILITIES:
You have FULL ACCESS to the QuickBase database including:
- 80+ tables with all their data
- 900+ saved reports that staff have created
- All fields and record counts

## YOUR PERSONALITY:
- Warm, helpful, and conversational
- Speak in plain English - NO technical terms
- Never mention field IDs, table IDs, database terms, or query syntax
- Act like a helpful colleague, not a computer

## HOW TO USE TOOLS:
ALWAYS use a tool when the user asks about data. Never make up numbers.

**Core Tools (fast & reliable):**
- 'count_records' - for "how many" questions about families, children, staff, classes
- 'list_records' - for "show me" or "list" requests
- 'run_report' - for pre-configured summary reports
- 'get_help' - when the user needs guidance

**Exploration & Search Tools:**
- 'explore_all_tables' - list ALL 80+ tables
- 'explore_table_fields' - show fields for ANY table
- 'list_table_reports' - show reports for ANY table
- 'search_all_reports' - SEARCH through all 900+ reports by name/topic
- 'run_dynamic_report' - run ANY report by name
- 'query_any_table' - count/list from ANY table

## FINDING REPORTS:
When the user asks for a specific report:
1. Use 'search_all_reports' to find it by name or topic
2. Then use 'run_dynamic_report' to run it
3. Or use 'list_table_reports' to see all reports for a table

## RESPONSE STYLE:
- Give clear, direct answers
- Use simple language anyone can understand
- Present numbers clearly
- Use bullet points for lists
- When listing many items, organize them logically
- Be encouraging and supportive

## NEVER DO THIS:
- Never make up numbers without using a tool
- Never mention field IDs or technical database terms to users
- Never show query syntax to users
- Never say "I don't have access" - you have FULL access via tools`;

// ═══════════════════════════════════════════════════════════════════════════════
// CLAUDE TOOL DEFINITIONS - Convert from Gemini format to Claude format
// ═══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertToolsToClaudeFormat(): Anthropic.Tool[] {
  return TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.parameters?.properties || {},
      required: tool.parameters?.required || [],
    },
  }));
}

const CLAUDE_TOOLS = convertToolsToClaudeFormat();

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTION - Handle AI tool calls
// ═══════════════════════════════════════════════════════════════════════════════

async function executeCountRecords(
  params: CountParams,
  qbClient: QuickBaseClient
): Promise<{ count: number; provenance: Provenance }> {
  const query = buildCountQuery(params);
  
  const count = await qbClient.getRecordCount(query.tableId, query.where);
  
  return {
    count,
    provenance: {
      source: `${query.tableName} table`,
      filter: params.status ? `Status: ${params.status}` : undefined,
      timestamp: new Date().toISOString(),
      recordCount: count,
    },
  };
}

async function executeListRecords(
  params: ListParams,
  qbClient: QuickBaseClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ records: any[]; fields: { id: number; label: string; type: string }[]; provenance: Provenance }> {
  const query = buildListQuery(params);
  
  const result = await qbClient.queryRecords(query.tableId, {
    select: query.select,
    where: query.where,
    top: query.top,
  });
  
  return {
    records: result.data,
    fields: result.fields,
    provenance: {
      source: `${query.tableName} table`,
      filter: params.status ? `Status: ${params.status}` : undefined,
      timestamp: new Date().toISOString(),
      recordCount: result.metadata.totalRecords,
    },
  };
}

function normalizeLookupValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isConfidentMatch(query: string, candidateName: string): boolean {
  const q = normalizeLookupValue(query);
  const candidate = normalizeLookupValue(candidateName);
  if (!q || !candidate) return false;

  if (q === candidate) return true;
  if (q.endsWith('s') && q.slice(0, -1) === candidate) return true;
  if (candidate.endsWith('s') && candidate.slice(0, -1) === q) return true;

  return false;
}

async function executeRunReport(
  params: ReportParams,
  qbClient: QuickBaseClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any; provenance: Provenance }> {
  const config = getReportConfig(params);
  
  const result = await qbClient.runReport(config.tableId, config.reportId);
  
  return {
    data: result,
    provenance: {
      source: `"${config.reportName}" report`,
      timestamp: new Date().toISOString(),
      recordCount: result.metadata?.totalRecords || result.data?.length,
    },
  };
}

function executeGetHelp(params: { topic?: string }): string {
  const topic = params.topic || 'general';
  return HELP_RESPONSES[topic] || HELP_RESPONSES.general;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE TOOL - Central tool execution handler
// ═══════════════════════════════════════════════════════════════════════════════

async function executeTool(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolInput: any,
  qbClient: QuickBaseClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ result: any; provenance?: Provenance; queryResults?: any }> {
  console.log(`Executing tool: ${toolName}`, toolInput);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toolResult: any;
  let provenance: Provenance | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let queryResults: any;

  switch (toolName) {
    case 'count_records': {
      const countResult = await executeCountRecords(toolInput as CountParams, qbClient);
      toolResult = { count: countResult.count };
      provenance = countResult.provenance;
      queryResults = countResult;
      break;
    }

    case 'list_records': {
      const listResult = await executeListRecords(toolInput as ListParams, qbClient);
      toolResult = formatRecordsForAI(listResult.records, listResult.fields);
      provenance = listResult.provenance;
      queryResults = listResult;
      break;
    }

    case 'run_report': {
      const reportResult = await executeRunReport(toolInput as ReportParams, qbClient);
      toolResult = formatReportForAI(reportResult.data);
      provenance = reportResult.provenance;
      queryResults = reportResult;
      break;
    }

    case 'get_help': {
      toolResult = executeGetHelp(toolInput as { topic?: string });
      break;
    }

    // ─────────────────────────────────────────────────────────────────
    // EXPLORATION TOOLS - Full access to all tables and 900+ reports
    // ─────────────────────────────────────────────────────────────────
    case 'explore_all_tables': {
      const tables = await getAllTables();
      const reports = await getAllReports();
      toolResult = {
        tableCount: tables.length,
        reportCount: reports.length,
        tables: tables.map(t => ({ name: t.name, description: t.description || '' })),
        summary: `You have access to ${tables.length} tables and ${reports.length} reports.`,
      };
      provenance = {
        source: 'QuickBase App Schema',
        timestamp: new Date().toISOString(),
        recordCount: tables.length,
      };
      break;
    }

    case 'explore_table_fields': {
      const args = toolInput as { tableName: string };
      const candidates = await findTableCandidates(args.tableName, 5);
      if (candidates.length === 0) {
        toolResult = { error: `Table "${args.tableName}" not found` };
      } else if (candidates.length > 1 && !isConfidentMatch(args.tableName, candidates[0].name)) {
        toolResult = {
          error: `Table "${args.tableName}" is ambiguous. Please choose one:`,
          suggestions: candidates.map(t => t.name),
        };
      } else {
        const table = candidates[0];
        const fields = await getTableFields(table.id);
        toolResult = {
          tableName: table.name,
          fieldCount: fields.length,
          fields: fields.slice(0, 50).map(f => ({ name: f.label, type: f.type })),
        };
        provenance = {
          source: `${table.name} table structure`,
          timestamp: new Date().toISOString(),
          recordCount: fields.length,
        };
      }
      break;
    }

    case 'list_table_reports': {
      const args = toolInput as { tableName: string };
      const candidates = await findTableCandidates(args.tableName, 5);
      if (candidates.length === 0) {
        toolResult = { error: `Table "${args.tableName}" not found` };
        break;
      }
      if (candidates.length > 1 && !isConfidentMatch(args.tableName, candidates[0].name)) {
        toolResult = {
          error: `Table "${args.tableName}" is ambiguous. Please choose one:`,
          suggestions: candidates.map(t => t.name),
        };
        break;
      }
      const table = candidates[0];
      const reports = await getReportsForTable(table.id);
      toolResult = {
        tableName: table.name,
        reportCount: reports.length,
        reports: reports.map(r => ({ name: r.name, description: r.description || '' })),
      };
      provenance = {
        source: `Reports for ${table.name}`,
        timestamp: new Date().toISOString(),
        recordCount: reports.length,
      };
      break;
    }

    case 'run_dynamic_report': {
      const args = toolInput as { tableName: string; reportName: string };
      const reportCandidates = await findReportCandidates(args.reportName, args.tableName, 5);
      if (reportCandidates.length === 0) {
        const searchResults = await searchReports(args.reportName);
        if (searchResults.length > 0) {
          toolResult = {
            error: `Report "${args.reportName}" not found. Did you mean one of these?`,
            suggestions: searchResults.slice(0, 5).map(r => `${r.name} (in ${r.tableName})`),
          };
        } else {
          toolResult = { error: `Report "${args.reportName}" not found` };
        }
      } else if (reportCandidates.length > 1 && !isConfidentMatch(args.reportName, reportCandidates[0].name)) {
        toolResult = {
          error: `Report "${args.reportName}" is ambiguous. Please choose one:`,
          suggestions: reportCandidates.map(r => `${r.name} (in ${r.tableName})`),
        };
      } else {
        const report = reportCandidates[0];
        const result = await qbClient.runReport(report.tableId, report.id);
        toolResult = formatReportForAI(result);
        provenance = {
          source: `"${report.name}" report from ${report.tableName}`,
          timestamp: new Date().toISOString(),
          recordCount: result.metadata?.totalRecords || result.data?.length,
        };
        queryResults = result;
      }
      break;
    }

    case 'query_any_table': {
      const args = toolInput as { tableName: string; action: string; limit?: number };
      const candidates = await findTableCandidates(args.tableName, 5);
      if (candidates.length === 0) {
        toolResult = { error: `Table "${args.tableName}" not found` };
      } else if (candidates.length > 1 && !isConfidentMatch(args.tableName, candidates[0].name)) {
        toolResult = {
          error: `Table "${args.tableName}" is ambiguous. Please choose one:`,
          suggestions: candidates.map(t => t.name),
        };
      } else {
        const table = candidates[0];
        if (args.action === 'count') {
          const count = await qbClient.getRecordCount(table.id);
          toolResult = { count, tableName: table.name };
          provenance = {
            source: `${table.name} table`,
            timestamp: new Date().toISOString(),
            recordCount: count,
          };
        } else {
          const fields = await getTableFields(table.id);
          const selectFields = fields.slice(0, 5).map(f => f.id);
          const result = await qbClient.queryRecords(table.id, {
            select: selectFields,
            top: Math.min(args.limit || 10, 25),
          });
          
          const fieldMap = new Map(fields.map(f => [f.id.toString(), f.label]));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formattedRecords = result.data.map((record: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const clean: Record<string, any> = {};
            for (const [fieldId, fieldData] of Object.entries(record)) {
              const label = fieldMap.get(fieldId) || `Field ${fieldId}`;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const value = (fieldData as any)?.value;
              if (value !== undefined && value !== null && value !== '') {
                clean[label] = value;
              }
            }
            return clean;
          });
          
          toolResult = {
            tableName: table.name,
            records: formattedRecords,
            totalCount: result.metadata.totalRecords,
            showing: formattedRecords.length,
          };
          provenance = {
            source: `${table.name} table`,
            timestamp: new Date().toISOString(),
            recordCount: result.metadata.totalRecords,
          };
          queryResults = result;
        }
      }
      break;
    }

    case 'search_all_reports': {
      const args = toolInput as { searchQuery: string };
      const searchResults = await searchReports(args.searchQuery);
      const allReports = await getAllReports();
      
      toolResult = {
        searchQuery: args.searchQuery,
        totalReportsInSystem: allReports.length,
        matchCount: searchResults.length,
        matches: searchResults.map(r => ({
          name: r.name,
          table: r.tableName,
          description: r.description || '',
        })),
      };
      provenance = {
        source: `Report search: "${args.searchQuery}"`,
        timestamp: new Date().toISOString(),
        recordCount: searchResults.length,
      };
      break;
    }

    default:
      toolResult = { error: `Unknown function: ${toolName}` };
  }

  return { result: toolResult, provenance, queryResults };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PROCESS MESSAGE - Entry point for chat
// ═══════════════════════════════════════════════════════════════════════════════

export async function processMessage(
  userMessage: string,
  qbClient: QuickBaseClient,
  conversationHistory: ChatMessage[] = []
): Promise<ProcessResult> {
  try {
    // Handle simple greetings without AI
    const lowerMessage = userMessage.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon'];
    
    if (greetings.some(g => lowerMessage === g)) {
      return {
        response: `Hi there! 👋 I'm your Early Education data assistant.

I can help you with questions like:
• "How many families are currently enrolled?"
• "Show me children who enrolled this month"
• "How many staff members do we have?"
• "Show me expiring authorizations"

Just ask me anything about your program data!`,
      };
    }

    // Find similar verified examples to enhance context
    let enhancedSystemPrompt = SYSTEM_PROMPT;
    try {
      const similarExamples = await findSimilarExamples(userMessage, 3);
      if (similarExamples.length > 0) {
        const examplesContext = formatExamplesForPrompt(similarExamples);
        enhancedSystemPrompt = `${SYSTEM_PROMPT}\n\n## VERIFIED EXAMPLES FOR REFERENCE:\n${examplesContext}`;
        console.log(`Found ${similarExamples.length} similar verified examples for guidance`);
      }
    } catch (error) {
      console.log('Could not load verified examples (db may not be ready):', error);
    }

    // Build conversation history for Claude format
    const messages: Anthropic.MessageParam[] = conversationHistory.slice(-6).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    // Track provenance and results
    let provenance: Provenance | undefined;
    let queryResults: unknown;
    let usedAnyTool = false;
    const executedTools: string[] = [];
    let toolErrorCount = 0;
    let iterations = 0;
    const maxIterations = 5;

    // Initial API call with retry
    let response: Anthropic.Message = await withRetry(() =>
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: enhancedSystemPrompt,
        tools: CLAUDE_TOOLS,
        messages,
      })
    );

    // Process tool calls in a loop
    while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
      iterations++;

      // Find all tool use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) break;
      usedAnyTool = true;

      // Execute each tool and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        try {
          executedTools.push(toolUse.name);
          const { result, provenance: toolProvenance, queryResults: toolQueryResults } = await executeTool(
            toolUse.name,
            toolUse.input,
            qbClient
          );
          
          // Keep the last provenance
          if (toolProvenance) provenance = toolProvenance;
          if (toolQueryResults) queryResults = toolQueryResults;

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          toolErrorCount++;
          console.error(`Tool execution error for ${toolUse.name}:`, error);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: error instanceof Error ? error.message : 'Tool execution failed' }),
            is_error: true,
          });
        }
      }

      // Add assistant response and tool results to messages
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      messages.push({
        role: 'user',
        content: toolResults,
      });

      // Continue conversation with retry
      response = await withRetry(() =>
        anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: enhancedSystemPrompt,
          tools: CLAUDE_TOOLS,
          messages,
        })
      );
    }

    // Extract final text response
    let responseText = '';
    for (const block of response.content as Anthropic.ContentBlock[]) {
      if (block.type === 'text') {
        responseText += (block as Anthropic.TextBlock).text;
      }
    }

    if (!usedAnyTool && isLikelyDataRequest(userMessage)) {
      return {
        response: `I want to avoid guessing and make sure this is accurate.

Please clarify the table or report you want (for example: "Family table" or a specific saved report name), and I will run it directly.`,
        queryExecuted: JSON.stringify({
          usedAnyTool: false,
          guardTriggered: true,
          executedTools,
          toolErrorCount,
        }),
      };
    }

    // Add provenance footer if we have query results
    if (provenance) {
      responseText += formatProvenance(provenance);
    }

    return {
      response: responseText,
      provenance,
      queryExecuted: JSON.stringify({
        usedAnyTool,
        guardTriggered: false,
        executedTools,
        toolErrorCount,
        iterations,
      }),
      queryResults,
    };

  } catch (error) {
    console.error('Error processing message:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
      return {
        response: "I'm sorry, but it looks like I don't have access to that information right now. Please check with your administrator.",
      };
    }
    
    if (errorMessage.includes('rate') || errorMessage.includes('overloaded') || errorMessage.includes('429')) {
      return {
        response: "I'm getting a lot of requests right now. Please wait a moment and try again.",
      };
    }
    
    return {
      response: "I had a bit of trouble with that request. Could you try asking in a different way? For example, 'How many families are enrolled?' or 'Show me the staff list'.",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format records for AI to summarize (hide field IDs)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRecordsForAI(
  records: any[],
  fields: { id: number; label: string; type: string }[]
): { records: any[]; totalCount: number } {
  const fieldMap = new Map(fields.map(f => [f.id.toString(), f.label]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatted = records.slice(0, 20).map((record: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clean: Record<string, any> = {};
    
    for (const [fieldId, fieldData] of Object.entries(record)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (fieldData as any)?.value;
      if (value !== undefined && value !== null && value !== '') {
        clean[fieldMap.get(fieldId) || `Field ${fieldId}`] = value;
      }
    }
    
    return clean;
  });

  return {
    records: formatted,
    totalCount: records.length,
  };
}

/**
 * Format report data for AI
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatReportForAI(reportData: any): any {
  if (reportData.data && reportData.fields) {
    const fieldMap = new Map<string, string>(
      reportData.fields.map((f: { id: number; label: string }) => [String(f.id), f.label])
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaned = reportData.data.slice(0, 20).map((row: any) => {
      const mapped: Record<string, unknown> = {};
      const keys = Object.keys(row);
      for (const key of keys) {
        const payload = row[key];
        const value = payload?.value;
        if (value !== undefined && value !== null && value !== '') {
          const fieldLabel = fieldMap.get(key) || `Field ${key}`;
          mapped[fieldLabel] = value;
        }
      }
      return mapped;
    });

    return {
      records: cleaned,
      totalRecords: reportData.metadata?.totalRecords || reportData.data.length,
    };
  }
  return reportData;
}

function isLikelyDataRequest(message: string): boolean {
  const text = message.toLowerCase();
  return /(how many|count|show me|list|run|find|search|table|field|report|attendance|enrollment|staff|class|records?)/.test(text);
}

/**
 * Format provenance footer - shows only the source
 */
function formatProvenance(provenance: Provenance): string {
  if (!provenance.source) {
    return '';
  }
  
  return `\n\n*Source: ${provenance.source}*`;
}

/**
 * Fix malformed markdown tables that are on a single line
 * Converts: | Col1 | Col2 | |---| | val1 | val2 |
 * To proper multi-line format
 */
function fixMarkdownTables(text: string): string {
  // Pattern to find inline tables: | header | header | |---| | data | data |
  // This regex finds pipe-separated content that looks like a table
  const inlineTablePattern = /(\|[^|]+\|(?:[^|]+\|)+)\s*(\|[-:]+\|(?:[-:]+\|)+)\s*(\|[^|]+\|(?:[^|]*\|)*)/g;
  
  return text.replace(inlineTablePattern, (match, header, separator, body) => {
    // Split the body into rows
    const bodyRows = body.trim().split(/\|\s*\|/).filter((r: string) => r.trim());
    
    // If we can parse it, format properly
    if (bodyRows.length > 0) {
      const formattedBody = bodyRows.map((row: string) => {
        const cells = row.split('|').filter((c: string) => c.trim());
        return '| ' + cells.join(' | ') + ' |';
      }).join('\n');
      
      return `${header.trim()}\n${separator.trim()}\n${formattedBody}`;
    }
    
    return match; // Return original if we can't parse
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY EXPORT - Keep backward compatibility
// ═══════════════════════════════════════════════════════════════════════════════

export { processMessage as default, fixMarkdownTables };
