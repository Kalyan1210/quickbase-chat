import Anthropic from '@anthropic-ai/sdk';
import { QuickBaseClient, QuickBaseTable } from './quickbase';

// ═══════════════════════════════════════════════════════════════════════════════
// CLAUDE AI INTEGRATION
// Handles natural language processing and QuickBase query generation
// ═══════════════════════════════════════════════════════════════════════════════

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QueryPlan {
  intent: 'query' | 'count' | 'list' | 'report' | 'help' | 'clarify';
  tableId?: string;
  tableName?: string;
  query?: {
    select?: number[];
    where?: string;
    sortBy?: { fieldId: number; order: 'ASC' | 'DESC' }[];
    top?: number;
  };
  reportId?: string;
  explanation: string;
}

/**
 * Format the app schema for the AI context
 */
function formatSchemaForAI(schema: QuickBaseTable[]): string {
  return schema.map(table => {
    const fieldsInfo = table.fields?.map(f => 
      `    - ${f.label} (ID: ${f.id}, Type: ${f.fieldType}${f.required ? ', Required' : ''})`
    ).join('\n') || '    No fields available';
    
    return `📋 Table: ${table.name} (ID: ${table.id})
   ${table.description || 'No description'}
   Fields:
${fieldsInfo}`;
  }).join('\n\n');
}

/**
 * Build the system prompt with QuickBase schema
 */
function buildSystemPrompt(schema: QuickBaseTable[]): string {
  const schemaInfo = formatSchemaForAI(schema);
  
  return `You are an intelligent assistant for the Early Education QuickBase application. You help users query and understand their data using natural language.

## Your Capabilities
- Answer questions about data in QuickBase
- Generate appropriate queries to fetch the requested information
- Provide clear, helpful explanations of the data
- Guide users on what data is available

## QuickBase Application Schema
${schemaInfo}

## Query Syntax Reference
When generating QuickBase queries, use this syntax:
- Equality: {'fieldId'.EX.'value'}
- Contains: {'fieldId'.CT.'value'}
- Greater than: {'fieldId'.GT.'value'}
- Less than: {'fieldId'.LT.'value'}
- Date range: {'fieldId'.IR.'this month'}, {'fieldId'.IR.'last week'}
- AND: {condition1}AND{condition2}
- OR: {condition1}OR{condition2}

## Response Guidelines
1. Always be helpful and explain what data you're fetching
2. If you need to query data, explain what you're looking for
3. Present data in a clear, readable format (use tables for multiple records)
4. If a question is unclear, ask for clarification
5. If data isn't available, explain what IS available
6. Keep responses concise but informative

## Important
- You can ONLY READ data, never modify or delete
- Always respect that users may have different permission levels
- If a query returns no results, explain possible reasons`;
}

/**
 * Extract query plan from AI response
 */
async function extractQueryPlan(
  userMessage: string,
  schema: QuickBaseTable[],
  conversationHistory: ChatMessage[]
): Promise<QueryPlan> {
  const planningPrompt = `Based on the user's question, determine what QuickBase query (if any) should be executed.

User Question: "${userMessage}"

Available Tables:
${schema.map(t => `- ${t.name} (ID: ${t.id}): ${t.fields?.map(f => f.label).join(', ')}`).join('\n')}

Respond with a JSON object:
{
  "intent": "query" | "count" | "list" | "report" | "help" | "clarify",
  "tableId": "table ID if querying",
  "tableName": "human readable table name",
  "query": {
    "select": [field IDs to select],
    "where": "QuickBase query string or null",
    "sortBy": [{"fieldId": 1, "order": "DESC"}] or null,
    "top": number of records (default 25)
  },
  "explanation": "Brief explanation of what query will do"
}

If the question doesn't require a QuickBase query (like greetings or help requests), use intent "help".
If you need more information from the user, use intent "clarify".`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: planningPrompt }
    ],
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return { intent: 'help', explanation: 'Could not parse query plan' };
  }

  try {
    // Extract JSON from the response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as QueryPlan;
    }
  } catch {
    console.error('Failed to parse query plan');
  }

  return { intent: 'help', explanation: 'Could not determine query requirements' };
}

/**
 * Generate a natural language response based on query results
 */
async function generateResponse(
  userMessage: string,
  queryPlan: QueryPlan,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryResults: any,
  schema: QuickBaseTable[],
  conversationHistory: ChatMessage[]
): Promise<string> {
  const systemPrompt = buildSystemPrompt(schema);
  
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...conversationHistory.slice(-10), // Last 10 messages for context
    {
      role: 'user',
      content: `${userMessage}

[SYSTEM: Query executed: ${queryPlan.explanation}
Results: ${JSON.stringify(queryResults, null, 2)}]`
    }
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const textContent = response.content.find(block => block.type === 'text');
  return textContent && textContent.type === 'text' ? textContent.text : 'I apologize, but I could not generate a response.';
}

/**
 * Process a user message and generate a response
 */
export async function processMessage(
  userMessage: string,
  qbClient: QuickBaseClient,
  conversationHistory: ChatMessage[] = []
): Promise<{
  response: string;
  queryExecuted?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryResults?: any;
}> {
  try {
    // Get the app schema for context
    const schema = await qbClient.getAppSchema();
    
    // Determine what query to execute (if any)
    const queryPlan = await extractQueryPlan(userMessage, schema, conversationHistory);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryResults: any = null;
    
    // Execute the query if needed
    if (queryPlan.intent === 'query' && queryPlan.tableId && queryPlan.query) {
      queryResults = await qbClient.queryRecords(queryPlan.tableId, {
        select: queryPlan.query.select,
        where: queryPlan.query.where,
        sortBy: queryPlan.query.sortBy,
        top: queryPlan.query.top || 25,
      });
    } else if (queryPlan.intent === 'count' && queryPlan.tableId) {
      const count = await qbClient.getRecordCount(
        queryPlan.tableId,
        queryPlan.query?.where
      );
      queryResults = { count };
    } else if (queryPlan.intent === 'list') {
      // Just list available tables/fields
      queryResults = { tables: schema.map(t => ({ name: t.name, id: t.id })) };
    }
    
    // Generate natural language response
    const response = await generateResponse(
      userMessage,
      queryPlan,
      queryResults,
      schema,
      conversationHistory
    );
    
    return {
      response,
      queryExecuted: queryPlan.explanation,
      queryResults,
    };
  } catch (error) {
    console.error('Error processing message:', error);
    
    // Generate a helpful error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
      return {
        response: "I'm sorry, but you don't have permission to access that data. Please contact your QuickBase administrator if you believe you should have access.",
      };
    }
    
    return {
      response: "I encountered an error while processing your request. Please try rephrasing your question or contact support if the issue persists.",
    };
  }
}

/**
 * Simple greeting/help response without querying QuickBase
 */
export async function generateHelpResponse(
  userMessage: string,
  schemaContext: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You are a helpful assistant for the Early Education QuickBase application. 
Help users understand what data is available and how to ask questions.

Available data:
${schemaContext}

Be friendly, concise, and guide users on what they can ask about.`,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textContent = response.content.find(block => block.type === 'text');
  return textContent && textContent.type === 'text' ? textContent.text : 'Hello! How can I help you with your Early Education data today?';
}

