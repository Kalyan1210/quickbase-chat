const fs = require('fs');
const path = require('path');

const jsonlPath = path.join(__dirname, 'verified-qa.jsonl');
const sqlPath = path.join(__dirname, 'seed.sql');

const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(l => l.trim());

let sql = `-- Seed VerifiedQA table with training data
-- Generated from verified-qa.jsonl
-- Total: ${lines.length} verified Q&A examples

-- Clear existing data first
TRUNCATE TABLE "VerifiedQA";

INSERT INTO "VerifiedQA" ("id", "question", "expectedAnswer", "expectedTool", "expectedParams", "category", "tags", "verified", "notes", "createdAt", "updatedAt") VALUES
`;

const rows = lines.map((line) => {
  const ex = JSON.parse(line);
  const esc = (s) => (s || '').replace(/'/g, "''");
  const q = esc(ex.question);
  const a = esc(ex.expectedAnswer);
  const tool = ex.expectedTool || '';
  const params = JSON.stringify(ex.expectedParams || {}).replace(/'/g, "''");
  const cat = ex.category || '';
  const tags = (ex.tags || []).map(t => `'${esc(t)}'`).join(', ');
  const notes = esc(ex.notes);
  return `(gen_random_uuid()::text, '${q}', '${a}', '${tool}', '${params}', '${cat}', ARRAY[${tags}], true, '${notes}', NOW(), NOW())`;
});

sql += rows.join(',\n') + ';\n';
fs.writeFileSync(sqlPath, sql);
console.log(`Generated seed.sql with ${lines.length} rows`);
