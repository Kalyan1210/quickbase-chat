#!/usr/bin/env npx ts-node

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

type CsvRow = Record<string, string>;

const prisma = new PrismaClient();

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      currentCell += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell);
      currentCell = '';
      if (currentRow.some(cell => cell.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some(cell => cell.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  return dataRows.map(row => {
    const mapped: CsvRow = {};
    headers.forEach((header, idx) => {
      mapped[header] = (row[idx] || '').trim();
    });
    return mapped;
  });
}

function parseBoolean(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

async function run(): Promise<void> {
  const inputArg = process.argv[2] || 'training-data/verified-qa-import.csv';
  const inputPath = path.resolve(inputArg);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`CSV file not found: ${inputPath}`);
  }

  const content = fs.readFileSync(inputPath, 'utf-8');
  const rows = parseCsv(content);
  if (rows.length === 0) {
    console.log('No rows found in CSV.');
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const question = row.question;
    const expectedAnswer = row.expected_answer;

    if (!question || !expectedAnswer) {
      skipped++;
      continue;
    }

    let expectedParams: string | null = null;
    if (row.expected_params_json) {
      try {
        const parsed = JSON.parse(row.expected_params_json);
        expectedParams = JSON.stringify(parsed);
      } catch {
        console.warn(`Skipping row due to invalid expected_params_json for question: "${question}"`);
        skipped++;
        continue;
      }
    }

    const tags = row.tags_csv
      ? row.tags_csv.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];
    const verifiedValue = row.verified ? parseBoolean(row.verified) : true;

    const data = {
      expectedAnswer,
      expectedTool: row.expected_tool || null,
      expectedParams,
      category: row.category || 'general',
      tags,
      verified: verifiedValue,
      verifiedBy: verifiedValue ? 'csv-import' : null,
      verifiedAt: verifiedValue ? new Date() : null,
      notes: row.notes || null,
    };

    const existing = await prisma.verifiedQA.findFirst({ where: { question } });
    if (existing) {
      await prisma.verifiedQA.update({
        where: { id: existing.id },
        data: {
          question,
          ...data,
        },
      });
      updated++;
    } else {
      await prisma.verifiedQA.create({
        data: {
          question,
          ...data,
        },
      });
      created++;
    }
  }

  console.log(`Import complete from ${inputPath}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
}

run()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
