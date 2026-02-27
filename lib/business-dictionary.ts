// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS DICTIONARY - Maps natural language concepts to QuickBase schema
// This is the "semantic layer" that ensures consistent query generation
// ═══════════════════════════════════════════════════════════════════════════════

export interface TableDefinition {
  id: string;
  name: string;
  description: string;
  statusField?: { id: number; values: string[] };
  dateField?: { id: number; name: string };
  nameField?: { id: number };
  countField?: { id: number }; // Record ID for counting
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  tableId: string;
  filter?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE DEFINITIONS - Core tables in the Early Education app
// ═══════════════════════════════════════════════════════════════════════════════

export const TABLES: Record<string, TableDefinition> = {
  // Family table - primary table for family records
  family: {
    id: 'brxeprirp',
    name: 'Family',
    description: 'Families enrolled or waitlisted in the Early Education program',
    statusField: { 
      id: 105, 
      values: ['Enrolled', 'Waitlist', 'Alumni', 'Archive'] 
    },
    dateField: { id: 106, name: 'Enrollment Date' },
    nameField: { id: 11 },
    countField: { id: 3 },
  },

  // Clients table - children, parents, guardians
  // Child Enrollment Status (165), Family Enrollment Status (226)
  // Maximum Enrolled Date (175), Maximum Alumni Date (168)
  clients: {
    id: 'brxepttvj',
    name: 'Clients',
    description: 'Children, parents, siblings, and guardians of families',
    statusField: { 
      id: 165, 
      values: ['Enrolled', 'Waitlist', 'Alumni', 'Archive'] 
    },
    dateField: { id: 175, name: 'Maximum Enrolled Date' },
    countField: { id: 3 },
  },

  // Child Status table - enrollment status tracking
  childStatus: {
    id: 'br34gm4mb',
    name: 'Horizons Child Status',
    description: 'Tracks enrollment status changes for children over time',
    statusField: { 
      id: 6, 
      values: ['Waitlist', 'Enrolled', 'Alumni', 'Archive'] 
    },
    dateField: { id: 7, name: 'Status Start Date' },
    countField: { id: 3 },
  },

  // Child Class Enrollments - links children to classes
  enrollments: {
    id: 'br2egi5x3',
    name: 'Child Class Enrollments',
    description: 'Tracks which children are enrolled in which classes',
    statusField: { 
      id: 27, 
      values: ['Currently Enrolled', 'Past Enrollment', 'Future Enrollment'] 
    },
    dateField: { id: 6, name: 'Start Enrollment in Class' },
    countField: { id: 3 },
  },

  // Classes table
  classes: {
    id: 'br2ege78m',
    name: 'Classes',
    description: 'Past and current classes at Horizons',
    statusField: { 
      id: 18, 
      values: ['Active', 'Inactive', 'Archived'] 
    },
    dateField: { id: 16, name: 'Start Date' },
    nameField: { id: 21 },
    countField: { id: 3 },
  },

  // Staff table
  staff: {
    id: 'brxen3xg9',
    name: 'Horizons Staff',
    description: 'Current and past Horizons staff members',
    countField: { id: 3 },
  },

  // Attendance & Meals
  attendance: {
    id: 'br2egp69w',
    name: 'Child Attendance & Meals',
    description: 'Daily attendance and meal tracking for children',
    dateField: { id: 10, name: 'Date' },
    countField: { id: 3 },
  },

  // ICP - Individual Child Plans
  icp: {
    id: 'bvefn87vt',
    name: 'Individual Child Plan (ICP)',
    description: 'Individual support plans for children with special needs',
    dateField: { id: 16, name: 'ICP Date' },
    countField: { id: 3 },
  },

  // Case Notes
  caseNotes: {
    id: 'brxepkm9g',
    name: 'Family Case Notes',
    description: 'Case notes from all teams on families',
    dateField: { id: 8, name: 'Date' },
    countField: { id: 3 },
  },

  // Referrals
  referrals: {
    id: 'brxenyxrw',
    name: 'Admissions Referrals',
    description: 'External referrals received for families',
    countField: { id: 3 },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SAVED REPORTS - Pre-built reports that are safe to run
// ═══════════════════════════════════════════════════════════════════════════════

export const REPORTS: Record<string, ReportDefinition> = {
  currentEnrollment: {
    id: '38',
    name: 'Current Enrollment',
    description: 'Summary of currently enrolled families',
    tableId: 'brxeprirp',
    filter: "{'105'.EX.'Enrolled'}",
  },
  enrollmentByFCS: {
    id: '83',
    name: 'Enrollment by FCS',
    description: 'Enrollment counts grouped by Family Coordinator',
    tableId: 'brxeprirp',
    filter: "{'105'.EX.'Enrolled'}",
  },
  enrolledFamilies: {
    id: '109',
    name: 'Ad hoc - Enrolled families',
    description: 'List of all enrolled families',
    tableId: 'brxeprirp',
    filter: "{'105'.EX.'Enrolled'}",
  },
  familyFunding: {
    id: '47',
    name: 'Family Funding - All',
    description: 'Funding information for all enrolled families',
    tableId: 'brxeprirp',
    filter: "{'105'.EX.'Enrolled'}",
  },
  expiringAuthorizations: {
    id: '31',
    name: 'Expiring Authorizations',
    description: 'Authorizations expiring in the next 30 days',
    tableId: 'brxeprirp',
    filter: "{'105'.CT.'Enrolled'}AND{'156'.IR.'next 30 d'}",
  },
  listAll: {
    id: '1',
    name: 'List All',
    description: 'All families in the system',
    tableId: 'brxeprirp',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPINGS - Maps user intent to specific queries
// ═══════════════════════════════════════════════════════════════════════════════

export interface QueryMapping {
  patterns: string[]; // Keywords or phrases that trigger this
  table: string;      // Key from TABLES
  action: 'count' | 'list' | 'report';
  filter?: string;
  reportId?: string;  // If action is 'report'
  description: string;
}

export const QUERY_MAPPINGS: QueryMapping[] = [
  // Enrollment counts
  {
    patterns: ['enrolled', 'enrollment', 'how many families', 'number of families', 'family count', 'families enrolled'],
    table: 'family',
    action: 'count',
    filter: "{'105'.EX.'Enrolled'}",
    description: 'Count of currently enrolled families',
  },
  {
    patterns: ['children enrolled', 'kids enrolled', 'how many children', 'child count', 'number of children'],
    table: 'childStatus',
    action: 'count',
    filter: "{'6'.EX.'Enrolled'}",
    description: 'Count of enrolled children',
  },
  {
    patterns: ['class enrollment', 'enrolled in class', 'currently in class', 'active class'],
    table: 'enrollments',
    action: 'count',
    filter: "{'27'.EX.'Currently Enrolled'}",
    description: 'Count of active class enrollments',
  },
  {
    patterns: ['waitlist', 'waiting', 'pending enrollment'],
    table: 'family',
    action: 'count',
    filter: "{'105'.EX.'Waitlist'}",
    description: 'Count of families on waitlist',
  },

  // Staff
  {
    patterns: ['staff', 'employees', 'team members', 'teachers'],
    table: 'staff',
    action: 'count',
    description: 'Count of staff members',
  },

  // Classes
  {
    patterns: ['classes', 'classrooms', 'how many classes'],
    table: 'classes',
    action: 'count',
    description: 'Count of classes',
  },

  // Attendance
  {
    patterns: ['attendance today', 'present today', 'came today'],
    table: 'attendance',
    action: 'count',
    filter: "{'6'.EX.'Attended'}AND{'10'.EX.'today'}",
    description: 'Children who attended today',
  },
  {
    patterns: ['attendance this week', 'this week attendance'],
    table: 'attendance',
    action: 'count',
    filter: "{'6'.EX.'Attended'}AND{'10'.IR.'this week'}",
    description: 'Attendance records for this week',
  },

  // ICP
  {
    patterns: ['icp', 'individual child plan', 'special needs', 'support plans'],
    table: 'icp',
    action: 'count',
    description: 'Count of Individual Child Plans',
  },

  // Reports
  {
    patterns: ['enrollment summary', 'enrollment report', 'current enrollment'],
    table: 'family',
    action: 'report',
    reportId: '38',
    description: 'Run the Current Enrollment report',
  },
  {
    patterns: ['by fcs', 'by coordinator', 'enrollment by staff'],
    table: 'family',
    action: 'report',
    reportId: '83',
    description: 'Run the Enrollment by FCS report',
  },
  {
    patterns: ['expiring', 'authorization expiring', 'funding expiring'],
    table: 'family',
    action: 'report',
    reportId: '31',
    description: 'Run the Expiring Authorizations report',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DATE RANGES - Standard date range interpretations
// ═══════════════════════════════════════════════════════════════════════════════

export const DATE_RANGES: Record<string, string> = {
  'today': 'today',
  'yesterday': 'yesterday',
  'this week': 'this week',
  'last week': 'last week',
  'this month': 'this month',
  'last month': 'last month',
  'last 30 days': 'last 30 d',
  'last 90 days': 'last 90 d',
  'this year': 'this year',
  'last year': 'last year',
  'this fiscal year': 'this fy',
  'last fiscal year': 'last fy',
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the best matching query based on user message
 */
export function findMatchingQuery(userMessage: string): QueryMapping | null {
  const lowerMessage = userMessage.toLowerCase();
  
  for (const mapping of QUERY_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (lowerMessage.includes(pattern.toLowerCase())) {
        return mapping;
      }
    }
  }
  
  return null;
}

/**
 * Get table info by key or name
 */
export function getTable(key: string): TableDefinition | null {
  // Try direct key lookup
  if (TABLES[key]) {
    return TABLES[key];
  }
  
  // Try matching by name
  const lowerKey = key.toLowerCase();
  for (const [tableKey, table] of Object.entries(TABLES)) {
    if (table.name.toLowerCase().includes(lowerKey) || 
        tableKey.toLowerCase().includes(lowerKey)) {
      return table;
    }
  }
  
  return null;
}

/**
 * Get report by key
 */
export function getReport(key: string): ReportDefinition | null {
  return REPORTS[key] || null;
}

/**
 * Build a QuickBase query string with date range
 */
export function buildDateFilter(
  dateFieldId: number, 
  dateRange: keyof typeof DATE_RANGES
): string {
  const qbRange = DATE_RANGES[dateRange];
  if (!qbRange) return '';
  
  return `{${dateFieldId}.IR.'${qbRange}'}`;
}

/**
 * Combine filters with AND
 */
export function combineFilters(...filters: (string | undefined)[]): string {
  const validFilters = filters.filter((f): f is string => !!f && f.length > 0);
  if (validFilters.length === 0) return '';
  if (validFilters.length === 1) return validFilters[0];
  return validFilters.join('AND');
}

