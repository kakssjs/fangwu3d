// Agent Worker：消费 BullMQ 任务，按交接图路由，按异常规则重试/降级/升级（方案 §3.3–3.4）
// 启动：REDIS_URL=redis://localhost:6379 npm run dev -w apps/worker

import { Queue, Worker, Job } from 'bullmq';
import { EXCEPTION_RULES, HANDOFF_GRAPH, type AgentName, type TaskRecord } from '@i-renovation/shared';
import { AGENTS } from './agents.js';
import { callMimo } from './mimo.js';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

export const taskQueue = new Queue('agent-tasks', { connection });

interface TaskJob {
  record: TaskRecord;
  context: string; // 上游交付物摘要（实际项目从 DB/OSS 读取）
}

async function runAgent(job: Job<TaskJob>) {
  const { record, context } = job.data;
  const agent = AGENTS[record.to as Exclude<AgentName, 'orchestrator'>];
  if (!agent) throw new Error(`unknown agent: ${record.to}`);

  try {
    const result = await callMimo([
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: context },
    ]);

    // TODO: 落库 TaskRecord(done, tokensCost)，QA 通过后按 HANDOFF_GRAPH 建下一任务
    console.log(`[${record.taskId}] ${record.to} done, tokens=${result.tokensUsed}`);
    return result;
  } catch (err) {
    const rule = EXCEPTION_RULES.mimo_timeout;
    if (record.retryCount < rule.maxRetries) {
      // 重试（BullMQ attempts 也可承担）
      throw err;
    }
    if (rule.action === 'degrade') {
      // 降级：二维图+文字先行交付，3D 补发（方案 §3.4）
      console.warn(`[${record.taskId}] degrade after ${rule.maxRetries} retries`);
      return { text: '(降级交付)', tokensUsed: 0 };
    }
    // escalate_boss：进老板审批队列
    console.error(`[${record.taskId}] escalated to boss:`, err);
    throw err;
  }
}

export const worker = new Worker<TaskJob>('agent-tasks', runAgent, { connection, concurrency: 2 });

worker.on('completed', (job) => console.log('completed', job.id));
worker.on('failed', (job, err) => console.error('failed', job?.id, err.message));

// 入队示例：户型识别 → 设计
export async function enqueueHandoff(record: TaskRecord, context: string) {
  if (!HANDOFF_GRAPH[record.from]?.includes(record.to)) {
    throw new Error(`illegal handoff: ${record.from} -> ${record.to}`);
  }
  await taskQueue.add('run', { record, context });
}
