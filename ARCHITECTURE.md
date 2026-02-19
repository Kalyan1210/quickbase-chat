# QuickBase AI Chat - Technical Architecture

> A comprehensive guide to how the AI system works, what tools it uses, and how data flows through the application.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [AI Model & Function Calling](#ai-model--function-calling)
3. [Available Tools](#available-tools)
4. [Business Data Dictionary](#business-data-dictionary)
5. [Schema Cache System](#schema-cache-system)
6. [RAG (Retrieval-Augmented Generation)](#rag-retrieval-augmented-generation)
7. [Data Flow Diagram](#data-flow-diagram)
8. [QuickBase Data Access](#quickbase-data-access)
9. [Verified Q&A Training System](#verified-qa-training-system)
10. [User Feedback Loop](#user-feedback-loop)
11. [Configuration & Environment](#configuration--environment)

---

## System Overview

The QuickBase AI Chat is a natural language interface that allows users to query an Early Education program's data stored in QuickBase. The system uses:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **AI Model** | Claude Opus 4 (Anthropic) | Natural language understanding & response generation |
| **Backend** | Next.js 14 (TypeScript) | API routes & server-side processing |
| **Database** | PostgreSQL (Azure) | User sessions, conversations, verified Q&A examples |
| **Data Source** | QuickBase REST API | Real-time access to 80+ tables and 900+ reports |
| **Authentication** | Azure AD + NextAuth.js | Secure user authentication |

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│                   (React Chat Component)                        │
├─────────────────────────────────────────────────────────────────┤
│                        API LAYER                                │
│                  (/api/chat/route.ts)                          │
├─────────────────────────────────────────────────────────────────┤
│                     AI SERVICE LAYER                            │
│              (lib/gemini.ts - Claude Integration)               │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│   │ Tool Defs   │  │ RAG Service │  │ Schema Cache        │   │
│   │(lib/tools.ts)│  │(training-   │  │(lib/schema-cache.ts)│   │
│   │             │  │ service.ts) │  │                     │   │
│   └─────────────┘  └─────────────┘  └─────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                   DATA ACCESS LAYER                             │
│              (lib/quickbase.ts - QB Client)                     │
├─────────────────────────────────────────────────────────────────┤
│                    EXTERNAL SERVICES                            │
│   ┌─────────────────────┐    ┌─────────────────────────────┐   │
│   │ QuickBase API       │    │ PostgreSQL Database         │   │
│   │ (80+ tables,        │    │ (Users, Conversations,      │   │
│   │  900+ reports)      │    │  Verified Q&A, Feedback)    │   │
│   └─────────────────────┘    └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## AI Model & Function Calling

### Model: Claude Opus 4 (Anthropic)

The system uses **Claude Opus 4** (`claude-sonnet-4-20250514`) with native tool calling for reliable, deterministic query generation.

**Why Claude?**
- Higher rate limits than free-tier AI models
- Native tool calling support (function calling)
- Better reasoning for complex queries
- Consistent, reliable responses

### System Prompt

The AI is configured with a detailed system prompt that establishes:

```
You are a friendly data assistant for an Early Education program called Horizons.

YOUR CAPABILITIES:
- Full access to 80+ QuickBase tables
- Access to 900+ saved reports
- All fields and record counts

YOUR PERSONALITY:
- Warm, helpful, and conversational
- Plain English - NO technical jargon
- Never mention field IDs, table IDs, or query syntax
- Act like a helpful colleague
```

### Function Calling Flow

```
User Message
     │
     ▼
┌─────────────────┐
│ Claude AI       │
│ Analyzes intent │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Tool Selection                  │
│ AI decides which tool to call   │
│ e.g., count_records, run_report │
└────────────────┬────────────────┘
                 │
         ┌───────┴───────┐
         ▼               ▼
┌─────────────┐   ┌─────────────┐
│ Execute     │   │ Execute     │
│ Tool #1     │   │ Tool #2     │
└──────┬──────┘   └──────┬──────┘
       │                 │
       └────────┬────────┘
                ▼
┌─────────────────────────────────┐
│ Claude AI                       │
│ Formats results as natural      │
│ language response               │
└────────────────┬────────────────┘
                 │
                 ▼
          Final Response
          to User
```

---

## Available Tools

The AI has access to **10 tools** divided into two categories:

### Core Tools (Fast & Reliable)

These are pre-configured for the most common questions:

| Tool | Description | Use Case |
|------|-------------|----------|
| `count_records` | Count records with filters | "How many families are enrolled?" |
| `list_records` | List records with details | "Show me enrolled children" |
| `run_report` | Run pre-configured reports | "Show me expiring authorizations" |
| `get_help` | Provide guidance | "What can you help me with?" |

### Exploration Tools (Dynamic Discovery)

These provide access to ALL data in QuickBase:

| Tool | Description | Use Case |
|------|-------------|----------|
| `explore_all_tables` | List all 80+ tables | "What tables exist?" |
| `explore_table_fields` | Show fields for any table | "What fields does Family have?" |
| `list_table_reports` | Show reports for a table | "What reports exist for Clients?" |
| `search_all_reports` | Search 900+ reports | "Find reports about attendance" |
| `run_dynamic_report` | Run any report by name | "Run the Monthly Enrollment report" |
| `query_any_table` | Query any table | "Count records in Head Start table" |

### Tool Definition Example

```typescript
{
  name: 'count_records',
  description: 'Count records in a known table.',
  parameters: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        enum: ['families', 'children', 'staff', 'classes', 'attendance', 'icp', 'waitlist'],
      },
      status: {
        type: 'string',
        enum: ['enrolled', 'waitlist', 'alumni', 'active', 'all'],
      },
      dateRange: {
        type: 'string',
        enum: ['today', 'this_week', 'this_month', 'last_month', 'this_year'],
      },
    },
    required: ['table'],
  },
}
```

---

## Business Data Dictionary

The system includes a **Business Dictionary** that maps user-friendly terms to technical QuickBase IDs. This ensures consistent, reliable queries.

### Table Configuration (`TABLE_CONFIG`)

| User Term | QuickBase Table ID | Display Name | Status Field | Date Field |
|-----------|-------------------|--------------|--------------|------------|
| `families` | `brxeprirp` | Family | Field 105 | Field 106 |
| `children` | `br34gm4mb` | Child | Field 6 | Field 7 |
| `class_enrollments` | `br2egi5x3` | Class Enrollment | Field 27 | Field 6 |
| `staff` | `brxen3xg9` | Staff | - | - |
| `classes` | `br2ege78m` | Class | Field 18 | Field 16 |
| `attendance` | `br2egp69w` | Attendance | - | Field 10 |
| `icp` | `bvefn87vt` | ICP | - | - |
| `waitlist` | `brxeprirp` | Waitlist | Field 105 | - |

### Status Mappings

| User Says | Translates To |
|-----------|---------------|
| "enrolled" | `{'105'.EX.'Enrolled'}` |
| "waitlist" | `{'105'.EX.'Waitlist'}` |
| "active" | Uses table's enrolled value |
| "all" | No status filter |

### Date Range Mappings

| User Says | QuickBase Syntax |
|-----------|------------------|
| "today" | `{'field'.IR.'today'}` |
| "this week" | `{'field'.IR.'this week'}` |
| "this month" | `{'field'.IR.'this month'}` |
| "last month" | `{'field'.IR.'last month'}` |
| "this year" | `{'field'.IR.'this year'}` |

### Pre-Configured Reports (`REPORT_CONFIG`)

| Report Key | Table ID | Report ID | Description |
|------------|----------|-----------|-------------|
| `current_enrollment` | brxeprirp | 38 | Current Enrollment Summary |
| `enrollment_by_coordinator` | brxeprirp | 83 | Enrollment by Family Coordinator |
| `expiring_authorizations` | brxeprirp | 31 | Expiring Authorizations |
| `families_missing_data` | brxeprirp | 29 | Families Missing HHC Staff Assignment |
| `waitlist_summary` | brxeprirp | 113 | Summary Report - Partner & Waitlist |

---

## Schema Cache System

The system maintains an **in-memory cache** of the entire QuickBase schema for fast lookups without repeated API calls.

### What's Cached

| Data Type | Count | Cache Duration |
|-----------|-------|----------------|
| Tables | 80+ | 24 hours |
| Reports | 900+ | 24 hours |
| Fields | Per-table | On-demand, cached |

### Cache Functions

```typescript
// Get all tables
getAllTables(): Promise<CachedTable[]>

// Get all reports across all tables
getAllReports(): Promise<CachedReport[]>

// Search reports by name or description
searchReports(query: string): Promise<CachedReport[]>

// Find a specific report
findReport(reportName: string, tableName?: string): Promise<CachedReport | null>

// Find a table by name (supports partial matching)
findTable(tableName: string): Promise<CachedTable | null>

// Get fields for a specific table
getTableFields(tableId: string): Promise<Field[]>

// Get reports for a specific table
getReportsForTable(tableNameOrId: string): Promise<CachedReport[]>
```

### Cache Data Structure

```typescript
interface FullCache {
  tables: CachedTable[];          // All 80+ tables
  reports: CachedReport[];        // All 900+ reports
  tableFields: Map<string, Field[]>; // Fields per table (lazy loaded)
  lastUpdated: Date;
  expiresAt: Date;
}

interface CachedTable {
  id: string;
  name: string;
  description?: string;
}

interface CachedReport {
  id: string;
  name: string;
  description?: string;
  tableId: string;
  tableName: string;
}
```

### Report Search Algorithm

The search uses a **scoring system** for fuzzy matching:

| Match Type | Score |
|------------|-------|
| Exact name match | +100 |
| Name contains query | +50 |
| Description contains query | +25 |
| Individual word in name | +10 |
| Individual word in description | +5 |

---

## RAG (Retrieval-Augmented Generation)

The system uses **RAG** to enhance AI responses with verified examples from a curated database.

### How RAG Works

```
User Question
     │
     ▼
┌─────────────────────────────────┐
│ Find Similar Examples           │
│ (Word overlap + structure)      │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Top 3-5 Matching Examples       │
│ from VerifiedQA database        │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Inject into System Prompt       │
│ as "VERIFIED EXAMPLES"          │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Claude uses examples to         │
│ guide tool selection & response │
└─────────────────────────────────┘
```

### Example Matching Algorithm

```typescript
function findSimilarExamples(question: string): VerifiedExample[] {
  // Score based on:
  // 1. Word overlap between question and example
  // 2. Tag matching
  // 3. Structure similarity ("how many" vs "show me")
  
  return examples
    .map(ex => ({ example: ex, score: calculateScore(question, ex) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
```

### Verified Example Format

```json
{
  "question": "How many families are enrolled?",
  "expectedAnswer": "There are X families currently enrolled.",
  "expectedTool": "count_records",
  "expectedParams": {"entity": "families", "status": "enrolled"},
  "category": "enrollment",
  "tags": ["families", "count", "enrolled"],
  "verified": true
}
```

### Categories of Verified Examples

| Category | Count | Topics |
|----------|-------|--------|
| `enrollment` | 12+ | Families, children, new enrollments |
| `attendance` | 4+ | Daily attendance, weekly counts |
| `staff` | 3+ | Staff counts, listings |
| `classes` | 3+ | Class counts, enrollments |
| `reports` | 5+ | Report discovery, running reports |
| `exploration` | 4+ | Schema discovery, field exploration |
| `help` | 2+ | Capabilities, guidance |

---

## Data Flow Diagram

### Complete Request Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           USER ASKS QUESTION                              │
│                   "How many families are enrolled?"                       │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        1. API ROUTE HANDLER                               │
│                      /api/chat/route.ts                                   │
│  • Authenticate user (NextAuth)                                           │
│  • Create QuickBase client                                                │
│  • Call processMessage()                                                  │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     2. LOAD VERIFIED EXAMPLES (RAG)                       │
│                    lib/training-service.ts                                │
│  • findSimilarExamples("How many families are enrolled?")                 │
│  • Returns matching verified Q&A pairs                                    │
│  • Formats as context for system prompt                                   │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      3. CALL CLAUDE AI                                    │
│                      lib/gemini.ts                                        │
│  • Send enhanced system prompt + tools + user message                     │
│  • Model: claude-sonnet-4-20250514                                        │
│  • AI decides: "I should call count_records tool"                         │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     4. EXECUTE TOOL                                       │
│  Tool: count_records                                                      │
│  Params: { table: "families", status: "enrolled" }                        │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ buildCountQuery()                                                   │  │
│  │ • Lookup TABLE_CONFIG["families"]                                   │  │
│  │ • tableId: "brxeprirp"                                             │  │
│  │ • statusField: 105, enrolledValue: "Enrolled"                       │  │
│  │ • Build query: "{'105'.EX.'Enrolled'}"                             │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    5. QUICKBASE API CALL                                  │
│                    lib/quickbase.ts                                       │
│                                                                           │
│  POST https://api.quickbase.com/v1/records/query                         │
│  {                                                                        │
│    "from": "brxeprirp",                                                  │
│    "select": [3],                                                         │
│    "where": "{'105'.EX.'Enrolled'}"                                      │
│  }                                                                        │
│                                                                           │
│  Response: { metadata: { totalRecords: 247 } }                           │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   6. FORMAT & RETURN TO CLAUDE                            │
│                                                                           │
│  Tool Result: { count: 247 }                                             │
│  Provenance: { source: "Family table", filter: "Status: enrolled" }      │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    7. CLAUDE GENERATES RESPONSE                           │
│                                                                           │
│  "There are 247 families currently enrolled in the program! 👨‍👩‍👧        │
│                                                                           │
│   Is there anything else you'd like to know about enrollment?"           │
│                                                                           │
│   ---                                                                     │
│   *Source: Family table | Status: enrolled | As of: Feb 19, 2026*        │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         USER SEES RESPONSE                                │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## QuickBase Data Access

### What the AI Has Access To

| Resource | Count | Access Method |
|----------|-------|---------------|
| **Tables** | 87 | Full read access via API |
| **Reports** | 949 | Run any saved report |
| **Fields** | 1000s | Schema discovery per table |
| **Records** | All | Query with filters |

### Core Tables (Pre-Configured)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **Family** | Family records | Name, Status, Enrollment Date |
| **Child (Clients)** | Children in program | Name, Status, Class |
| **Horizons Staff** | Staff members | Name, Role |
| **Class** | Available classes | Title, Status, Schedule |
| **Child Class Enrollments** | Class-child relationships | Child, Class, Status |
| **Child Attendance & Meals** | Daily attendance | Date, Status, Child |
| **Individual Child Plan (ICP)** | ICPs for children | Child, Goals |

### Additional Tables (87 Total)

The AI can dynamically access ANY table including:

- Head Start / Early Head Start
- Mobility Mentoring Goals
- Family Case Notes
- Admissions Referrals
- BIR and Injury Reports
- CACFP (Meals)
- Child Assessment Tracking
- EI/IEP Referral Tracking
- FP Assessments
- Teacher Observations
- Document Repository
- Partner Organizations
- Residence/Shelters
- SNAP Benefits
- Regions
- Community Activities
- And 70+ more...

### API Integration

```typescript
// QuickBase Client Methods
class QuickBaseClient {
  // Get all tables
  getTables(): Promise<QuickBaseTable[]>
  
  // Get fields for a table
  getTableFields(tableId: string): Promise<QuickBaseField[]>
  
  // Query records with filters
  queryRecords(tableId: string, options: {
    select?: number[];
    where?: string;
    sortBy?: { fieldId: number; order: 'ASC' | 'DESC' }[];
    top?: number;
  }): Promise<QueryResult>
  
  // Count records
  getRecordCount(tableId: string, where?: string): Promise<number>
  
  // Run a saved report
  runReport(tableId: string, reportId: string): Promise<QueryResult>
  
  // Get reports for a table
  getReports(tableId: string): Promise<Report[]>
}
```

---

## Verified Q&A Training System

### Purpose

The Verified Q&A system is a **human-in-the-loop** training mechanism that:

1. Stores known-good question/answer pairs
2. Guides the AI toward correct tool selection
3. Improves consistency over time
4. Allows continuous improvement without model retraining

### Database Schema

```prisma
model VerifiedQA {
  id              String    @id
  question        String    // Natural language question
  expectedAnswer  String    // Expected response pattern
  expectedTool    String?   // Which tool should be called
  expectedParams  String?   // JSON parameters for the tool
  category        String    // "enrollment", "attendance", etc.
  tags            String[]  // Additional categorization
  verified        Boolean   // Has been human-verified
  verifiedBy      String?   // Who verified
  usageCount      Int       // How often used
  successCount    Int       // Successful uses
}
```

### Example Entry

```json
{
  "question": "How many children attended today?",
  "expectedAnswer": "X children attended today.",
  "expectedTool": "count_records",
  "expectedParams": {"entity": "attendance", "dateFilter": "today"},
  "category": "attendance",
  "tags": ["attendance", "count", "today"],
  "verified": true
}
```

### Managing Training Data

```bash
# Seed examples from JSONL file
npm run training:seed

# Export verified examples
npm run training:export

# View statistics
npm run training:stats

# Review unverified examples
npm run training:review
```

### JSONL Format

Training data is stored in `training-data/verified-qa.jsonl`:

```jsonl
{"question": "How many families are enrolled?", "expectedAnswer": "...", "expectedTool": "count_records", ...}
{"question": "Show me enrolled children", "expectedAnswer": "...", "expectedTool": "list_records", ...}
```

---

## User Feedback Loop

### How Feedback Works

```
┌────────────────────┐
│ AI Response        │
│ [👍] [👎]          │
└─────────┬──────────┘
          │ User clicks 👎
          ▼
┌────────────────────────────────┐
│ Feedback Dialog                │
│ "What should the answer be?"   │
│ [text input]                   │
│ [Submit]                       │
└─────────┬──────────────────────┘
          │
          ▼
┌────────────────────────────────┐
│ ResponseFeedback saved         │
│ • Original question            │
│ • AI response                  │
│ • User's correction            │
│ • Tool that was called         │
└─────────┬──────────────────────┘
          │ Admin review
          ▼
┌────────────────────────────────┐
│ Convert to VerifiedQA          │
│ (if correction is valid)       │
└────────────────────────────────┘
```

### Feedback Schema

```prisma
model ResponseFeedback {
  id              String    @id
  question        String    // Original question
  aiResponse      String    // What AI said
  toolCalled      String?   // Which tool was used
  toolParams      String?   // Parameters used
  isCorrect       Boolean?  // User rating
  correctedAnswer String?   // What it should have been
  status          String    // "pending", "reviewed", "converted"
  convertedToQAId String?   // Link to new VerifiedQA entry
}
```

---

## Configuration & Environment

### Required Environment Variables

```env
# AI Service
ANTHROPIC_API_KEY=sk-ant-xxxxx          # Claude API key (primary)
GOOGLE_API_KEY=xxxxx                     # Gemini API key (backup)

# QuickBase
QUICKBASE_REALM=horizons                 # Your QB realm
QUICKBASE_APP_ID=brv2bm859              # Your app ID
QUICKBASE_USER_TOKEN=xxxxx              # System user token

# Database
DATABASE_URL=postgresql://...           # PostgreSQL connection

# Authentication
AZURE_AD_CLIENT_ID=xxxxx
AZURE_AD_CLIENT_SECRET=xxxxx
AZURE_AD_TENANT_ID=xxxxx
NEXTAUTH_SECRET=xxxxx
NEXTAUTH_URL=https://your-app.com
```

### Retry & Rate Limit Handling

```typescript
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isRateLimitError(error) && attempt < MAX_RETRIES) {
        await sleep(INITIAL_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
}
```

### Provenance Tracking

Every response includes **provenance** information:

```typescript
interface Provenance {
  source: string;       // "Family table" or "Current Enrollment report"
  filter?: string;      // "Status: enrolled"
  timestamp: string;    // When query was run
  recordCount?: number; // How many records matched
}

// Displayed as:
// ---
// *Source: Family table | Status: enrolled | As of: Feb 19, 2026, 2:30 PM*
```

---

## Summary

| Component | What It Does |
|-----------|--------------|
| **Claude AI** | Understands questions, selects tools, generates responses |
| **Function Calling** | 10 structured tools for reliable query generation |
| **Business Dictionary** | Maps user terms to QuickBase field IDs |
| **Schema Cache** | Fast access to 87 tables & 949 reports |
| **RAG System** | Injects verified examples for guidance |
| **Verified Q&A** | Human-curated training examples |
| **Feedback Loop** | Continuous improvement from user corrections |
| **Provenance** | Transparency about data sources |

The system is designed to be **reliable**, **accurate**, and **continuously improving** through human feedback.

