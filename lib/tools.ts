// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION CALLING TOOLS - Structured tools for AI to use
// These replace freeform query generation with deterministic functions
// IMPORTANT: This file MUST stay aligned with business-dictionary.ts
// ═══════════════════════════════════════════════════════════════════════════════

import { FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { TABLES, REPORTS } from './business-dictionary';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS - What the AI can call
// Table names align with business-dictionary.ts keys
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOLS: FunctionDeclaration[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // CORE TOOLS - Deterministic queries for common questions
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'count_records',
    description: `Count records in a known table. Use this for "how many" questions about:
- families (Family table) - for family enrollment counts
- child_status (Horizons Child Status table) - for children enrollment counts
- class_enrollments (Child Class Enrollments) - for class enrollment counts
- staff (Horizons Staff) - for staff counts
- classes (Classes) - for class counts
- attendance (Child Attendance & Meals) - for attendance counts
- icp (Individual Child Plan) - for ICP counts
- case_notes (Family Case Notes) - for case note counts
- referrals (Admissions Referrals) - for referral counts`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        table: {
          type: SchemaType.STRING,
          description: 'The table to count from (must match business dictionary key)',
          enum: [
            'families',
            'child_status',      // Horizons Child Status - for "children enrolled" questions
            'clients',           // Clients table - children, parents, guardians
            'class_enrollments', // Child Class Enrollments
            'staff',             // Horizons Staff
            'classes',           // Classes
            'attendance',        // Child Attendance & Meals
            'icp',               // Individual Child Plan
            'case_notes',        // Family Case Notes
            'referrals',         // Admissions Referrals
          ],
        },
        status: {
          type: SchemaType.STRING,
          description: 'Optional status filter',
          enum: ['enrolled', 'waitlist', 'alumni', 'active', 'currently_enrolled', 'all'],
        },
        dateRange: {
          type: SchemaType.STRING,
          description: 'Optional date range filter',
          enum: [
            'today',
            'yesterday',
            'this_week',
            'last_week',
            'this_month',
            'last_month',
            'last_30_days',
            'this_year',
          ],
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'run_report',
    description: 'Run a pre-configured saved report. Use for enrollment summaries, expiring authorizations, etc.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        report: {
          type: SchemaType.STRING,
          description: 'The report to run',
          enum: [
            'current_enrollment',
            'enrollment_by_coordinator',
            'expiring_authorizations',
            'families_missing_data',
            'waitlist_summary',
          ],
        },
      },
      required: ['report'],
    },
  },
  {
    name: 'list_records',
    description: `List records from a known table with basic info. Use for "show me" or "list" requests.
Tables available (aligned with business dictionary):
- families: Family records
- child_status: Horizons Child Status (children enrollment status)
- clients: Clients (children, parents, guardians)
- class_enrollments: Child Class Enrollments
- staff: Horizons Staff members
- classes: Classes`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        table: {
          type: SchemaType.STRING,
          description: 'The table to list from (must match business dictionary key)',
          enum: ['families', 'child_status', 'clients', 'class_enrollments', 'staff', 'classes', 'attendance', 'case_notes'],
        },
        status: {
          type: SchemaType.STRING,
          description: 'Optional status filter',
          enum: ['enrolled', 'waitlist', 'alumni', 'active', 'currently_enrolled', 'all'],
        },
        dateRange: {
          type: SchemaType.STRING,
          description: 'Optional date range filter for when records were created/enrolled',
          enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30_days', 'this_year'],
        },
        limit: {
          type: SchemaType.NUMBER,
          description: 'Maximum number of records to return (default 10, max 50)',
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'get_help',
    description: 'Get help about what questions can be answered. Use when user asks for help or unclear what they want.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        topic: {
          type: SchemaType.STRING,
          description: 'Optional topic to get help about',
          enum: ['enrollment', 'attendance', 'staff', 'classes', 'reports', 'general', 'explore'],
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPLORATION TOOLS - Dynamic discovery for any table/report
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'explore_all_tables',
    description: 'List ALL tables in the QuickBase app. Use when user asks "what tables exist", "how many tables", "show all data available", or wants to explore beyond the common tables.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        includeDescription: {
          type: SchemaType.BOOLEAN,
          description: 'Whether to include table descriptions (default true)',
        },
      },
    },
  },
  {
    name: 'explore_table_fields',
    description: 'Show all fields/columns in a specific table. Use when user asks "what fields does X have", "show me the structure of X", or wants to know what data a table contains.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        tableName: {
          type: SchemaType.STRING,
          description: 'The name of the table to explore (can be partial match)',
        },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'list_table_reports',
    description: 'List all saved reports for a specific table. Use when user asks "what reports exist", "show available reports", or wants to run a specific report.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        tableName: {
          type: SchemaType.STRING,
          description: 'The name of the table to list reports for (can be partial match)',
        },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'run_dynamic_report',
    description: 'Run any saved report by its name (not just pre-configured ones). Use after listing reports to run a specific one.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        tableName: {
          type: SchemaType.STRING,
          description: 'The table the report belongs to',
        },
        reportName: {
          type: SchemaType.STRING,
          description: 'The exact name of the report to run',
        },
      },
      required: ['tableName', 'reportName'],
    },
  },
  {
    name: 'query_any_table',
    description: 'Query any table with a simple count or list. Use as fallback when the table is not in the core list. Less reliable but more flexible.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        tableName: {
          type: SchemaType.STRING,
          description: 'The name of the table to query',
        },
        action: {
          type: SchemaType.STRING,
          description: 'What to do: count records or list them',
          enum: ['count', 'list'],
        },
        limit: {
          type: SchemaType.NUMBER,
          description: 'For list action, max records to return (default 10)',
        },
      },
      required: ['tableName', 'action'],
    },
  },
  {
    name: 'search_all_reports',
    description: 'Search through ALL 900+ reports by name or description. Use when user asks for a specific report by name, or to find reports related to a topic.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        searchQuery: {
          type: SchemaType.STRING,
          description: 'The search term to find reports (e.g. "enrollment", "attendance", "expiring", "summary")',
        },
      },
      required: ['searchQuery'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL PARAMETER MAPPINGS - Convert tool parameters to QuickBase queries
// ═══════════════════════════════════════════════════════════════════════════════

export interface TableConfig {
  id: string;
  name: string;
  statusField?: { id: number; enrolledValue: string; waitlistValue?: string };
  dateField?: number;
  selectFields: number[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE_CONFIG - Aligned with business-dictionary.ts
// Keys MUST match business dictionary keys for consistency
// ═══════════════════════════════════════════════════════════════════════════════

export const TABLE_CONFIG: Record<string, TableConfig> = {
  // Family table - primary table for family records
  families: {
    id: 'brxeprirp',
    name: 'Family',
    statusField: { id: 105, enrolledValue: 'Enrolled', waitlistValue: 'Waitlist' },
    dateField: 106,
    selectFields: [3, 11, 105, 106], // ID, Name, Status, Enrollment Date
  },
  
  // Clients table - children, parents, guardians (different from child_status!)
  clients: {
    id: 'brxepttvj',
    name: 'Clients',
    statusField: { id: 165, enrolledValue: 'Enrolled', waitlistValue: 'Waitlist' }, // Child Enrollment Status
    dateField: 175, // Maximum Enrolled Date
    selectFields: [3, 165, 226, 175, 168], // ID, Child Enrollment Status, Family Enrollment Status, Max Enrolled Date, Max Alumni Date
  },
  
  // Horizons Child Status - THIS is where enrollment status is tracked
  // Use this for "how many children enrolled" questions
  child_status: {
    id: 'br34gm4mb',
    name: 'Horizons Child Status',
    statusField: { id: 6, enrolledValue: 'Enrolled', waitlistValue: 'Waitlist' },
    dateField: 7,
    selectFields: [3, 6, 7], // ID, Status, Status Start Date
  },
  
  // Child Class Enrollments - links children to classes
  class_enrollments: {
    id: 'br2egi5x3',
    name: 'Child Class Enrollments',
    statusField: { id: 27, enrolledValue: 'Currently Enrolled' },
    dateField: 6,
    selectFields: [3, 11, 25, 27, 6], // ID, Child, Class Title, Status, Start Date
  },
  
  // Horizons Staff
  staff: {
    id: 'brxen3xg9',
    name: 'Horizons Staff',
    selectFields: [3, 20], // ID, Name field
  },
  
  // Classes
  classes: {
    id: 'br2ege78m',
    name: 'Classes',
    statusField: { id: 18, enrolledValue: 'Active' },
    dateField: 16,
    selectFields: [3, 21, 18, 16], // ID, Title, Status, Start Date
  },
  
  // Child Attendance & Meals
  attendance: {
    id: 'br2egp69w',
    name: 'Child Attendance & Meals',
    dateField: 10,
    selectFields: [3, 10, 6], // ID, Date, Status
  },
  
  // Individual Child Plan (ICP)
  icp: {
    id: 'bvefn87vt',
    name: 'Individual Child Plan (ICP)',
    dateField: 16, // ICP Date field for date filtering
    selectFields: [3, 16], // ID, Date
  },
  
  // Family Case Notes
  case_notes: {
    id: 'brxepkm9g',
    name: 'Family Case Notes',
    dateField: 8,
    selectFields: [3, 8], // ID, Date
  },
  
  // Admissions Referrals
  referrals: {
    id: 'brxenyxrw',
    name: 'Admissions Referrals',
    selectFields: [3],
  },
  
  // Waitlist (same as families, just filtered differently)
  waitlist: {
    id: 'brxeprirp',
    name: 'Waitlist',
    statusField: { id: 105, enrolledValue: 'Waitlist' },
    selectFields: [3, 11, 105],
  },
};

export const REPORT_CONFIG: Record<string, { tableId: string; reportId: string; name: string }> = {
  current_enrollment: {
    tableId: 'brxeprirp',
    reportId: '38',
    name: 'Current Enrollment Summary',
  },
  enrollment_by_coordinator: {
    tableId: 'brxeprirp',
    reportId: '83',
    name: 'Enrollment by Family Coordinator',
  },
  expiring_authorizations: {
    tableId: 'brxeprirp',
    reportId: '31',
    name: 'Expiring Authorizations',
  },
  families_missing_data: {
    tableId: 'brxeprirp',
    reportId: '29',
    name: 'Enrolled Families Missing HHC Staff Assignment',
  },
  waitlist_summary: {
    tableId: 'brxeprirp',
    reportId: '113',
    name: 'Summary Report - Partner & Waitlist',
  },
};

// Date range mapping to QuickBase syntax
export const DATE_RANGE_MAP: Record<string, string> = {
  today: 'today',
  yesterday: 'yesterday',
  this_week: 'this week',
  last_week: 'last week',
  this_month: 'this month',
  last_month: 'last month',
  last_30_days: 'last 30 d',
  this_year: 'this year',
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY BUILDERS - Build QuickBase queries from tool parameters
// ═══════════════════════════════════════════════════════════════════════════════

export interface CountParams {
  table: string;
  status?: string;
  dateRange?: string;
}

export interface ListParams {
  table: string;
  status?: string;
  dateRange?: string;
  limit?: number;
}

export interface ReportParams {
  report: string;
}

/**
 * Build a QuickBase query for counting
 */
export function buildCountQuery(params: CountParams): {
  tableId: string;
  where?: string;
  tableName: string;
} {
  const config = TABLE_CONFIG[params.table];
  if (!config) {
    throw new Error(`Unknown table: ${params.table}`);
  }

  const filters: string[] = [];

  // Add status filter
  if (params.status && params.status !== 'all' && config.statusField) {
    if (params.status === 'enrolled') {
      filters.push(`{'${config.statusField.id}'.EX.'${config.statusField.enrolledValue}'}`);
    } else if (params.status === 'waitlist' && config.statusField.waitlistValue) {
      filters.push(`{'${config.statusField.id}'.EX.'${config.statusField.waitlistValue}'}`);
    } else if (params.status === 'active') {
      filters.push(`{'${config.statusField.id}'.EX.'${config.statusField.enrolledValue}'}`);
    }
  }

  // Add date filter
  if (params.dateRange && config.dateField) {
    const qbDateRange = DATE_RANGE_MAP[params.dateRange];
    console.log('[TOOLS DEBUG] Date filter:', { dateRange: params.dateRange, qbDateRange, dateField: config.dateField });
    if (qbDateRange) {
      filters.push(`{'${config.dateField}'.IR.'${qbDateRange}'}`);
    }
  }

  const result = {
    tableId: config.id,
    where: filters.length > 0 ? filters.join('AND') : undefined,
    tableName: config.name,
  };
  console.log('[TOOLS DEBUG] buildCountQuery result:', JSON.stringify(result));
  return result;
}

/**
 * Build a QuickBase query for listing
 */
export function buildListQuery(params: ListParams): {
  tableId: string;
  select: number[];
  where?: string;
  top: number;
  tableName: string;
} {
  const config = TABLE_CONFIG[params.table];
  if (!config) {
    throw new Error(`Unknown table: ${params.table}`);
  }

  const filters: string[] = [];

  // Add status filter
  if (params.status && params.status !== 'all' && config.statusField) {
    if (params.status === 'enrolled' || params.status === 'active') {
      filters.push(`{'${config.statusField.id}'.EX.'${config.statusField.enrolledValue}'}`);
    } else if (params.status === 'waitlist' && config.statusField.waitlistValue) {
      filters.push(`{'${config.statusField.id}'.EX.'${config.statusField.waitlistValue}'}`);
    }
  }

  // Add date filter
  if (params.dateRange && config.dateField) {
    const qbDateRange = DATE_RANGE_MAP[params.dateRange];
    if (qbDateRange) {
      filters.push(`{'${config.dateField}'.IR.'${qbDateRange}'}`);
    }
  }

  return {
    tableId: config.id,
    select: config.selectFields,
    where: filters.length > 0 ? filters.join('AND') : undefined,
    top: Math.min(params.limit || 10, 50),
    tableName: config.name,
  };
}

/**
 * Get report configuration
 */
export function getReportConfig(params: ReportParams): {
  tableId: string;
  reportId: string;
  reportName: string;
} {
  const config = REPORT_CONFIG[params.report];
  if (!config) {
    throw new Error(`Unknown report: ${params.report}`);
  }

  return {
    tableId: config.tableId,
    reportId: config.reportId,
    reportName: config.name,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELP RESPONSES - Canned responses for help requests
// ═══════════════════════════════════════════════════════════════════════════════

export const HELP_RESPONSES: Record<string, string> = {
  general: `I can help you with information about your Early Education program! Here are some things you can ask me:

📊 **Enrollment Questions:**
• "How many families are enrolled?"
• "How many children are in the program?"
• "Show me the current enrollment"

👶 **Class & Attendance:**
• "How many classes do we have?"
• "How many children attended today?"

👥 **Staff:**
• "How many staff members do we have?"

📋 **Reports:**
• "Show me expiring authorizations"
• "Show me enrollment by coordinator"

🔍 **Explore Data:**
• "What tables are available?"
• "Show me all the data you can access"
• "What fields does the Family table have?"
• "What reports exist for families?"

Just ask in plain English and I'll find the answer!`,

  enrollment: `For enrollment questions, you can ask:
• "How many families are enrolled?"
• "How many children are enrolled?"
• "How many families are on the waitlist?"
• "Show me families enrolled this month"
• "Show me the current enrollment summary"`,

  attendance: `For attendance questions, you can ask:
• "How many children attended today?"
• "How many children attended this week?"
• "Show me attendance for this month"`,

  staff: `For staff questions, you can ask:
• "How many staff members do we have?"
• "List our staff members"`,

  classes: `For class questions, you can ask:
• "How many classes do we have?"
• "Show me active classes"
• "How many children are in each class?"`,

  reports: `Available quick reports you can request:
• "Show me current enrollment" - Summary of enrolled families
• "Show me enrollment by coordinator" - Breakdown by Family Coordinator
• "Show me expiring authorizations" - Authorizations expiring soon
• "Show me families missing data" - Data quality report

You can also ask "What reports exist for [table name]?" to see all available reports for any table.`,

  explore: `I can explore all the data in your QuickBase app:

🔍 **Discover Tables:**
• "What tables are available?" - See all 80+ tables
• "How many tables do we have?"

📋 **Explore Table Structure:**
• "What fields does the Family table have?"
• "Show me the structure of the Classes table"

📊 **Find Reports:**
• "What reports exist for families?"
• "List reports for the Clients table"
• "Run the [report name] report"

This helps you discover data beyond the common tables!`,
};

