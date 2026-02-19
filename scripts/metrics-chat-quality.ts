#!/usr/bin/env npx ts-node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ToolMeta = {
  usedAnyTool?: boolean;
  guardTriggered?: boolean;
  executedTools?: string[];
  toolErrorCount?: number;
  iterations?: number;
};

function safeParseToolMeta(value: string | null): ToolMeta | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ToolMeta;
  } catch {
    return null;
  }
}

async function run(): Promise<void> {
  const days = Number(process.argv[2] || 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const assistantMessages = await prisma.message.findMany({
    where: {
      role: 'assistant',
      createdAt: { gte: since },
    },
    select: {
      id: true,
      content: true,
      quickbaseQuery: true,
      createdAt: true,
    },
  });

  const metas = assistantMessages.map(msg => safeParseToolMeta(msg.quickbaseQuery));
  const withMeta = metas.filter(Boolean) as ToolMeta[];
  const usedTool = withMeta.filter(m => m.usedAnyTool).length;
  const guardTriggered = withMeta.filter(m => m.guardTriggered).length;
  const toolErrors = withMeta.reduce((sum, m) => sum + (m.toolErrorCount || 0), 0);
  const provenanceCount = assistantMessages.filter(m => m.content.includes('*Source:')).length;

  const feedback = await prisma.responseFeedback.findMany({
    where: { createdAt: { gte: since } },
    select: { isCorrect: true, status: true },
  });
  const rated = feedback.filter(f => f.isCorrect !== null);
  const correct = rated.filter(f => f.isCorrect === true).length;
  const incorrect = rated.filter(f => f.isCorrect === false).length;
  const pending = feedback.filter(f => f.status === 'pending').length;

  const toPct = (num: number, den: number): string => {
    if (!den) return '0.00%';
    return `${((num / den) * 100).toFixed(2)}%`;
  };

  console.log(`Chat quality metrics (last ${days} days, since ${since.toISOString()})`);
  console.log('');
  console.log(`Assistant responses: ${assistantMessages.length}`);
  console.log(`Responses with telemetry: ${withMeta.length}`);
  console.log(`Tool-use rate (telemetry scope): ${toPct(usedTool, withMeta.length)} (${usedTool}/${withMeta.length})`);
  console.log(`Guard-trigger rate (no-tool data requests): ${toPct(guardTriggered, withMeta.length)} (${guardTriggered}/${withMeta.length})`);
  console.log(`Responses with provenance footer: ${toPct(provenanceCount, assistantMessages.length)} (${provenanceCount}/${assistantMessages.length})`);
  console.log(`Total tool execution errors: ${toolErrors}`);
  console.log('');
  console.log(`Feedback rows: ${feedback.length}`);
  console.log(`Rated feedback: ${rated.length}`);
  console.log(`Correct rate (rated scope): ${toPct(correct, rated.length)} (${correct}/${rated.length})`);
  console.log(`Incorrect rate (rated scope): ${toPct(incorrect, rated.length)} (${incorrect}/${rated.length})`);
  console.log(`Pending feedback review: ${pending}`);
}

run()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
