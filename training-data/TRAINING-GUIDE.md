# QuickBase AI Training Guide

This document explains how to train the AI to answer questions correctly using verified Q&A examples.

---

## How Training Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        USER ASKS QUESTION                                   │
│                  "How many children enrolled last week?"                    │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     1. FIND SIMILAR VERIFIED EXAMPLES                        │
│                     (lib/training-service.ts)                               │
│                                                                             │
│  • Loads verified Q&A from database (VerifiedQA table)                      │
│  • Scores each example by word overlap with user question                   │
│  • Bonus for matching structure ("how many" → "how many")                   │
│  • Returns top 3-5 matching examples                                         │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     2. INJECT INTO AI PROMPT                                │
│                                                                             │
│  System Prompt includes:                                                    │
│  "## VERIFIED EXAMPLES FOR REFERENCE:                                       │
│   Q: 'How many children enrolled this month?'                               │
│   Tool: count_records                                                        │
│   Params: {table: 'child_status', status: 'enrolled', dateRange: 'this_month'}│
│   Expected Answer Pattern: X children enrolled this month."                  │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     3. AI USES EXAMPLES AS GUIDANCE                         │
│                                                                             │
│  Claude sees the examples and learns:                                       │
│  • "children enrolled" → use table "child_status" NOT "children"            │
│  • Status filter should be "enrolled"                                        │
│  • Date range "last week" → "last_week" parameter                           │
│                                                                             │
│  AI calls: count_records({table: "child_status", status: "enrolled",        │
│                           dateRange: "last_week"})                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Where Training Data Comes From

### 1. JSONL File (Primary Source)
**Location:** `training-data/verified-qa.jsonl`

This file contains verified question/answer pairs that get loaded into the database.

**Format:**
```json
{
  "question": "How many children are enrolled?",
  "expectedAnswer": "There are X children currently enrolled.",
  "expectedTool": "count_records",
  "expectedParams": {"table": "child_status", "status": "enrolled"},
  "category": "enrollment",
  "tags": ["children", "count", "enrolled"],
  "verified": true,
  "notes": "Use child_status table (Horizons Child Status)"
}
```

### 2. Database Table (Runtime Source)
**Table:** `VerifiedQA` (in PostgreSQL)

The training service loads examples from this table at runtime and caches them for 1 hour.

### 3. User Feedback (Future Training)
**Table:** `ResponseFeedback`

When users rate responses with 👍 or 👎 and provide corrections, these can be converted to new verified examples.

---

## How to Add New Training Examples

### Method 1: Edit the JSONL File

1. Open `training-data/verified-qa.jsonl`
2. Add a new line with your example (one JSON object per line)
3. Run the seed command:

```bash
npm run training:seed
```

### Method 2: Use the CSV Template

1. Open `training-data/training-template.csv` in Excel/Google Sheets
2. Add new rows following the format
3. Run the import script:

```bash
npm run training:import
```

### Method 3: Convert User Feedback

When a user provides a correction via the feedback button, an admin can convert it:

```bash
npm run training:review
```

---

## CSV Template Columns

| Column | Description | Required |
|--------|-------------|----------|
| `question` | The user's question (natural language) | ✅ |
| `expected_answer` | The ideal response pattern | ✅ |
| `expected_tool` | Which tool to call | ✅ |
| `expected_params_json` | JSON object with parameters | ✅ |
| `category` | Category for organization | ✅ |
| `tags_csv` | Comma-separated tags | ❌ |
| `verified` | true/false | ✅ |
| `notes` | Internal notes | ❌ |

---

## Available Tools for Training

| Tool Name | When to Use | Key Parameters |
|-----------|-------------|----------------|
| `count_records` | "How many..." questions | `table`, `status`, `dateRange` |
| `list_records` | "Show me..." or "List..." | `table`, `status`, `dateRange`, `limit` |
| `run_report` | Pre-configured reports | `report` (enum) |
| `run_dynamic_report` | Any saved report by name | `tableName`, `reportName` |
| `search_all_reports` | Find reports by keyword | `searchQuery` |
| `list_table_reports` | List reports for a table | `tableName` |
| `explore_all_tables` | Schema discovery | (none) |
| `explore_table_fields` | Field discovery | `tableName` |
| `query_any_table` | Fallback for any table | `tableName`, `action` |
| `get_help` | Help requests | `topic` |

---

## Table Names (MUST Match Business Dictionary)

**IMPORTANT:** Table names in training examples MUST match the keys in `lib/business-dictionary.ts`:

| Table Key | Actual Table Name | Use For |
|-----------|-------------------|---------|
| `families` | Family | Family records |
| `child_status` | Horizons Child Status | Children enrollment status |
| `clients` | Clients | Children, parents, guardians |
| `class_enrollments` | Child Class Enrollments | Class enrollment records |
| `staff` | Horizons Staff | Staff members |
| `classes` | Classes | Class records |
| `attendance` | Child Attendance & Meals | Attendance records |
| `icp` | Individual Child Plan (ICP) | ICP records |
| `case_notes` | Family Case Notes | Case notes |
| `referrals` | Admissions Referrals | Referral records |

---

## Status Values

| Status | Tables | Value |
|--------|--------|-------|
| `enrolled` | families, child_status | "Enrolled" |
| `waitlist` | families, child_status | "Waitlist" |
| `alumni` | families, child_status | "Alumni" |
| `active` | classes | "Active" |
| `currently_enrolled` | class_enrollments | "Currently Enrolled" |

---

## Date Range Values

| User Says | Parameter Value | QuickBase Syntax |
|-----------|-----------------|------------------|
| today | `today` | `IR.'today'` |
| yesterday | `yesterday` | `IR.'yesterday'` |
| this week | `this_week` | `IR.'this week'` |
| last week | `last_week` | `IR.'last week'` |
| this month | `this_month` | `IR.'this month'` |
| last month | `last_month` | `IR.'last month'` |
| last 30 days | `last_30_days` | `IR.'last 30 d'` |
| this year | `this_year` | `IR.'this year'` |

---

## Example: Training for a New Question Type

**User reports:** "When I ask 'How many Head Start children?' it doesn't work"

**Solution:** Add a training example:

```json
{
  "question": "How many Head Start children?",
  "expectedAnswer": "There are X children in Head Start.",
  "expectedTool": "query_any_table",
  "expectedParams": {"tableName": "Head Start", "action": "count"},
  "category": "enrollment",
  "tags": ["head_start", "children", "count"],
  "verified": true,
  "notes": "Head Start table for HS/EHS tracking"
}
```

---

## Commands Reference

```bash
# Seed examples from JSONL to database
npm run training:seed

# Import from CSV
npm run training:import

# Export verified examples
npm run training:export

# View statistics
npm run training:stats

# Review pending feedback
npm run training:review
```

---

## Monitoring Training Quality

1. **Check usage stats:** `npm run training:stats`
2. **Review user feedback:** Look at `ResponseFeedback` table
3. **Test questions:** Ask the same question multiple times to check consistency
4. **Look at logs:** Tool calls are logged with parameters

---

## Troubleshooting

**Problem:** AI uses wrong table (e.g., "Child" instead of "Horizons Child Status")

**Solution:** 
1. Check `lib/tools.ts` TABLE_CONFIG matches business dictionary
2. Add more verified examples with correct table name
3. Re-seed training data: `npm run training:seed`

**Problem:** Date filters not working

**Solution:**
1. Verify dateRange parameter uses underscore format: `this_week`, not `this week`
2. Check the table has a dateField configured in TABLE_CONFIG

**Problem:** New report not found

**Solution:**
1. Refresh schema cache: The cache refreshes every 24 hours
2. Or search for the report: "search for [report name] reports"

