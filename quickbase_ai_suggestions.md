# Quickbase AI Q&A Assistant, Critical Design Suggestions (Production-Ready)

This document consolidates the improvements and guardrails that make an “AI that answers questions using Quickbase data” accurate, trustworthy, and safe for real staff usage.

---

## 1) Core Architecture

### 1.1 Enforce a 3-stage pipeline: Plan → Execute → Explain
Most reliability issues come from skipping a deliberate planning step or letting the model answer without running a real query.

**Plan**
- Determine intent: count, list, trend, definition, “how-to build in Quickbase”
- Identify scope: app, table(s), relationship path, date range, filters
- Decide grain: record-level vs parent-level vs summary-level
- Define metric: what exactly counts, what date field defines “January”, how checkbox is counted, etc.

**Execute**
- Only tool calls to Quickbase (run report, query, schema fetch)
- No “pretend results”
- Validate tables, field IDs, relationship paths before execution

**Explain**
- Provide the answer plus provenance
- List what was run: report/table, filters, time range, grouping, row counts
- State assumptions and limitations

### 1.2 Tool-first, not freeform
The model should not directly produce final answers from “knowledge”. It must call tools that actually run queries and return data.

Create a minimal tool set (functions) your application controls:
- `get_schema(app_id)`
- `get_tables(app_id)`
- `get_fields(table_id)`
- `search_reports(app_id, query_text)`
- `run_report(report_id, params)`
- `run_query(table_id, where, select, group_by, sort, options)`

---

## 2) Schema Grounding and Relationship Modeling

### 2.1 Schema cache
Build and cache:
- app → tables
- table → fields + types
- relationships (parent-child, reference fields)
- canonical field IDs and table IDs

Refresh strategy:
- on deploy
- daily (or hourly) scheduled refresh
- manual admin refresh button

### 2.2 Business dictionary (semantic layer)
Create a small, editable mapping between business terms and schema:
- Synonyms → field IDs (example: “late dropoff” → checkbox field ID)
- Concepts → rule bundles (example: “January late dropoffs” → date range on the correct date field + checkbox true)
- Relationship paths (example: Client → Meals & Attendance)

This is the single biggest step to eliminate hallucinated fields and wrong joins.

### 2.3 Field type-aware handling
Teach the system rules for:
- checkbox: count as `SUM(IF(checked,1,0))` at the correct grain
- dates: always define inclusive/exclusive windows clearly
- text fields (including HTML fields): avoid comparing raw HTML unless normalized
- multi-select / user fields: normalize before filtering
- numeric summaries: use summary fields where possible

---

## 3) Prefer Reports Over Ad Hoc Queries

### 3.1 Report-first strategy
Saved reports already encode the correct join logic, filters, groupings, and often permissions expectations.

Flow:
1) Try to match the user question to an existing report (by name/description/tags)
2) Run that report
3) Summarize results, include the report name and filters used
4) Only fall back to ad hoc queries when no report matches

### 3.2 “AI-safe reports” list
Maintain a curated set of:
- high-trust, staff-approved reports
- already aggregated and filtered
- permission-safe outputs

If a question is ambiguous, the assistant uses the closest AI-safe report and states assumptions.

---

## 4) Guardrails and Reliability

### 4.1 Mandatory date windows for large tables
If the user does not provide a date range and the table is large:
- default to last 30 or 90 days
- explicitly state that default in the response
- allow user override

### 4.2 Hard limits
- cap returned rows (example: 500)
- prefer aggregated outputs for summary questions
- require grouping when question says “by class/by site/by month”
- enforce pagination handling for any query that can exceed limits

### 4.3 Query validation before execution
Reject or request a safer plan if:
- unknown table
- unknown field ID
- ambiguous date field (“dropoff date” vs “created date”)
- missing relationship path (cannot safely join)
- unbounded scans on big tables

### 4.4 Caching
Cache:
- schema metadata (tables/fields/relationships)
- popular report outputs for short TTL
- frequent lookups (dictionary mappings)

This reduces rate-limit pain and speeds up responses.

---

## 5) Security and Compliance

### 5.1 Run as the requesting user when possible
Best: use user-scoped auth so Quickbase enforces role and record-level permissions naturally.

If you must use a service account:
- limit scope
- add strict output allowlists
- log everything

### 5.2 PII and sensitive field protection
Implement:
- safe-field allowlist for AI answers
- redaction rules for sensitive fields (names, addresses, DOB, case notes, etc.)
- minimum necessary: answer aggregates when possible instead of row-level data

### 5.3 Audit logging
Log:
- user ID and timestamp
- tool calls (report/query)
- filters used
- row counts returned
- any write operations (with before/after)

---

## 6) Accuracy: Granularity and Metric Definitions

### 6.1 Decide grain early
Example pitfalls:
- user asks “children with ICP in last 3 months by class”
- system counts child records in an ICP table but question is child-level unique count
- joins are wrong or duplicates inflate counts

Standard patterns:
- unique children count: `COUNT(DISTINCT child_id)` or use summary fields at the child level
- checkbox counts: summarize at the correct parent
- monthly logic: define month boundaries and use the correct event date field

### 6.2 Consistent month boundaries
Define and reuse a single rule for “January”, “last month”, “last 3 months”:
- timezone-aware
- inclusive/exclusive boundaries documented
- example: Jan 1 00:00 to Feb 1 00:00 (exclusive)

### 6.3 Explain assumptions
If multiple date fields exist:
- pick the best default, but say it: “Using Attendance Date, not Created Date”
- provide “change to Created Date” option

---

## 7) Response Quality and Trust

## Always include provenance
Every thought process should include:
- Source: report name or table(s)
- Filters: date range and key conditions
- Grouping: by what dimension
- Counts: scanned vs returned (if available)
- Assumptions: defaults and interpretation choices


---

## 8) Suggested Minimal MVP Implementation Plan

### Phase 1: Read-only “Trusted Answers”
- Schema cache + dictionary
- Report-first retrieval
- Plan → Execute → Explain
- Hard limits + date defaults + provenance

### Phase 2: Ad hoc querying (still read-only)
- Validated query generation
- Pagination + caching
- More robust relationship resolution

### Phase 3: Controlled write actions
- Draft changes with preview
- Explicit user confirmation required
- Audit logs and field-level allowlists

---

## 9) “Do Not Ship” Red Flags Checklist
Avoid releasing if any of these are true:
- The assistant can answer without executing a query
- The assistant guesses table/field names without schema grounding
- One admin token powers all users and there is no redaction layer
- No date bounds, no row caps, no pagination
- No provenance shown in responses
- No logging of tool calls

---

## 10) Practical Templates You Can Adopt

### 10.1 Standard thought process template
- **Answer:** <result summary>
- **Source:** <report name> or <tables>
- **Filters:** <date range, key conditions>
- **Grouping:** <dimension>
- **Notes:** <assumptions, limitations>
- **How to reproduce in Quickbase:** <steps>

### 10.2 Planner output template (internal)
- intent: {count|list|trend|how-to}
- tables: [...]
- relationship_path: [...]
- date_field: <field id>
- date_range: <start,end>
- filters: [...]
- aggregation: <sum/count/distinct>
- grouping: [...]
- output_fields: [...]
- safety: {row_cap, requires_aggregation, pii_allowlist}

---

If you share your code or repo later, this same checklist can be used to produce a file-by-file critique and concrete refactor plan.
