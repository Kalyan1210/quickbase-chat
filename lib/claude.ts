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

// ═══════════════════════════════════════════════════════════════════════════════
// QUICKBASE QUERY EXAMPLES (for better AI accuracy)
// ═══════════════════════════════════════════════════════════════════════════════

const QUERY_EXAMPLES = `
## QuickBase Query Syntax - IMPORTANT EXAMPLES:

### Equality (field equals value):
- Filter by status: {6.EX.'Enrolled'}
- Filter by name: {8.EX.'John Smith'}

### Contains (field contains text):
- Name contains: {8.CT.'John'}

### Date Filters:
- This month: {12.IR.'this month'}
- This year: {12.IR.'this year'}
- Today: {12.EX.'today'}
- On or after date: {12.OAF.'2024-01-01'}
- On or before date: {12.OBF.'2024-12-31'}

### Comparisons:
- Greater than: {15.GT.100}
- Less than: {15.LT.50}
- Greater or equal: {15.GTE.10}
- Less or equal: {15.LTE.100}

### Combining Conditions:
- AND: {6.EX.'Enrolled'}AND{12.IR.'this month'}
- OR: {6.EX.'Active'}OR{6.EX.'Pending'}

### Common Patterns:
- Currently enrolled: {status_field.EX.'Enrolled'}
- Enrolled this month: {status.EX.'Enrolled'}AND{date_field.IR.'this month'}
- Enrolled this year: {status.EX.'Enrolled'}AND{date_field.IR.'this year'}
`;

/**
 * Format schema in a simple way (internal use only)
 */
function formatSchemaInternal(schema: QuickBaseTable[]): string {
  return schema.map(table => {
    const fieldsInfo = table.fields?.slice(0, 20).map(f => 
      `${f.label}[${f.id}]`
    ).join(', ') || 'No fields';
    return `${table.name}[${table.id}]: ${fieldsInfo}`;
  }).join('\n');
}

/**
 * Build system prompt for user-facing responses
 */
function buildUserFacingPrompt(): string {
  return `You are a friendly data assistant for an Early Education program. 

## YOUR PERSONALITY:
- Warm, helpful, and conversational
- Speak in plain English - NO technical terms
- Never mention field IDs, table IDs, or database terms
- Never show query syntax to users
- Act like a helpful colleague, not a computer

## HOW TO RESPOND:
- Give clear, direct answers
- Use simple language anyone can understand
- If showing numbers, present them clearly
- If showing lists, use bullet points or simple tables
- Be encouraging and supportive

## EXAMPLES OF GOOD RESPONSES:
- "You have 245 children currently enrolled in your programs."
- "Here are the families who joined this month..."
- "I found 12 staff members in the system."

## EXAMPLES OF BAD RESPONSES (NEVER DO THIS):
- "The Family table (ID:brxeprirp) contains..." ❌
- "Using field ID 197 to query..." ❌
- "The query {6.EX.'Enrolled'} returned..." ❌

Remember: Users are educators and administrators, not tech people. Keep it simple and friendly!`;
}

/**
 * Extract query plan from AI response (internal, can be technical)
 */
async function extractQueryPlan(
  userMessage: string,
  schema: QuickBaseTable[],
  conversationHistory: ChatMessage[]
): Promise<QueryPlan> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
  const schemaInfo = formatSchemaInternal(schema);
  
  const planningPrompt = `You are a QuickBase query generator. Generate the correct query for this request.

USER QUESTION: "${userMessage}"

AVAILABLE TABLES AND FIELDS (format: FieldName[FieldID]):
${schemaInfo}

${QUERY_EXAMPLES}

RESPOND WITH ONLY A JSON OBJECT (no markdown, no backticks, no explanation):
{
  "intent": "query" or "count" or "list" or "help" or "clarify",
  "tableId": "the table ID to query (e.g., brxeprirp)",
  "tableName": "human readable table name",
  "query": {
    "select": [array of field IDs as numbers],
    "where": "QuickBase query string using EXACT syntax from examples above",
    "top": 25
  },
  "explanation": "what this query does"
}

IMPORTANT RULES:
1. Use EXACT query syntax from the examples above
2. Field IDs must be numbers, not strings
3. For "enrolled" status, look for fields like "Enrollment Status", "Status", etc.
4. For date filters, use IR (in range) operator
5. If unsure about the query, use intent "help" or "clarify"
6. For counting records, use intent "count"`;

  try {
    const result = await model.generateContent(planningPrompt);
    const text = result.response.text();
    
    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as QueryPlan;
      
      // Validate the query syntax
      if (parsed.query?.where) {
        // Basic validation - check for common mistakes
        const where = parsed.query.where;
        if (where.includes('BTW') || where.includes('(M,') || where.includes('OAF.\'21\'')) {
          console.warn('Invalid query syntax detected, falling back to help');
          return { intent: 'help', explanation: 'Query syntax was invalid' };
        }
      }
      
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse query plan:', error);
  }

  return { intent: 'help', explanation: 'Could not determine query requirements' };
}

/**
 * Generate user-friendly response based on query results
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
    systemInstruction: buildUserFacingPrompt(),
  });
  
  // Build conversation history for Gemini format
  const history = conversationHistory.slice(-6).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const chat = model.startChat({ history });
  
  // Build a clean prompt without exposing technical details
  let prompt = userMessage;
  
  if (queryResults) {
    if (queryResults.count !== undefined) {
      prompt = `User asked: "${userMessage}"\n\nThe data shows: ${queryResults.count} records found.\n\nProvide a friendly, clear response.`;
    } else if (queryResults.data) {
      const recordCount = queryResults.metadata?.totalRecords || queryResults.data.length;
      prompt = `User asked: "${userMessage}"\n\nFound ${recordCount} records. Here's the data:\n${JSON.stringify(queryResults.data.slice(0, 10), null, 2)}\n\nPresent this information in a friendly, easy-to-read format. DO NOT mention field IDs or technical terms.`;
    } else if (queryResults.tables) {
      const tableNames = queryResults.tables.map((t: {name: string}) => t.name).join(', ');
      prompt = `User asked: "${userMessage}"\n\nAvailable data categories: ${tableNames}\n\nExplain what data is available in friendly terms.`;
    }
  }

  try {
    const result = await chat.sendMessage(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Error generating response:', error);
    return "I'm sorry, I had trouble processing that. Could you try asking in a different way?";
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
    const greetings = ['hi', 'hello', 'hey', 'help', 'what can you do', 'good morning', 'good afternoon'];
    
    if (greetings.some(g => lowerMessage === g || (lowerMessage.includes(g) && lowerMessage.length < 25))) {
      return {
        response: `Hi there! 👋 I'm your Early Education data assistant.

I can help you with questions like:
• "How many children are currently enrolled?"
• "Show me families who enrolled this month"
• "How many staff members do we have?"
• "List the classes in our program"

Just ask me anything about your program data and I'll find the answer for you!`,
      };
    }

    // Get the app schema for context
    const schema = await qbClient.getAppSchema();
    
    // Determine what query to execute (if any)
    const queryPlan = await extractQueryPlan(userMessage, schema, conversationHistory);
    
    console.log('Query plan:', JSON.stringify(queryPlan, null, 2));
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryResults: any = null;
    
    // Execute the query if needed
    if (queryPlan.intent === 'query' && queryPlan.tableId && queryPlan.query) {
      try {
        queryResults = await qbClient.queryRecords(queryPlan.tableId, {
          select: queryPlan.query.select,
          where: queryPlan.query.where,
          sortBy: queryPlan.query.sortBy,
          top: queryPlan.query.top || 25,
        });
      } catch (queryError) {
        console.error('Query execution failed:', queryError);
        // Fall back to count if query fails
        try {
          const count = await qbClient.getRecordCount(queryPlan.tableId);
          queryResults = { count, note: 'Simplified count due to query complexity' };
        } catch {
          queryResults = null;
        }
      }
    } else if (queryPlan.intent === 'count' && queryPlan.tableId) {
      try {
        const count = await qbClient.getRecordCount(
          queryPlan.tableId,
          queryPlan.query?.where
        );
        queryResults = { count };
      } catch (countError) {
        console.error('Count query failed:', countError);
        // Try without filter
        try {
          const count = await qbClient.getRecordCount(queryPlan.tableId);
          queryResults = { count, note: 'Total count (filter could not be applied)' };
        } catch {
          queryResults = null;
        }
      }
    } else if (queryPlan.intent === 'list') {
      queryResults = { tables: schema.map(t => ({ name: t.name })) };
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
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
      return {
        response: "I'm sorry, but it looks like you don't have access to that information. Please check with your administrator if you think this is a mistake.",
      };
    }
    
    return {
      response: "I'm having a bit of trouble with that request. Could you try asking in a different way? For example, 'How many children are enrolled?' or 'Show me recent enrollments'.",
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
    systemInstruction: buildUserFacingPrompt(),
  });

  try {
    const result = await model.generateContent(userMessage);
    return result.response.text();
  } catch (error) {
    console.error('Error generating help response:', error);
    return "Hi! I'm here to help you with your Early Education data. What would you like to know?";
  }
}
