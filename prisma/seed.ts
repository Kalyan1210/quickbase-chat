import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA - QuickBase Query Examples
// These examples help the AI generate correct queries
// ═══════════════════════════════════════════════════════════════════════════════

const queryExamples = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ENROLLMENT QUERIES
  // ─────────────────────────────────────────────────────────────────────────────
  {
    question: "How many children are enrolled?",
    query: "{status_field.EX.'Enrolled'}",
    category: "enrollment",
    description: "Count of children with Enrolled status",
  },
  {
    question: "How many students are currently enrolled?",
    query: "{status_field.EX.'Enrolled'}",
    category: "enrollment",
    description: "Count of students with active enrollment",
  },
  {
    question: "Show me enrolled families",
    query: "{status_field.EX.'Enrolled'}",
    category: "enrollment",
    description: "List families with Enrolled status",
  },
  {
    question: "How many new enrollments this month?",
    query: "{enrollment_date.IR.'this month'}",
    category: "enrollment",
    description: "Count enrollments where date is in current month",
  },
  {
    question: "Enrollments this year",
    query: "{enrollment_date.IR.'this year'}",
    category: "enrollment",
    description: "Records enrolled in current year",
  },
  {
    question: "How many families enrolled in February?",
    query: "{enrollment_date.IR.'this month'}",
    category: "enrollment",
    description: "Families enrolled in specified month",
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // COUNTING QUERIES
  // ─────────────────────────────────────────────────────────────────────────────
  {
    question: "How many total records?",
    query: "",
    category: "counting",
    description: "Total count of all records in table",
  },
  {
    question: "Count active students",
    query: "{status.EX.'Active'}",
    category: "counting",
    description: "Count records with Active status",
  },
  {
    question: "How many staff members?",
    query: "",
    category: "counting",
    description: "Total count from Staff table",
  },
  {
    question: "Number of classes",
    query: "",
    category: "counting",
    description: "Total count from Classes table",
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // DATE FILTER QUERIES
  // ─────────────────────────────────────────────────────────────────────────────
  {
    question: "Records from this month",
    query: "{date_field.IR.'this month'}",
    category: "dates",
    description: "Filter by current month using IR operator",
  },
  {
    question: "Records from this week",
    query: "{date_field.IR.'this week'}",
    category: "dates",
    description: "Filter by current week",
  },
  {
    question: "Records from last month",
    query: "{date_field.IR.'last month'}",
    category: "dates",
    description: "Filter by previous month",
  },
  {
    question: "Records created today",
    query: "{date_field.EX.'today'}",
    category: "dates",
    description: "Filter by today's date",
  },
  {
    question: "Records after January 1st",
    query: "{date_field.OAF.'2024-01-01'}",
    category: "dates",
    description: "On or after specific date (OAF operator)",
  },
  {
    question: "Records before end of year",
    query: "{date_field.OBF.'2024-12-31'}",
    category: "dates",
    description: "On or before specific date (OBF operator)",
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // STATUS FILTER QUERIES
  // ─────────────────────────────────────────────────────────────────────────────
  {
    question: "Show active records",
    query: "{status.EX.'Active'}",
    category: "status",
    description: "Filter by Active status",
  },
  {
    question: "Show pending records",
    query: "{status.EX.'Pending'}",
    category: "status",
    description: "Filter by Pending status",
  },
  {
    question: "Inactive families",
    query: "{status.EX.'Inactive'}",
    category: "status",
    description: "Filter by Inactive status",
  },
  {
    question: "Completed enrollments",
    query: "{status.EX.'Completed'}",
    category: "status",
    description: "Filter by Completed status",
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // COMBINED FILTER QUERIES
  // ─────────────────────────────────────────────────────────────────────────────
  {
    question: "Enrolled children this month",
    query: "{status.EX.'Enrolled'}AND{date_field.IR.'this month'}",
    category: "combined",
    description: "Combine status and date filters with AND",
  },
  {
    question: "Active or pending records",
    query: "{status.EX.'Active'}OR{status.EX.'Pending'}",
    category: "combined",
    description: "Multiple status options with OR",
  },
  {
    question: "New enrollments in 2024",
    query: "{status.EX.'Enrolled'}AND{date_field.IR.'this year'}",
    category: "combined",
    description: "Status and year filter combined",
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SEARCH QUERIES
  // ─────────────────────────────────────────────────────────────────────────────
  {
    question: "Find families named Smith",
    query: "{name_field.CT.'Smith'}",
    category: "search",
    description: "Contains search for partial name match",
  },
  {
    question: "Search for John",
    query: "{name_field.CT.'John'}",
    category: "search",
    description: "Partial text search using CT operator",
  },
  {
    question: "Find records with email containing gmail",
    query: "{email_field.CT.'gmail'}",
    category: "search",
    description: "Email domain search",
  },
];

async function main() {
  console.log('🌱 Seeding database with query examples...');
  
  // Clear existing examples
  await prisma.queryExample.deleteMany({});
  
  // Insert new examples
  for (const example of queryExamples) {
    await prisma.queryExample.create({
      data: example,
    });
  }
  
  console.log(`✅ Inserted ${queryExamples.length} query examples`);
  
  // Add some QuickBase documentation as documents
  const docs = [
    {
      title: "QuickBase Query Operators",
      source: "quickbase_docs",
      content: `
QuickBase Query Operators:
- EX (equals): {fieldId.EX.'value'} - Exact match
- CT (contains): {fieldId.CT.'text'} - Partial text match
- GT (greater than): {fieldId.GT.number} - Greater than comparison
- LT (less than): {fieldId.LT.number} - Less than comparison
- GTE (greater or equal): {fieldId.GTE.number}
- LTE (less or equal): {fieldId.LTE.number}
- IR (in range): {fieldId.IR.'this month'} - Date ranges
- OAF (on or after): {fieldId.OAF.'date'} - Date on or after
- OBF (on or before): {fieldId.OBF.'date'} - Date on or before

Combining conditions:
- AND: {cond1}AND{cond2}
- OR: {cond1}OR{cond2}

Date range options for IR:
- 'today', 'yesterday', 'tomorrow'
- 'this week', 'last week', 'next week'
- 'this month', 'last month', 'next month'
- 'this quarter', 'last quarter'
- 'this year', 'last year'
      `,
    },
  ];
  
  await prisma.document.deleteMany({});
  
  for (const doc of docs) {
    await prisma.document.create({ data: doc });
  }
  
  console.log(`✅ Inserted ${docs.length} documentation entries`);

  // ─────────────────────────────────────────────────────────────────────────────
  // VERIFIED Q&A EXAMPLES - Load from JSONL file
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('📚 Seeding verified Q&A examples...');
  
  try {
    const jsonlPath = path.join(__dirname, '../training-data/verified-qa.jsonl');
    if (fs.existsSync(jsonlPath)) {
      const content = fs.readFileSync(jsonlPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Clear existing verified QA
      await prisma.verifiedQA.deleteMany({});
      
      let qaCount = 0;
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          await prisma.verifiedQA.create({
            data: {
              question: data.question,
              expectedAnswer: data.expectedAnswer,
              expectedTool: data.expectedTool || null,
              expectedParams: data.expectedParams ? JSON.stringify(data.expectedParams) : null,
              category: data.category || 'general',
              tags: data.tags || [],
              notes: data.notes || null,
              verified: data.verified !== false, // Default to true
              verifiedBy: 'system-seed',
              verifiedAt: new Date(),
            },
          });
          qaCount++;
        } catch (parseError) {
          console.warn('  Skipping malformed line:', parseError);
        }
      }
      console.log(`✅ Inserted ${qaCount} verified Q&A examples`);
    } else {
      console.log('  No verified-qa.jsonl file found, skipping Q&A seeding');
    }
  } catch (error) {
    console.warn('  Could not seed verified Q&A:', error);
  }

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

