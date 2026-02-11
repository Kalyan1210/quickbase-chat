// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI AI SERVICE WITH FUNCTION CALLING
// Uses structured tools for reliable, deterministic query generation
// ═══════════════════════════════════════════════════════════════════════════════

import { GoogleGenerativeAI, FunctionCallingMode, FunctionResponsePart } from '@google/generative-ai';
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
  TABLE_CONFIG,
} from './tools';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

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

## YOUR PERSONALITY:
- Warm, helpful, and conversational
- Speak in plain English - NO technical terms
- Never mention field IDs, table IDs, database terms, or query syntax
- Act like a helpful colleague, not a computer

## HOW TO USE TOOLS:
You have access to tools to query the data. ALWAYS use a tool when the user asks about data.

**Core Tools (reliable, use first):**
- 'count_records' - for "how many" questions about families, children, staff, classes
- 'list_records' - for "show me" or "list" requests
- 'run_report' - for pre-configured summary reports
- 'get_help' - when the user needs guidance

**Exploration Tools (for discovery):**
- 'explore_all_tables' - when user asks "what tables exist", "what data is available", "how many tables"
- 'explore_table_fields' - when user asks about structure of a specific table
- 'list_table_reports' - when user asks "what reports exist" for a table
- 'run_dynamic_report' - to run any report by name (after listing reports)
- 'query_any_table' - fallback for tables not in the core list

## RESPONSE STYLE:
- Give clear, direct answers
- Use simple language anyone can understand
- Present numbers clearly
- Use bullet points for lists
- When listing tables, organize them into categories if possible
- Be encouraging and supportive

## NEVER DO THIS:
- Never make up numbers without using a tool
- Never mention field IDs or technical database terms to users
- Never show query syntax to users
- Never say "I don't have access" - you DO have access via tools`;

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
): Promise<{ records: any[]; provenance: Provenance }> {
  const query = buildListQuery(params);
  
  const result = await qbClient.queryRecords(query.tableId, {
    select: query.select,
    where: query.where,
    top: query.top,
  });
  
  return {
    records: result.data,
    provenance: {
      source: `${query.tableName} table`,
      filter: params.status ? `Status: ${params.status}` : undefined,
      timestamp: new Date().toISOString(),
      recordCount: result.metadata.totalRecords,
    },
  };
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
// EXPLORATION TOOL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find a table by name (partial match)
 */
async function findTableByName(
  tableName: string,
  qbClient: QuickBaseClient
): Promise<{ id: string; name: string } | null> {
  const tables = await qbClient.getTables();
  const lowerName = tableName.toLowerCase();
  
  // Try exact match first
  let match = tables.find(t => t.name.toLowerCase() === lowerName);
  
  // Try partial match
  if (!match) {
    match = tables.find(t => t.name.toLowerCase().includes(lowerName));
  }
  
  // Try matching individual words
  if (!match) {
    const words = lowerName.split(/\s+/);
    match = tables.find(t => {
      const tableLower = t.name.toLowerCase();
      return words.every(word => tableLower.includes(word));
    });
  }
  
  return match ? { id: match.id, name: match.name } : null;
}

/**
 * Explore fields of a table
 */
async function exploreTableFields(
  tableName: string,
  qbClient: QuickBaseClient
): Promise<{ tableName: string; fieldCount: number; fields: { name: string; type: string }[] }> {
  const table = await findTableByName(tableName, qbClient);
  
  if (!table) {
    return {
      tableName: tableName,
      fieldCount: 0,
      fields: [],
    };
  }
  
  const fields = await qbClient.getTableFields(table.id);
  
  return {
    tableName: table.name,
    fieldCount: fields.length,
    fields: fields.slice(0, 50).map(f => ({
      name: f.label,
      type: f.fieldType,
    })),
  };
}

/**
 * List reports for a table
 */
async function listTableReports(
  tableName: string,
  qbClient: QuickBaseClient
): Promise<{ tableName: string; reportCount: number; reports: { name: string; description?: string }[] }> {
  const table = await findTableByName(tableName, qbClient);
  
  if (!table) {
    return {
      tableName: tableName,
      reportCount: 0,
      reports: [],
    };
  }
  
  const reports = await qbClient.getReports(table.id);
  
  return {
    tableName: table.name,
    reportCount: reports.length,
    reports: reports.map(r => ({
      name: r.name,
      description: r.description,
    })),
  };
}

/**
 * Run a report by name
 */
async function runDynamicReport(
  tableName: string,
  reportName: string,
  qbClient: QuickBaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any; tableName: string; reportName: string }> {
  const table = await findTableByName(tableName, qbClient);
  
  if (!table) {
    throw new Error(`Table "${tableName}" not found`);
  }
  
  const reports = await qbClient.getReports(table.id);
  const lowerReportName = reportName.toLowerCase();
  
  // Find report by name
  let report = reports.find(r => r.name.toLowerCase() === lowerReportName);
  if (!report) {
    report = reports.find(r => r.name.toLowerCase().includes(lowerReportName));
  }
  
  if (!report) {
    throw new Error(`Report "${reportName}" not found in ${table.name}`);
  }
  
  const result = await qbClient.runReport(table.id, report.id);
  
  return {
    data: result,
    tableName: table.name,
    reportName: report.name,
  };
}

/**
 * Query any table dynamically
 */
async function queryAnyTable(
  tableName: string,
  action: string,
  limit: number,
  qbClient: QuickBaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ result: any; tableName: string; count: number }> {
  const table = await findTableByName(tableName, qbClient);
  
  if (!table) {
    throw new Error(`Table "${tableName}" not found`);
  }
  
  if (action === 'count') {
    const count = await qbClient.getRecordCount(table.id);
    return {
      result: { count },
      tableName: table.name,
      count,
    };
  } else {
    // List action - get basic fields
    const fields = await qbClient.getTableFields(table.id);
    // Select first few important-looking fields (usually ID and name-like fields)
    const selectFields = fields
      .slice(0, 5)
      .map(f => f.id);
    
    const result = await qbClient.queryRecords(table.id, {
      select: selectFields,
      top: Math.min(limit, 25),
    });
    
    // Format records with field labels
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
    
    return {
      result: {
        records: formattedRecords,
        totalCount: result.metadata.totalRecords,
        showing: formattedRecords.length,
      },
      tableName: table.name,
      count: result.metadata.totalRecords,
    };
  }
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

    // Create model with function calling
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: TOOLS }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.AUTO,
        },
      },
    });

    // Build conversation history
    const history = conversationHistory.slice(-6).map(msg => ({
      role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history });

    // Send user message
    let result = await chat.sendMessage(userMessage);
    let response = result.response;
    
    // Process tool calls
    let provenance: Provenance | undefined;
    let queryResults: unknown;
    let iterations = 0;
    const maxIterations = 3;

    while (iterations < maxIterations) {
      const functionCalls = response.functionCalls();
      
      if (!functionCalls || functionCalls.length === 0) {
        break;
      }

      // Execute each function call
      const functionResponses: FunctionResponsePart[] = [];

      for (const call of functionCalls) {
        console.log(`Executing tool: ${call.name}`, call.args);
        
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let toolResult: any;

          switch (call.name) {
            case 'count_records': {
              const countResult = await executeCountRecords(
                call.args as CountParams,
                qbClient
              );
              toolResult = { count: countResult.count };
              provenance = countResult.provenance;
              queryResults = countResult;
              break;
            }

            case 'list_records': {
              const listResult = await executeListRecords(
                call.args as ListParams,
                qbClient
              );
              // Format records for AI consumption
              toolResult = formatRecordsForAI(listResult.records, (call.args as ListParams).table);
              provenance = listResult.provenance;
              queryResults = listResult;
              break;
            }

            case 'run_report': {
              const reportResult = await executeRunReport(
                call.args as ReportParams,
                qbClient
              );
              toolResult = formatReportForAI(reportResult.data);
              provenance = reportResult.provenance;
              queryResults = reportResult;
              break;
            }

            case 'get_help': {
              toolResult = executeGetHelp(call.args as { topic?: string });
              break;
            }

            // ─────────────────────────────────────────────────────────────────
            // EXPLORATION TOOLS
            // ─────────────────────────────────────────────────────────────────
            case 'explore_all_tables': {
              const tables = await qbClient.getTables();
              toolResult = {
                tableCount: tables.length,
                tables: tables.map(t => ({ name: t.name, description: t.description || '' })),
              };
              provenance = {
                source: 'QuickBase App Schema',
                timestamp: new Date().toISOString(),
                recordCount: tables.length,
              };
              break;
            }

            case 'explore_table_fields': {
              const args = call.args as { tableName: string };
              const fieldsResult = await exploreTableFields(args.tableName, qbClient);
              toolResult = fieldsResult;
              provenance = {
                source: `${fieldsResult.tableName || args.tableName} table structure`,
                timestamp: new Date().toISOString(),
                recordCount: fieldsResult.fieldCount,
              };
              break;
            }

            case 'list_table_reports': {
              const args = call.args as { tableName: string };
              const reportsResult = await listTableReports(args.tableName, qbClient);
              toolResult = reportsResult;
              provenance = {
                source: `Reports for ${reportsResult.tableName || args.tableName}`,
                timestamp: new Date().toISOString(),
                recordCount: reportsResult.reportCount,
              };
              break;
            }

            case 'run_dynamic_report': {
              const args = call.args as { tableName: string; reportName: string };
              const dynamicResult = await runDynamicReport(args.tableName, args.reportName, qbClient);
              toolResult = formatReportForAI(dynamicResult.data);
              provenance = {
                source: `"${args.reportName}" report`,
                timestamp: new Date().toISOString(),
                recordCount: dynamicResult.data?.metadata?.totalRecords || dynamicResult.data?.data?.length,
              };
              queryResults = dynamicResult;
              break;
            }

            case 'query_any_table': {
              const args = call.args as { tableName: string; action: string; limit?: number };
              const dynamicQueryResult = await queryAnyTable(args.tableName, args.action, args.limit || 10, qbClient);
              toolResult = dynamicQueryResult.result;
              provenance = {
                source: `${dynamicQueryResult.tableName} table`,
                timestamp: new Date().toISOString(),
                recordCount: dynamicQueryResult.count,
              };
              queryResults = dynamicQueryResult;
              break;
            }

            default:
              toolResult = { error: `Unknown function: ${call.name}` };
          }

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: toolResult,
            },
          });
        } catch (error) {
          console.error(`Tool execution error for ${call.name}:`, error);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: error instanceof Error ? error.message : 'Tool execution failed' },
            },
          });
        }
      }

      // Send function results back to AI
      result = await chat.sendMessage(functionResponses as unknown as string);
      response = result.response;
      iterations++;
    }

    // Get final text response
    let responseText = response.text();

    // Add provenance footer if we have query results
    if (provenance) {
      responseText += formatProvenance(provenance);
    }

    return {
      response: responseText,
      provenance,
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
    
    if (errorMessage.includes('rate') || errorMessage.includes('quota')) {
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
function formatRecordsForAI(records: any[], tableType: string): { records: any[]; totalCount: number } {
  const config = TABLE_CONFIG[tableType];
  if (!config) {
    return { records: records.slice(0, 10), totalCount: records.length };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatted = records.slice(0, 20).map((record: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clean: Record<string, any> = {};
    
    for (const [fieldId, fieldData] of Object.entries(record)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (fieldData as any)?.value;
      if (value !== undefined && value !== null && value !== '') {
        // Use field ID as key but value is clean
        clean[`field_${fieldId}`] = value;
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
  if (reportData.data) {
    return {
      records: reportData.data.slice(0, 20),
      totalRecords: reportData.metadata?.totalRecords || reportData.data.length,
    };
  }
  return reportData;
}

/**
 * Format provenance footer
 */
function formatProvenance(provenance: Provenance): string {
  const parts = [];
  
  if (provenance.source) {
    parts.push(`Source: ${provenance.source}`);
  }
  
  if (provenance.filter) {
    parts.push(provenance.filter);
  }
  
  const date = new Date(provenance.timestamp);
  parts.push(`As of: ${date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`);

  return `\n\n---\n*${parts.join(' | ')}*`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY EXPORT - Keep backward compatibility
// ═══════════════════════════════════════════════════════════════════════════════

export { processMessage as default };

