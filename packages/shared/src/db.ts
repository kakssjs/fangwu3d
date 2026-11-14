// 数据层：PGlite（进程内 PostgreSQL，开发用）+ Drizzle ORM
// 生产切换阿里云 RDS：只改 createClient 一行（方案 §4.1）
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { pgTable, serial, text, integer, jsonb, doublePrecision } from 'drizzle-orm/pg-core';
import { eq, asc, and, inArray, isNotNull, lte } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { getMembershipTier } from './membership';
import { calculateContractorCommission } from './commission';
import { PRICE_REFERENCES, type PriceReference } from './price';

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  homeownerId: integer('homeowner_id'),
  name: text('name').notNull(),
  style: text('style').notNull(),
  budget: text('budget').notNull(),
  area: text('area'),
  needs: text('needs'),
  floorPlanPath: text('floor_plan_path'),
  requestKey: text('request_key'),
  // 房屋位置：省/市/区来自高德逆地理编码，小区与详细地址由业主选择或填写，经纬度用于详情页地图
  province: text('province'),
  city: text('city'),
  district: text('district'),
  community: text('community'),
  address: text('address'),
  lng: text('lng'),
  lat: text('lat'),
  stage: integer('stage').notNull().default(1),
  createdAt: text('created_at').notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  fromAgent: text('from_agent').notNull(),
  toAgent: text('to_agent').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  status: text('status').notNull().default('pending'), // pending|running|done|failed
  retry: integer('retry').notNull().default(0),
  tokensCost: integer('tokens_cost').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const results = pgTable('results', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  kind: text('kind').notNull(), // plan|design|quote|match|qa
  content: jsonb('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export interface TaskRecord {
  taskId: number;
  projectId: number;
  from: string;
  to: string;
  status: string;
  retryCount: number;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  role: text('role').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  passwordHash: text('password_hash'),
  companyName: text('company_name'),
  license: text('license'),
  qualifications: jsonb('qualifications'),
  districts: jsonb('districts'),
  serviceTypes: jsonb('service_types'),
  specialties: jsonb('specialties'),
  companyScale: text('company_scale'),
  membershipTier: text('membership_tier').default('basic'),
  membershipStatus: text('membership_status').default('pending_payment'),
  membershipExpiresAt: text('membership_expires_at'),
  monthlyLeadQuota: integer('monthly_lead_quota').default(30),
  monthlyLeadsUsed: integer('monthly_leads_used').default(0),
  membershipPaidAmount: integer('membership_paid_amount').default(0),
  membershipStartedAt: text('membership_started_at'),
  /** 邮箱经验证码确认的时间；为空表示 email 只是填写的，没验证过，不能用来登录 */
  emailVerifiedAt: text('email_verified_at'),
  verified: integer('verified').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

/** 待使用的邮箱验证码：只存 HMAC 摘要，不存明文；key = 用途:邮箱 */
export const emailCodes = pgTable('email_codes', {
  key: text('key').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),   // Unix 秒
  attempts: integer('attempts').notNull().default(0),
});

/** 发信限额计数：key = 范围:对象:时间窗，到 expiresAt 为止 */
export const emailQuotas = pgTable('email_quotas', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),   // Unix 秒
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  homeownerId: integer('homeowner_id').notNull(),
  companyId: integer('company_id'),
  status: text('status').notNull().default('open'),
  bidAmount: text('bid_amount'),
  bidWeeks: text('bid_weeks'),
  bidNote: text('bid_note'),
  matchScore: text('match_score'),
  homeownerConfirmedAt: text('homeowner_confirmed_at'),
  companyConfirmedAt: text('company_confirmed_at'),
  confirmedAt: text('confirmed_at'),
  contractedAt: text('contracted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const bids = pgTable('bids', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull(),
  companyId: integer('company_id').notNull(),
  companyName: text('company_name').notNull(),
  amount: text('amount').notNull(),
  weeks: text('weeks').notNull(),
  note: text('note'),
  estimatedCostCny: integer('estimated_cost_cny').default(0),
  profitCny: integer('profit_cny').default(0),
  platformCommissionCny: integer('platform_commission_cny').default(0),
  netProfitCny: integer('net_profit_cny').default(0),
  commissionBasis: text('commission_basis').default('gross_revenue'),
  bidRiskLevel: text('bid_risk_level').default('unknown'),
  bidRiskScore: integer('bid_risk_score').default(0),
  bidRiskReason: text('bid_risk_reason'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
});

export const commissionSettlements = pgTable('commission_settlements', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull(),
  bidId: integer('bid_id').notNull(),
  companyId: integer('company_id').notNull(),
  companyName: text('company_name').notNull(),
  revenueCny: integer('revenue_cny').notNull(),
  estimatedCostCny: integer('estimated_cost_cny').notNull().default(0),
  profitCny: integer('profit_cny').notNull(),
  commissionRatePct: integer('commission_rate_pct').notNull().default(10),
  platformCommissionCny: integer('platform_commission_cny').notNull(),
  contractorNetProfitCny: integer('contractor_net_profit_cny').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  settledAt: text('settled_at'),
});

export const contracts = pgTable('contracts', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull(),
  content: text('content').notNull(),
  homeownerSigned: integer('homeowner_signed').notNull().default(0),
  companySigned: integer('company_signed').notNull().default(0),
  createdAt: text('created_at').notNull(),
  signedAt: text('signed_at'),
});

export const membershipPayments = pgTable('membership_payments', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull(),
  companyName: text('company_name').notNull(),
  tier: text('tier').notNull(),
  billingCycle: text('billing_cycle').notNull().default('annual'),
  periodMonths: integer('period_months').notNull().default(12),
  amountCny: integer('amount_cny').notNull(),
  status: text('status').notNull().default('pending'),
  paymentReference: text('payment_reference'),
  createdAt: text('created_at').notNull(),
  paidAt: text('paid_at'),
});

/** 公开市场参考价（来源见 price.ts 的 PRICE_REFERENCES）：每条带来源链接、发布日期和采集日期 */
export const priceReferences = pgTable('price_references', {
  id: text('id').primaryKey(),
  city: text('city').notNull(),
  category: text('category').notNull(),
  item: text('item').notNull(),
  unit: text('unit').notNull(),
  low: doublePrecision('low').notNull(),
  high: doublePrecision('high').notNull(),
  note: text('note').notNull().default(''),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  publishedAt: text('published_at').notNull(),
  retrievedAt: text('retrieved_at').notNull(),
});

const DDL = `
CREATE TABLE IF NOT EXISTS projects (
  id serial PRIMARY KEY, homeowner_id integer, name text NOT NULL, style text NOT NULL, budget text NOT NULL,
  area text, needs text, floor_plan_path text, stage integer NOT NULL DEFAULT 1, created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id serial PRIMARY KEY, project_id integer NOT NULL, from_agent text NOT NULL, to_agent text NOT NULL,
  input jsonb, output jsonb, status text NOT NULL DEFAULT 'pending', retry integer NOT NULL DEFAULT 0,
  tokens_cost integer NOT NULL DEFAULT 0, created_at text NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  id serial PRIMARY KEY, project_id integer NOT NULL, kind text NOT NULL, content jsonb NOT NULL, created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY, role text NOT NULL, name text NOT NULL,
  phone text, email text, password_hash text,
  company_name text, license text, qualifications jsonb,
  districts jsonb, service_types jsonb, specialties jsonb,
  company_scale text, membership_tier text DEFAULT 'basic', membership_status text DEFAULT 'pending_payment',
  membership_expires_at text, monthly_lead_quota integer DEFAULT 30, monthly_leads_used integer DEFAULT 0,
  membership_paid_amount integer DEFAULT 0, membership_started_at text,
  verified integer NOT NULL DEFAULT 0, created_at text NOT NULL
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS community text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lng text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lat text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_scale text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_tier text DEFAULT 'basic';
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_status text DEFAULT 'pending_payment';
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_expires_at text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_lead_quota integer DEFAULT 30;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_leads_used integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_paid_amount integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_started_at text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS request_key text;
CREATE TABLE IF NOT EXISTS email_codes (
  key text PRIMARY KEY, code_hash text NOT NULL, expires_at integer NOT NULL, attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS email_quotas (
  key text PRIMARY KEY, count integer NOT NULL, expires_at integer NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY, project_id integer NOT NULL, homeowner_id integer NOT NULL,
  company_id integer, status text NOT NULL DEFAULT 'open',
  bid_amount text, bid_weeks text, bid_note text, match_score text,
  homeowner_confirmed_at text, company_confirmed_at text,
  confirmed_at text, contracted_at text,
  created_at text NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS bids (
  id serial PRIMARY KEY, order_id integer NOT NULL, company_id integer NOT NULL,
  company_name text NOT NULL, amount text NOT NULL, weeks text NOT NULL,
  note text, estimated_cost_cny integer DEFAULT 0, profit_cny integer DEFAULT 0,
  platform_commission_cny integer DEFAULT 0, net_profit_cny integer DEFAULT 0,
  commission_basis text DEFAULT 'gross_revenue', status text NOT NULL DEFAULT 'pending', created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS commission_settlements (
  id serial PRIMARY KEY, order_id integer NOT NULL, bid_id integer NOT NULL, company_id integer NOT NULL,
  company_name text NOT NULL, revenue_cny integer NOT NULL, estimated_cost_cny integer DEFAULT 0,
  profit_cny integer NOT NULL, commission_rate_pct integer DEFAULT 10,
  platform_commission_cny integer NOT NULL, contractor_net_profit_cny integer NOT NULL,
  status text NOT NULL DEFAULT 'pending', created_at text NOT NULL, settled_at text
);
ALTER TABLE bids ADD COLUMN IF NOT EXISTS estimated_cost_cny integer DEFAULT 0;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS profit_cny integer DEFAULT 0;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS platform_commission_cny integer DEFAULT 0;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS net_profit_cny integer DEFAULT 0;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS commission_basis text DEFAULT 'gross_revenue';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS bid_risk_level text DEFAULT 'unknown';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS bid_risk_score integer DEFAULT 0;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS bid_risk_reason text;
CREATE TABLE IF NOT EXISTS membership_payments (
  id serial PRIMARY KEY, company_id integer NOT NULL, company_name text NOT NULL,
  tier text NOT NULL, billing_cycle text NOT NULL DEFAULT 'annual', period_months integer DEFAULT 12,
  amount_cny integer NOT NULL, status text NOT NULL DEFAULT 'pending',
  payment_reference text, created_at text NOT NULL, paid_at text
);
CREATE TABLE IF NOT EXISTS contracts (
  id serial PRIMARY KEY, order_id integer NOT NULL, content text NOT NULL,
  homeowner_signed integer NOT NULL DEFAULT 0, company_signed integer NOT NULL DEFAULT 0,
  created_at text NOT NULL, signed_at text
);
ALTER TABLE membership_payments ADD COLUMN IF NOT EXISTS billing_cycle text DEFAULT 'annual';
ALTER TABLE membership_payments ADD COLUMN IF NOT EXISTS period_months integer DEFAULT 12;
CREATE TABLE IF NOT EXISTS price_references (
  id text PRIMARY KEY, city text NOT NULL, category text NOT NULL, item text NOT NULL, unit text NOT NULL,
  low double precision NOT NULL, high double precision NOT NULL, note text NOT NULL DEFAULT '',
  source_name text NOT NULL, source_url text NOT NULL, published_at text NOT NULL, retrieved_at text NOT NULL
);`;

const globalForDb = globalThis as unknown as { __dbPromise?: Promise<ReturnType<typeof drizzle>> };

export async function getDb() {
  if (!globalForDb.__dbPromise) {
    globalForDb.__dbPromise = (async () => {
      // 允许并行实例使用独立数据目录（IRENO_PGLITE_DIR），默认不变
      const dataDir = process.env.IRENO_PGLITE_DIR
        ? path.resolve(process.env.IRENO_PGLITE_DIR)
        : path.join(process.cwd(), '..', '..', '.pglite-data');
      fs.mkdirSync(dataDir, { recursive: true });
      const client = new PGlite(dataDir);
      await client.exec(DDL);
      const db = drizzle(client);
      // 载入随代码发布的参考价：按 id 更新，重复启动不会重复插入
      for (const r of PRICE_REFERENCES) {
        await db.insert(priceReferences).values(r).onConflictDoUpdate({ target: priceReferences.id, set: r });
      }
      return db;
    })();
  }
  return globalForDb.__dbPromise;
}

const now = () => new Date().toISOString();

export async function createProject(p: {
  name: string; style: string; budget: string; area?: string; needs?: string; floorPlanPath?: string; homeownerId?: number; requestKey?: string;
  province?: string; city?: string; district?: string; community?: string; address?: string; lng?: string; lat?: string;
}) {
  const db = await getDb();
  return db.transaction(async tx => {
    if (p.requestKey && p.homeownerId) {
      const [existing] = await tx.select().from(projects).where(and(eq(projects.homeownerId, p.homeownerId), eq(projects.requestKey, p.requestKey)));
      if (existing) return existing;
    }
    const [row] = await tx.insert(projects).values({ ...p, stage: 1, createdAt: now() }).returning();
    await tx.insert(tasks).values({ projectId: row.id, fromAgent: 'orchestrator', toAgent: 'floor_plan',
      input: { projectId: row.id }, status: 'pending', createdAt: now(), updatedAt: now() });
    return row;
  });
}

export async function getProjectsByHomeowner(homeownerId: number) {
  const db = await getDb();
  return db.select().from(projects).where(eq(projects.homeownerId, homeownerId)).orderBy(asc(projects.id));
}

export async function getProject(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  return row ?? null;
}

export async function createTask(projectId: number, from: string, to: string, input: unknown) {
  const db = await getDb();
  const ts = now();
  return db.transaction(async tx => {
  const [existing] = await tx.select().from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.toAgent, to), inArray(tasks.status, ['pending', 'running'])));
  if (existing) return existing;
  if (to === 'floor_plan') await tx.delete(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.toAgent, to), eq(tasks.status, 'waiting_user')));
  const [row] = await tx.insert(tasks).values({
    projectId, fromAgent: from, toAgent: to, input: input as never,
    status: 'pending', retry: 0, tokensCost: 0, createdAt: ts, updatedAt: ts,
  }).returning();
  return row;
  });
}

/** 领取一条 pending 任务并置为 running（单进程 runner，乐观锁即可） */
export async function claimNextTask() {
  const db = await getDb();
  const [t] = await db.select().from(tasks).where(eq(tasks.status, 'pending')).orderBy(asc(tasks.id)).limit(1);
  if (!t) return null;
  const [claimed] = await db.update(tasks).set({ status: 'running', updatedAt: now() })
    .where(and(eq(tasks.id, t.id), eq(tasks.status, 'pending'))).returning();
  return claimed ?? null;
}

/** Called once before the single runner starts; interrupted work must not remain stuck forever. */
export async function recoverRunningTasks() {
  const db = await getDb();
  await db.update(tasks).set({ status: 'pending', updatedAt: now() }).where(eq(tasks.status, 'running'));
}

export async function finishTask(id: number, output: unknown, tokensCost: number, continuation?: { nextAgent?: string; stage?: number }) {
  const db = await getDb();
  await db.transaction(async tx => {
    const [task] = await tx.update(tasks).set({ status: 'done', output: output as never, tokensCost, updatedAt: now() }).where(and(eq(tasks.id, id), eq(tasks.status, 'running'))).returning();
    if (!task) return;
    if (continuation?.nextAgent) {
      const [existing] = await tx.select().from(tasks).where(and(eq(tasks.projectId, task.projectId), eq(tasks.toAgent, continuation.nextAgent), inArray(tasks.status, ['pending', 'running'])));
      if (!existing) await tx.insert(tasks).values({ projectId: task.projectId, fromAgent: task.toAgent, toAgent: continuation.nextAgent,
        input: { projectId: task.projectId }, status: 'pending', createdAt: now(), updatedAt: now() });
    }
    if (continuation?.stage) await tx.update(projects).set({ stage: continuation.stage }).where(eq(projects.id, task.projectId));
  });
}

export async function failTask(id: number, retry: number) {
  const db = await getDb();
  await db.update(tasks).set({ status: 'pending', retry, updatedAt: now() }).where(eq(tasks.id, id));
}

/** 异常升级：任务置 escalated，等待老板裁决（EXCEPTION_RULES action=escalate_boss） */
export async function escalateTask(id: number, output: unknown) {
  const db = await getDb();
  await db.update(tasks).set({ status: 'escalated', output: output as never, updatedAt: now() }).where(eq(tasks.id, id));
}

export async function decideTask(id: number, action: 'retry' | 'dismiss') {
  const db = await getDb();
  return db.transaction(async tx => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, id));
    if (!task || !['failed', 'escalated', 'waiting_user'].includes(task.status)) throw new Error('任务不存在或当前状态不需要裁决');
    const [updated] = await tx.update(tasks).set({ status: action === 'retry' ? 'pending' : 'cancelled', retry: 0,
      output: { ...(task.output as object || {}), bossDecision: action, decidedAt: now() }, updatedAt: now(),
    }).where(eq(tasks.id, id)).returning();
    return updated;
  });
}

/** 反问用户：任务置 waiting_user，等待业主补充信息后继续（action=reask_user） */
export async function waitingTask(id: number, output: unknown) {
  const db = await getDb();
  await db.update(tasks).set({ status: 'waiting_user', output: output as never, updatedAt: now() }).where(eq(tasks.id, id));
}

/** 用户补充/确认后恢复等待中的任务（waiting_user → pending，由 runner 续跑；标记 resumed 避免重复反问） */
export async function resumeWaitingTasks(projectId: number) {
  const db = await getDb();
  const rows = await db.select().from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, 'waiting_user')));
  for (const t of rows) {
    const prev = (t.output ?? {}) as Record<string, unknown>;
    await db.update(tasks).set({
      status: 'pending', retry: 0,
      output: { ...prev, resumed: true, resumedAt: now() } as never,
      updatedAt: now(),
    }).where(eq(tasks.id, t.id));
  }
  return rows.length;
}

export async function saveResult(projectId: number, kind: string, content: unknown) {
  const db = await getDb();
  await db.insert(results).values({ projectId, kind, content: content as never, createdAt: now() });
}

/** 覆盖式保存：同 kind 只保留最新一份（户型图更新、报价修订等场景） */
export async function upsertResult(projectId: number, kind: string, content: unknown) {
  const db = await getDb();
  await db.transaction(async tx => {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!project) throw new Error('项目已不存在');
    await tx.delete(results).where(and(eq(results.projectId, projectId), eq(results.kind, kind)));
    await tx.insert(results).values({ projectId, kind, content: content as never, createdAt: now() });
  });
}

export async function listResults(projectId: number) {
  const db = await getDb();
  return db.select().from(results).where(eq(results.projectId, projectId)).orderBy(asc(results.id));
}

export async function listTasks(projectId: number) {
  const db = await getDb();
  return db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(asc(tasks.id));
}

// ---- 全量查询（老板控制台） ----
export async function listAllProjects() {
  const db = await getDb();
  return db.select().from(projects).orderBy(asc(projects.id));
}

export async function listAllTasks() {
  const db = await getDb();
  return db.select().from(tasks).orderBy(asc(tasks.id));
}

export async function listAllOrders() {
  const db = await getDb();
  return db.select().from(orders).orderBy(asc(orders.id));
}

export async function getResult(projectId: number, kind: string) {
  const db = await getDb();
  const [row] = await db.select().from(results)
    .where(and(eq(results.projectId, projectId), eq(results.kind, kind))).orderBy(asc(results.id)).limit(1);
  return row ?? null;
}

// ---- Users ----
export async function createUser(u: {
  role: string; name: string; phone?: string; email?: string; passwordHash?: string;
  companyName?: string; license?: string; qualifications?: unknown;
  districts?: unknown; serviceTypes?: unknown; specialties?: unknown;
  companyScale?: string; membershipTier?: string; membershipStatus?: string; monthlyLeadQuota?: number;
  emailVerifiedAt?: string;
}) {
  const db = await getDb();
  return db.transaction(async tx => {
    if (u.phone) {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, u.phone));
      if (existing) throw new Error('该手机号已注册');
    }
    if (u.emailVerifiedAt && u.email) {
      const [existing] = await tx.select({ id: users.id }).from(users).where(and(eq(users.email, u.email), isNotNull(users.emailVerifiedAt)));
      if (existing) throw new Error('该邮箱已注册');
    }
    const [row] = await tx.insert(users).values({ ...u, verified: 0, createdAt: now() }).returning();
    return row;
  });
}

/** 按「已验证」的邮箱找账号（邮箱统一小写）。只填写、没验证过的邮箱找不到。 */
export async function getUserByVerifiedEmail(email: string) {
  const db = await getDb();
  const [row] = await db.select().from(users).where(and(eq(users.email, email), isNotNull(users.emailVerifiedAt)));
  return row ?? null;
}

// ---- 邮箱验证码 ----

const nowSec = () => Math.floor(Date.now() / 1000);

/** 占用一次发信额度；超过 limit 返回 false。窗口到期后从 1 重新计。 */
export async function takeEmailQuota(key: string, periodSec: number, limit: number): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async tx => {
  const t = nowSec();
  const [row] = await tx.select().from(emailQuotas).where(eq(emailQuotas.key, key));
  if (!row || row.expiresAt <= t) {
    await tx.insert(emailQuotas).values({ key, count: 1, expiresAt: t + periodSec })
      .onConflictDoUpdate({ target: emailQuotas.key, set: { count: 1, expiresAt: t + periodSec } });
    return true;
  }
  if (row.count >= limit) return false;
  await tx.update(emailQuotas).set({ count: row.count + 1 }).where(eq(emailQuotas.key, key));
  return true;
  });
}

/** 保存（或替换）某个用途和邮箱的验证码摘要，重置错误次数。顺带清掉过期的码和额度。 */
export async function saveEmailCode(key: string, codeHash: string, ttlSec: number) {
  const db = await getDb();
  const t = nowSec();
  await db.delete(emailCodes).where(lte(emailCodes.expiresAt, t));
  await db.delete(emailQuotas).where(lte(emailQuotas.expiresAt, t));
  await db.insert(emailCodes).values({ key, codeHash, expiresAt: t + ttlSec, attempts: 0 })
    .onConflictDoUpdate({ target: emailCodes.key, set: { codeHash, expiresAt: t + ttlSec, attempts: 0 } });
}

export async function consumeEmailCodeHash(key: string, codeHash: string) {
  const db = await getDb();
  return db.transaction(async tx => {
    const [row] = await tx.select().from(emailCodes).where(eq(emailCodes.key, key));
    if (!row || row.expiresAt <= nowSec() || row.attempts >= 5) return false;
    const expected = Buffer.from(row.codeHash, 'hex');
    const actual = Buffer.from(codeHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) {
      await tx.update(emailCodes).set({ attempts: row.attempts + 1 }).where(eq(emailCodes.key, key));
      return false;
    }
    await tx.delete(emailCodes).where(eq(emailCodes.key, key));
    return true;
  });
}

export async function deleteEmailCode(key: string) {
  const db = await getDb();
  await db.delete(emailCodes).where(eq(emailCodes.key, key));
}

export async function getUser(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

export async function getUserByPhone(phone: string) {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.phone, phone));
  return row ?? null;
}

export async function listCompanies() {
  const db = await getDb();
  return db.select().from(users).where(eq(users.role, 'company'));
}

/** 老板人工审核资质（★ Agent 不得代为认证）：1=通过 -1=驳回 0=待审核 */
export async function setUserVerified(id: number, value: 1 | -1) {
  const db = await getDb();
  await db.update(users).set({ verified: value }).where(eq(users.id, id));
}

/** 装修队补充/更新资质材料，重置为待审核（verified=0） */
export async function updateCompanyProfile(id: number, patch: Partial<{
  companyName: string; license: string; qualifications: unknown;
  districts: unknown; serviceTypes: unknown; specialties: unknown;
}>) {
  const db = await getDb();
  await db.update(users).set({ ...patch, verified: 0 }).where(and(eq(users.id, id), eq(users.role, 'company')));
}

/** 开通/调整装修队会员套餐。支付网关回调或老板线下确认后调用。 */
export async function setCompanyMembership(id: number, patch: Partial<{
  companyScale: string; membershipTier: string; membershipStatus: string; membershipExpiresAt: string;
  monthlyLeadQuota: number; monthlyLeadsUsed: number; membershipPaidAmount: number; membershipStartedAt: string;
}>) {
  const db = await getDb();
  await db.update(users).set(patch).where(and(eq(users.id, id), eq(users.role, 'company')));
}

/** 进入新的自然月时重置客户资源用量 */
export async function ensureCurrentLeadPeriod(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id));
  if (!row) return null;
  const currentMonth = now().slice(0, 7);
  const periodMonth = (row.membershipStartedAt ?? '').slice(0, 7);
  if (periodMonth !== currentMonth) {
    await db.update(users).set({ monthlyLeadsUsed: 0, membershipStartedAt: now() }).where(eq(users.id, id));
    return { ...row, monthlyLeadsUsed: 0, membershipStartedAt: now() };
  }
  return row;
}

export async function listMembershipPayments(companyId?: number) {
  const db = await getDb();
  return companyId
    ? db.select().from(membershipPayments).where(eq(membershipPayments.companyId, companyId)).orderBy(asc(membershipPayments.id))
    : db.select().from(membershipPayments).orderBy(asc(membershipPayments.id));
}

export async function getOrCreateOnlinePayment(companyId: number, baseline: string | null) {
  const db = await getDb();
  return db.transaction(async tx => {
    const pending = await tx.select().from(membershipPayments).where(and(
      eq(membershipPayments.companyId, companyId), eq(membershipPayments.status, 'pending')));
    const existing = pending.find(p => p.paymentReference?.startsWith('opcpay:'));
    if (existing) return existing;
    const [company] = await tx.select().from(users).where(and(eq(users.id, companyId), eq(users.role, 'company')));
    if (!company) throw new Error('Company not found');
    const [row] = await tx.insert(membershipPayments).values({ companyId,
      companyName: company.companyName || company.name, tier: 'basic', amountCny: 39,
      billingCycle: 'monthly', periodMonths: 1, status: 'pending', createdAt: now(),
      paymentReference: 'opcpay:' + (baseline || ''),
    }).returning();
    return row;
  });
}

// An entitlement observation is not a payment receipt; never fabricate paid amounts or transaction IDs.
export async function observeOnlinePayments(companyId: number, expires: string) {
  const db = await getDb();
  await db.transaction(async tx => {
    const pending = await tx.select().from(membershipPayments).where(and(
      eq(membershipPayments.companyId, companyId), eq(membershipPayments.status, 'pending')));
    for (const payment of pending) {
      if (!payment.paymentReference?.startsWith('opcpay:')) continue;
      const baseline = payment.paymentReference.slice(7);
      if (!baseline || Date.parse(expires) > Date.parse(baseline)) {
        await tx.update(membershipPayments).set({ status: 'entitlement_confirmed' }).where(eq(membershipPayments.id, payment.id));
      }
    }
  });
}

export async function expireOnlinePayment(id: number) {
  const db = await getDb();
  await db.update(membershipPayments).set({ status: 'entry_expired' })
    .where(and(eq(membershipPayments.id, id), eq(membershipPayments.status, 'pending')));
}

/** 每月 1 日重置客户资源用量 */
export async function resetMonthlyLeadUsage(id: number) {
  const db = await getDb();
  await db.update(users).set({ monthlyLeadsUsed: 0 }).where(and(eq(users.id, id), eq(users.role, 'company')));
}

/** 保存密码哈希（登录时把旧的明文密码升级为哈希） */
export async function setUserPasswordHash(id: number, passwordHash: string) {
  const db = await getDb();
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
}

// ---- Orders ----
export async function createOrder(o: {
  projectId: number; homeownerId: number; status?: string;
}) {
  const db = await getDb();
  const ts = now();
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(orders).where(eq(orders.projectId, o.projectId)).orderBy(asc(orders.id)).limit(1);
    if (existing) return existing;
    const [row] = await tx.insert(orders).values({ ...o, status: 'open', createdAt: ts, updatedAt: ts }).returning();
    return row;
  });
}

export async function getOrder(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row ?? null;
}

export async function getOrderByProject(projectId: number) {
  const db = await getDb();
  const [row] = await db.select().from(orders).where(eq(orders.projectId, projectId)).orderBy(asc(orders.id)).limit(1);
  return row ?? null;
}

export async function listOrdersByHomeowner(homeownerId: number) {
  const db = await getDb();
  return db.select().from(orders).where(eq(orders.homeownerId, homeownerId)).orderBy(asc(orders.id));
}

export async function listOrdersByCompany(companyId: number) {
  const db = await getDb();
  return db.select().from(orders).where(eq(orders.companyId, companyId)).orderBy(asc(orders.id));
}

export async function listOpenOrders() {
  const db = await getDb();
  return db.select().from(orders).where(eq(orders.status, 'open'));
}

export async function updateOrder(id: number, patch: Partial<{ companyId: number; status: string; bidAmount: string; bidWeeks: string; bidNote: string; matchScore: string; homeownerConfirmedAt: string; companyConfirmedAt: string; confirmedAt: string; contractedAt: string }>) {
  const db = await getDb();
  await db.update(orders).set({ ...patch, updatedAt: now() }).where(eq(orders.id, id));
}

export async function selectOrderCompany(id: number, companyId: number) {
  const db = await getDb();
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id));
    if (!order || !['open', 'matched'].includes(order.status)) throw new Error('当前状态不能更换装修队');
    const [bid] = await tx.select().from(bids).where(and(eq(bids.orderId, id), eq(bids.companyId, companyId)));
    const [company] = await tx.select().from(users).where(eq(users.id, companyId));
    if (!bid || !company || company.verified !== 1 || company.membershipStatus !== 'active' ||
        !company.membershipExpiresAt || Date.parse(company.membershipExpiresAt) <= Date.now()) throw new Error('请选择已审核且有有效会员的真实投标公司');
    await tx.update(bids).set({ status: 'rejected' }).where(eq(bids.orderId, id));
    await tx.update(bids).set({ status: 'accepted' }).where(eq(bids.id, bid.id));
    const [updated] = await tx.update(orders).set({ companyId, status: 'matched', bidAmount: bid.amount,
      bidWeeks: bid.weeks, bidNote: bid.note, updatedAt: now() }).where(eq(orders.id, id)).returning();
    return updated;
  });
}

export async function confirmOrder(id: number, signer: 'homeowner' | 'company') {
  const db = await getDb();
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id));
    if (!order?.companyId || !['matched', 'homeowner_confirmed', 'company_confirmed', 'confirmed', 'contracted'].includes(order.status)) throw new Error('请先选定有效投标公司');
    if (['confirmed', 'contracted'].includes(order.status)) return order;
    const homeownerConfirmedAt = order.homeownerConfirmedAt || (signer === 'homeowner' ? now() : null);
    const companyConfirmedAt = order.companyConfirmedAt || (signer === 'company' ? now() : null);
    const both = !!homeownerConfirmedAt && !!companyConfirmedAt;
    const [updated] = await tx.update(orders).set({ homeownerConfirmedAt, companyConfirmedAt,
      status: both ? 'confirmed' : `${signer}_confirmed`, confirmedAt: both ? now() : null, updatedAt: now(),
    }).where(eq(orders.id, id)).returning();
    return updated;
  });
}

// ---- Bids ----
export async function createBid(b: {
  orderId: number; companyId: number; companyName: string; amount: string; weeks: string; note?: string;
  estimatedCostCny?: number; profitCny?: number; platformCommissionCny?: number; netProfitCny?: number; commissionBasis?: string;
  bidRiskLevel?: string; bidRiskScore?: number; bidRiskReason?: string;
}) {
  const db = await getDb();
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, b.orderId));
    const [company] = await tx.select().from(users).where(eq(users.id, b.companyId));
    if (!order || order.status !== 'open') throw new Error('订单不接受投标');
    if (!company || company.role !== 'company' || company.verified !== 1) throw new Error('请先完成资质审核');
    if (company.membershipStatus !== 'active' || !company.membershipExpiresAt || Date.parse(company.membershipExpiresAt) <= Date.now()) throw new Error('请先开通有效会员');
    const [existing] = await tx.select().from(bids).where(and(eq(bids.orderId, b.orderId), eq(bids.companyId, b.companyId)));
    if (existing) throw new Error('同一项目不能重复投标');
    const used = company.membershipStartedAt?.slice(0, 7) === now().slice(0, 7) ? Number(company.monthlyLeadsUsed ?? 0) : 0;
    if (used >= Number(company.monthlyLeadQuota ?? 30)) throw new Error('本月客户资源额度已用完');
    const active = await tx.select({ id: bids.id }).from(bids).innerJoin(orders, eq(bids.orderId, orders.id))
      .where(and(eq(bids.companyId, b.companyId), inArray(bids.status, ['pending', 'accepted']), inArray(orders.status, ['open', 'matched', 'homeowner_confirmed', 'company_confirmed', 'confirmed'])));
    if (active.length >= getMembershipTier(company.membershipTier).maxActiveBids) throw new Error('同时参与的项目已达套餐上限');
    const [row] = await tx.insert(bids).values({ ...b, status: 'pending', createdAt: now() }).returning();
    await tx.update(users).set({ monthlyLeadsUsed: used + 1, ...(company.membershipStartedAt?.slice(0, 7) === now().slice(0, 7) ? {} : { membershipStartedAt: now() }) }).where(eq(users.id, b.companyId));
    return row;
  });
}

export async function getCommissionSettlementByOrder(orderId: number) {
  const db = await getDb();
  const [row] = await db.select().from(commissionSettlements).where(eq(commissionSettlements.orderId, orderId)).limit(1);
  return row ?? null;
}

export async function setCommissionSettlementStatus(id: number, status: 'settled' | 'cancelled') {
  const db = await getDb();
  const [row] = await db.update(commissionSettlements).set({ status, settledAt: status === 'settled' ? now() : null }).where(eq(commissionSettlements.id, id)).returning();
  return row ?? null;
}

export async function listBidsByOrder(orderId: number) {
  const db = await getDb();
  return db.select().from(bids).where(eq(bids.orderId, orderId)).orderBy(asc(bids.id));
}

/** 业主选定中标方：中标 bid → accepted，同订单其余 pending bid → rejected */


// ---- Contracts ----
export async function createContract(c: { orderId: number; content: string }) {
  const db = await getDb();
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, c.orderId));
    if (!order || !['confirmed', 'contracted'].includes(order.status)) throw new Error('双方确认后才能生成合同');
    const [existing] = await tx.select().from(contracts).where(eq(contracts.orderId, c.orderId));
    if (existing) return existing;
    const [row] = await tx.insert(contracts).values({ ...c, homeownerSigned: 0, companySigned: 0, createdAt: now() }).returning();
    return row;
  });
}

export async function getContractByOrder(orderId: number) {
  const db = await getDb();
  const [row] = await db.select().from(contracts).where(eq(contracts.orderId, orderId)).orderBy(asc(contracts.id)).limit(1);
  return row ?? null;
}

export async function signContract(id: number, signer: 'homeowner' | 'company') {
  const db = await getDb();
  return db.transaction(async tx => {
    const [contract] = await tx.select().from(contracts).where(eq(contracts.id, id));
    if (!contract) throw new Error('合同不存在');
    const [order] = await tx.select().from(orders).where(eq(orders.id, contract.orderId));
    if (!order?.companyId || !['confirmed', 'contracted'].includes(order.status)) throw new Error('订单尚未由双方确认');
    const field = signer === 'homeowner' ? { homeownerSigned: 1 } : { companySigned: 1 };
    const [updated] = await tx.update(contracts).set(field).where(eq(contracts.id, id)).returning();
    if (updated.homeownerSigned && updated.companySigned) {
      const [bid] = await tx.select().from(bids).where(and(eq(bids.orderId, order.id), eq(bids.companyId, order.companyId), eq(bids.status, 'accepted')));
      if (!bid) throw new Error('缺少中标报价');
      const [settlement] = await tx.select().from(commissionSettlements).where(eq(commissionSettlements.orderId, order.id));
      if (!settlement) {
        const quote = calculateContractorCommission({ amount: bid.amount, estimatedCost: bid.commissionBasis === 'gross_revenue' ? null : Number(bid.estimatedCostCny) / 10000, amountInWan: true });
        await tx.insert(commissionSettlements).values({ orderId: order.id, bidId: bid.id, companyId: bid.companyId,
          companyName: bid.companyName, revenueCny: quote.revenueCny, estimatedCostCny: quote.estimatedCostCny,
          profitCny: quote.profitCny, platformCommissionCny: quote.platformCommissionCny,
          contractorNetProfitCny: quote.contractorNetProfitCny, status: 'pending', createdAt: now() });
      }
      if (!updated.signedAt) await tx.update(contracts).set({ signedAt: now() }).where(eq(contracts.id, id));
      if (order.status !== 'contracted') await tx.update(orders).set({ status: 'contracted', contractedAt: now(), updatedAt: now() }).where(eq(orders.id, order.id));
    }
    return updated;
  });
}

// ---- 项目删除（级联清理：合同 → 投标 → 订单 → 任务 → 结果 → 项目 + 户型图文件） ----
export async function deleteProject(id: number) {
  const db = await getDb();
  const project = await getProject(id);
  if (!project) return false;
  const orderRows = await db.select({ id: orders.id }).from(orders).where(eq(orders.projectId, id));
  const orderIds = orderRows.map(o => o.id);
  await db.transaction(async tx => {
    if (orderIds.length > 0) {
      await tx.delete(commissionSettlements).where(inArray(commissionSettlements.orderId, orderIds));
      await tx.delete(contracts).where(inArray(contracts.orderId, orderIds));
      await tx.delete(bids).where(inArray(bids.orderId, orderIds));
    }
    await tx.delete(orders).where(eq(orders.projectId, id));
    await tx.delete(tasks).where(eq(tasks.projectId, id));
    await tx.delete(results).where(eq(results.projectId, id));
    await tx.delete(projects).where(eq(projects.id, id));
  });
  // 上传的户型图文件一并清理（失败不影响删除结果）
  if (project.floorPlanPath) {
    try { fs.unlinkSync(project.floorPlanPath); } catch { /* ignore */ }
  }
  return true;
}

// ---- 老板注销用户 ----
/** 老板控制台的用户列表（不含密码哈希），附带业主项目数 */
export async function listAllUsers() {
  const db = await getDb();
  const [rows, projectRows] = await Promise.all([
    db.select({
      id: users.id, role: users.role, name: users.name, phone: users.phone, email: users.email,
      companyName: users.companyName, createdAt: users.createdAt,
    }).from(users).orderBy(asc(users.id)),
    db.select({ homeownerId: projects.homeownerId }).from(projects),
  ]);
  const count = new Map<number, number>();
  for (const p of projectRows) if (p.homeownerId != null) count.set(p.homeownerId, (count.get(p.homeownerId) ?? 0) + 1);
  return rows.map(u => ({ ...u, projectCount: count.get(u.id) ?? 0 }));
}

/**
 * 注销用户（仅老板操作）。业主：连同其全部项目（订单、投标、合同、分成记录、户型图）一并删除，与删除项目相同。
 * 装修公司：删除其投标；若已被选为某订单的施工方，拒绝注销，以免业主的订单与合同失去对方。
 * 入驻费 / 会员付款记录保留，作为收款凭证。
 */
export async function deleteUser(id: number): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'has_orders' }> {
  const db = await getDb();
  const user = await getUser(id);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.role === 'company') {
    const awarded = await db.select({ id: orders.id }).from(orders).where(eq(orders.companyId, id));
    if (awarded.length > 0) return { ok: false, reason: 'has_orders' };
    await db.transaction(async tx => {
      await tx.delete(bids).where(eq(bids.companyId, id));
      await tx.delete(users).where(eq(users.id, id));
    });
    return { ok: true };
  }
  const own = await db.select({ id: projects.id }).from(projects).where(eq(projects.homeownerId, id));
  for (const p of own) await deleteProject(p.id);
  await db.delete(users).where(eq(users.id, id));
  return { ok: true };
}

// ---- 市场参考价 ----
export async function listPriceReferences(city?: string): Promise<PriceReference[]> {
  const db = await getDb();
  const rows = city
    ? await db.select().from(priceReferences).where(inArray(priceReferences.city, [city, '全国'])).orderBy(asc(priceReferences.id))
    : await db.select().from(priceReferences).orderBy(asc(priceReferences.id));
  return rows as PriceReference[];
}
