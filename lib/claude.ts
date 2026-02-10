import { GoogleGenerativeAI } from '@google/generative-ai';
import { QuickBaseClient, QuickBaseTable } from './quickbase';

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI AI INTEGRATION
// Handles natural language processing and QuickBase query generation
// ═══════════════════════════════════════════════════════════════════════════════

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

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
 * Format the app schema for the AI context (simplified to reduce tokens)
 */
function formatSchemaForAI(schema: QuickBaseTable[]): string {
  return schema.map(table => {
    // Only include first 15 most important fields to reduce token usage
    const fieldsInfo = table.fields?.slice(0, 15).map(f => 
      `${f.label} (ID:${f.id}, ${f.fieldType})`
    ).join(', ') || 'No fields';
    
    return `• ${table.name} (ID:${table.id}): ${fieldsInfo}`;
  }).join('\n');
}

/**
 * Build a compact system prompt with QuickBase schema
 */
function buildSystemPrompt(schema: QuickBaseTable[]): string {
  const schemaInfo = formatSchemaForAI(schema);
  
  return `You are an assistant for Early Education QuickBase app. Help users query their data.

## Available Tables & Fields:
${schemaInfo}

## Query Syntax:
- Equality: {'fieldId'.EX.'value'}
- Contains: {'fieldId'.CT.'value'}
- Greater/Less: {'fieldId'.GT.'value'}, {'fieldId'.LT.'value'}
- AND/OR: {cond1}AND{cond2}, {cond1}OR{cond2}

## Rules:
- READ only, never modify data
- Be concise and helpful
- Present data in clear tables
- Ask for clarification if needed`;
}

/**
 * Extract query plan from AI response
 */
async function extractQueryPlan(
  userMessage: string,
  schema: QuickBaseTable[],
  conversationHistory: ChatMessage[]
): Promise<QueryPlan> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
  const planningPrompt = `Based on the user's question, determine what QuickBase query (if any) should be executed.

User Question: "${userMessage}"

Available Tables:
${schema.map(t => `- ${t.name} (ID: ${t.id}): ${t.fields?.slice(0, 10).map(f => f.label).join(', ')}`).join('\n')}

Respond with ONLY a JSON object (no markdown, no explanation):
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

If the question doesn't require a QuickBase query (like greetings), use intent "help".`;

  try {
    const result = await model.generateContent(planningPrompt);
    const response = result.response;
    const text = response.text();

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as QueryPlan;
    }
  } catch (error) {
    console.error('Failed to parse query plan:', error);
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
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    systemInstruction: buildSystemPrompt(schema),
  });
  
  // Build conversation history for Gemini format
  const history = conversationHistory.slice(-10).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const chat = model.startChat({ history });
  
  const prompt = queryResults 
    ? `${userMessage}\n\n[Query: ${queryPlan.explanation}]\n[Results: ${JSON.stringify(queryResults, null, 2)}]`
    : userMessage;

  try {
    const result = await chat.sendMessage(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Error generating response:', error);
    return 'I apologize, but I could not generate a response. Please try again.';
  }
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
    // Handle simple greetings without loading schema
    const lowerMessage = userMessage.toLowerCase().trim();
    if (['hi', 'hello', 'hey', 'help', 'what can you do'].some(g => lowerMessage.includes(g)) && lowerMessage.length < 20) {
      return {
        response: `Hello! I'm your Early Education data assistant. I can help you:

• **Query student data** - "How many students are enrolled?"
• **Find records** - "Show me students from [location]"
• **Get counts** - "How many classes are there?"
• **View reports** - "Show enrollment by program"

What would you like to know about your data?`,
      };
    }

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
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    systemInstruction: `You are a helpful assistant for the Early Education QuickBase application. 
Help users understand what data is available and how to ask questions.

Available data:
${schemaContext}

Be friendly, concise, and guide users on what they can ask about.`,
  });

  try {
    const result = await model.generateContent(userMessage);
    return result.response.text();
  } catch (error) {
    console.error('Error generating help response:', error);
    return 'Hello! How can I help you with your Early Education data today?';
  }
}
