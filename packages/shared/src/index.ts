export * from './db';
export * from './price';
export * from './plan';

// 共享类型：Agent 定义、任务交接协议、异常处理规则（对应方案 §3.2–3.4）
export type AgentName =
  | 'floor_plan' | 'designer' | 'render' | 'quote' | 'matcher'
  | 'growth' | 'consultant' | 'qa' | 'orchestrator';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'escalated' | 'waiting_user';

/** 异常处理规则：调度器按此执行重试/降级/升级（方案 §3.4） */
export type ExceptionAction = 'retry' | 'degrade' | 'escalate_boss' | 'reask_user';

export interface ExceptionRule { name: string; maxRetries: number; action: ExceptionAction }

export const EXCEPTION_RULES: Record<string, ExceptionRule> = {
  low_confidence_floorplan: { name: '户型图识别置信度低', maxRetries: 2, action: 'reask_user' },
  render_failed:            { name: '3D/图像生成失败',     maxRetries: 2, action: 'degrade' },
  quote_mismatch:           { name: '报价漏项/数字不符',   maxRetries: 2, action: 'escalate_boss' },
  no_match:                 { name: '无装修队匹配',         maxRetries: 1, action: 'reask_user' },
  mimo_timeout:             { name: 'MiMo API 超时/熔断',  maxRetries: 3, action: 'retry' },
  content_violation:        { name: '输出违规',             maxRetries: 1, action: 'escalate_boss' },
  qa_fallback_exhausted:    { name: 'QA 回退超限',          maxRetries: 2, action: 'escalate_boss' },
};

/** 任务上记录的异常元信息（output.exception） */
export interface ExceptionInfo { rule: string; ruleName: string; action: ExceptionAction; detail: string; at: string }

const AGENT_DEFAULT_RULE: Record<string, string> = {
  floor_plan: 'low_confidence_floorplan', designer: 'render_failed', quote: 'quote_mismatch',
  matcher: 'no_match', qa: 'qa_fallback_exhausted',
};

/**
 * 异常分类：错误信息 → EXCEPTION_RULES 规则键。
 * 超时/网络类 → mimo_timeout（重试）；图像/渲染类 → render_failed（降级）；违规 → content_violation；
 * 报价类 → quote_mismatch；其余按 Agent 默认规则兜底。
 */
export function classifyException(e: unknown, agent: string): { key: string; rule: ExceptionRule } {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  let key: string;
  if (/赌博|博彩|色情|暴力恐怖|违禁/.test(msg)) key = 'content_violation';
  else if (/timeout|timed out|etimedout|econnreset|econnrefused|fetch failed|network|socket hang up|429|502|503|abort/.test(msg)) key = 'mimo_timeout';
  else if (/image|render|agnes|svg|canvas|webgl|texture/.test(msg)) key = 'render_failed';
  else if (/quote|mismatch|calc|报价/.test(msg)) key = 'quote_mismatch';
  else key = AGENT_DEFAULT_RULE[agent] ?? 'render_failed';
  return { key, rule: EXCEPTION_RULES[key] };
}

/** 构造 output.exception 元信息 */
export function exceptionInfo(key: string, detail: string): ExceptionInfo {
  const rule = EXCEPTION_RULES[key];
  return { rule: key, ruleName: rule?.name ?? key, action: rule?.action ?? 'escalate_boss', detail, at: new Date().toISOString() };
}

/** Agent 交接图（条件边由调度器按状态判断） */
export const HANDOFF_GRAPH: Record<string, string[]> = {
  floor_plan:   ['designer', 'qa'],
  designer:     ['render', 'quote', 'qa'],
  render:       ['qa'],
  quote:        ['qa'],
  matcher:      ['growth', 'consultant'],
  growth:       ['consultant'],
  consultant:   ['orchestrator'],
  qa:           ['orchestrator'],
  orchestrator: [],
};

/** 红线：任何 Agent 不得执行的动作（方案 §7） */
export const FORBIDDEN_ACTIONS = ['take_payment', 'sign_contract', 'verify_contractor', 'certify_safety', 'send_without_signoff'];

/** 核心链路（开发计划 P1 的端到端流水线）：智能体逐个执行；
 *  matcher 不入链——等「业主确认发布 + 装修公司发布数据（投标）」后单独触发 */
export const CORE_CHAIN = ['floor_plan', 'designer', 'quote', 'qa'] as const;
export * from './materials';
export * from './scene3d';
export * from './furniture';
export * from './membership';
export * from './commission';
export * from './fair-bidding';
