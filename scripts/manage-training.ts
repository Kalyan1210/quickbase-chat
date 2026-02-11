#!/usr/bin/env npx ts-node

/**
 * Training Data Management Script
 * 
 * Commands:
 *   npm run training:seed     - Seed from verified-qa.jsonl
 *   npm run training:export   - Export verified examples to JSONL
 *   npm run training:stats    - Show training data statistics
 *   npm run training:review   - Review pending feedback
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function seed() {
  console.log('📚 Seeding verified Q&A examples from JSONL...');
  
  const jsonlPath = path.join(__dirname, '../training-data/verified-qa.jsonl');
  
  if (!fs.existsSync(jsonlPath)) {
    console.error('❌ File not found:', jsonlPath);
    process.exit(1);
  }
  
  const content = fs.readFileSync(jsonlPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  let added = 0;
  let skipped = 0;
  
  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      
      // Check if exists
      const existing = await prisma.verifiedQA.findFirst({
        where: { question: data.question },
      });
      
      if (existing) {
        skipped++;
        continue;
      }
      
      await prisma.verifiedQA.create({
        data: {
          question: data.question,
          expectedAnswer: data.expectedAnswer,
          expectedTool: data.expectedTool || null,
          expectedParams: data.expectedParams ? JSON.stringify(data.expectedParams) : null,
          category: data.category || 'general',
          tags: data.tags || [],
          notes: data.notes || null,
          verified: data.verified !== false,
          verifiedBy: 'system-seed',
          verifiedAt: new Date(),
        },
      });
      added++;
    } catch (err) {
      console.warn('⚠️  Skipping malformed line');
    }
  }
  
  console.log(`✅ Added ${added} new examples, skipped ${skipped} existing`);
}

async function exportToJSONL() {
  console.log('📤 Exporting verified Q&A examples to JSONL...');
  
  const examples = await prisma.verifiedQA.findMany({
    where: { verified: true },
    orderBy: { createdAt: 'asc' },
  });
  
  const lines = examples.map(ex => JSON.stringify({
    question: ex.question,
    expectedAnswer: ex.expectedAnswer,
    expectedTool: ex.expectedTool,
    expectedParams: ex.expectedParams ? JSON.parse(ex.expectedParams) : null,
    category: ex.category,
    tags: ex.tags,
    notes: ex.notes,
    verified: true,
  }));
  
  const outputPath = path.join(__dirname, '../training-data/verified-qa-export.jsonl');
  fs.writeFileSync(outputPath, lines.join('\n'));
  
  console.log(`✅ Exported ${examples.length} examples to ${outputPath}`);
}

async function stats() {
  console.log('📊 Training Data Statistics\n');
  
  // Total counts
  const totalQA = await prisma.verifiedQA.count();
  const verifiedQA = await prisma.verifiedQA.count({ where: { verified: true } });
  const pendingQA = await prisma.verifiedQA.count({ where: { verified: false } });
  
  console.log('Verified Q&A Examples:');
  console.log(`  Total: ${totalQA}`);
  console.log(`  Verified: ${verifiedQA}`);
  console.log(`  Pending Verification: ${pendingQA}`);
  
  // By category
  const byCategory = await prisma.verifiedQA.groupBy({
    by: ['category'],
    _count: { id: true },
  });
  
  console.log('\nBy Category:');
  for (const cat of byCategory) {
    console.log(`  ${cat.category}: ${cat._count.id}`);
  }
  
  // By tool
  const byTool = await prisma.verifiedQA.groupBy({
    by: ['expectedTool'],
    _count: { id: true },
  });
  
  console.log('\nBy Expected Tool:');
  for (const tool of byTool) {
    console.log(`  ${tool.expectedTool || '(none)'}: ${tool._count.id}`);
  }
  
  // Feedback stats
  const totalFeedback = await prisma.responseFeedback.count();
  const correctFeedback = await prisma.responseFeedback.count({ where: { isCorrect: true } });
  const incorrectFeedback = await prisma.responseFeedback.count({ where: { isCorrect: false } });
  const pendingFeedback = await prisma.responseFeedback.count({ where: { status: 'pending' } });
  
  console.log('\nUser Feedback:');
  console.log(`  Total: ${totalFeedback}`);
  console.log(`  Marked Correct: ${correctFeedback}`);
  console.log(`  Marked Incorrect: ${incorrectFeedback}`);
  console.log(`  Pending Review: ${pendingFeedback}`);
  
  // Usage stats
  const topUsed = await prisma.verifiedQA.findMany({
    orderBy: { usageCount: 'desc' },
    take: 5,
  });
  
  if (topUsed.length > 0 && topUsed[0].usageCount > 0) {
    console.log('\nMost Used Examples:');
    for (const ex of topUsed) {
      if (ex.usageCount > 0) {
        console.log(`  "${ex.question.substring(0, 50)}..." - ${ex.usageCount} uses`);
      }
    }
  }
}

async function reviewFeedback() {
  console.log('👀 Pending Feedback for Review\n');
  
  const pending = await prisma.responseFeedback.findMany({
    where: { status: 'pending', isCorrect: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  
  if (pending.length === 0) {
    console.log('✅ No pending feedback to review!');
    return;
  }
  
  for (const fb of pending) {
    console.log('─'.repeat(60));
    console.log(`ID: ${fb.id}`);
    console.log(`Question: ${fb.question}`);
    console.log(`AI Response: ${fb.aiResponse.substring(0, 200)}...`);
    if (fb.correctedAnswer) {
      console.log(`Correction: ${fb.correctedAnswer}`);
    }
    if (fb.userComment) {
      console.log(`Comment: ${fb.userComment}`);
    }
    console.log(`Date: ${fb.createdAt.toISOString()}`);
    console.log();
  }
  
  console.log(`Total pending: ${pending.length}`);
  console.log('\nTo convert to training example, call:');
  console.log('  await convertFeedbackToExample(feedbackId)');
}

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'seed':
      await seed();
      break;
    case 'export':
      await exportToJSONL();
      break;
    case 'stats':
      await stats();
      break;
    case 'review':
      await reviewFeedback();
      break;
    default:
      console.log('Training Data Management\n');
      console.log('Commands:');
      console.log('  seed    - Seed from verified-qa.jsonl');
      console.log('  export  - Export verified examples to JSONL');
      console.log('  stats   - Show training data statistics');
      console.log('  review  - Review pending feedback');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

