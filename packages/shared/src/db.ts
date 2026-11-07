// 数据层：PGlite（进程内 PostgreSQL，开发用）+ Drizzle ORM
// 生产切换阿里云 RDS：只改 createClient 一行（方案 §4.1）
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { pgTable, serial, text, integer, jsonb } from 'drizzle-orm/pg-core';
import { eq, asc, and, inArray, isNotNull, lte } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';
import { getMembershipTier } from './membership';

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  homeownerId: integer('homeowner_id'),
  name: text('name').notNull(),
  style: text('style').notNull(),
  budget: text('budget').notNull(),
  area: text('area'),
  needs: text('needs'),
  floorPlanPath: text('floor_plan_path'),
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
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_scale text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_tier text DEFAULT 'basic';
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_status text DEFAULT 'pending_payment';
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_expires_at text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_lead_quota integer DEFAULT 30;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_leads_used integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_paid_amount integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_started_at text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at text;
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
ALTER TABLE membership_payments ADD COLUMN IF NOT EXISTS period_months integer DEFAULT 12;`;

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
      return drizzle(client);
    })();
  }
  return globalForDb.__dbPromise;
}

const now = () => new Date().toISOString();

export async function createProject(p: {
  name: string; style: string; budget: string; area?: string; needs?: string; floorPlanPath?: string; homeownerId?: number;
}) {
  const db = await getDb();
  const [row] = await db.insert(projects).values({ ...p, stage: 1, createdAt: now() }).returning();
  await createTask(row.id, 'orchestrator', 'floor_plan', { projectId: row.id });
  return row;
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
  const [row] = await db.insert(tasks).values({
    projectId, fromAgent: from, toAgent: to, input: input as never,
    status: 'pending', retry: 0, tokensCost: 0, createdAt: ts, updatedAt: ts,
  }).returning();
  return row;
}

/** 领取一条 pending 任务并置为 running（单进程 runner，乐观锁即可） */
export async function claimNextTask() {
  const db = await getDb();
  const [t] = await db.select().from(tasks).where(eq(tasks.status, 'pending')).orderBy(asc(tasks.id)).limit(1);
  if (!t) return null;
  await db.update(tasks).set({ status: 'running', updatedAt: now() }).where(eq(tasks.id, t.id));
  return { ...t, status: 'running' };
}

export async function finishTask(id: number, output: unknown, tokensCost: number) {
  const db = await getDb();
  await db.update(tasks).set({ status: 'done', output: output as never, tokensCost, updatedAt: now() }).where(eq(tasks.id, id));
}

export async function failTask(id: number, retry: number) {
  const db = await getDb();
  await db.update(tasks).set({ status: retry >= 2 ? 'failed' : 'pending', retry, updatedAt: now() }).where(eq(tasks.id, id));
}

/** 异常升级：任务置 escalated，等待老板裁决（EXCEPTION_RULES action=escalate_boss） */
export async function escalateTask(id: number, output: unknown) {
  const db = await getDb();
  await db.update(tasks).set({ status: 'escalated', output: output as never, updatedAt: now() }).where(eq(tasks.id, id));
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
  await db.delete(results).where(and(eq(results.projectId, projectId), eq(results.kind, kind)));
  await db.insert(results).values({ projectId, kind, content: content as never, createdAt: now() });
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
  const [row] = await db.insert(users).values({ ...u, verified: 0, createdAt: now() }).returning();
  return row;
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
  const t = nowSec();
  const [row] = await db.select().from(emailQuotas).where(eq(emailQuotas.key, key));
  if (!row || row.expiresAt <= t) {
    await db.insert(emailQuotas).values({ key, count: 1, expiresAt: t + periodSec })
      .onConflictDoUpdate({ target: emailQuotas.key, set: { count: 1, expiresAt: t + periodSec } });
    return true;
  }
  if (row.count >= limit) return false;
  await db.update(emailQuotas).set({ count: row.count + 1 }).where(eq(emailQuotas.key, key));
  return true;
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

export async function getEmailCode(key: string) {
  const db = await getDb();
  const [row] = await db.select().from(emailCodes).where(eq(emailCodes.key, key));
  return row && row.expiresAt > nowSec() ? row : null;
}

export async function countEmailCodeAttempt(key: string, attempts: number) {
  const db = await getDb();
  await db.update(emailCodes).set({ attempts }).where(eq(emailCodes.key, key));
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

/** 客户资源下发成功后累计本月用量 */
export async function incrementMonthlyLeadUsage(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id));
  if (!row) return null;
  await db.update(users).set({ monthlyLeadsUsed: Number(row.monthlyLeadsUsed ?? 0) + 1 }).where(eq(users.id, id));
  return row;
}

export async function createMembershipPayment(p: {
  companyId: number; companyName: string; tier: string; amountCny: number; paymentReference?: string; billingCycle?: string; periodMonths?: number;
}) {
  const db = await getDb();
  const [row] = await db.insert(membershipPayments).values({ ...p, status: 'pending', createdAt: now() }).returning();
  return row;
}

export async function listMembershipPayments(companyId?: number) {
  const db = await getDb();
  return companyId
    ? db.select().from(membershipPayments).where(eq(membershipPayments.companyId, companyId)).orderBy(asc(membershipPayments.id))
    : db.select().from(membershipPayments).orderBy(asc(membershipPayments.id));
}

export async function setMembershipPaymentStatus(id: number, status: 'paid' | 'rejected') {
  const db = await getDb();
  return db.transaction(async tx => {
    const [row] = await tx.update(membershipPayments).set({ status, paidAt: status === 'paid' ? now() : null })
      .where(and(eq(membershipPayments.id, id), eq(membershipPayments.status, 'pending'))).returning();
    if (!row) return null;
    if (status === 'paid') {
      const [company] = await tx.select().from(users).where(and(eq(users.id, row.companyId), eq(users.role, 'company')));
      if (!company) throw new Error('Company not found');
      const tier = getMembershipTier(row.tier);
      const expires = new Date(Math.max(Date.now(), Date.parse(company.membershipExpiresAt ?? '') || 0));
      const day = expires.getUTCDate();
      expires.setUTCDate(1);
      expires.setUTCMonth(expires.getUTCMonth() + Number(row.periodMonths ?? 12));
      const lastDay = new Date(Date.UTC(expires.getUTCFullYear(), expires.getUTCMonth() + 1, 0)).getUTCDate();
      expires.setUTCDate(Math.min(day, lastDay));
      await tx.update(users).set({ membershipTier: tier.id, membershipStatus: 'active',
        membershipExpiresAt: expires.toISOString(), monthlyLeadQuota: tier.monthlyLeadQuota,
        membershipPaidAmount: Number(company.membershipPaidAmount ?? 0) + row.amountCny,
        membershipStartedAt: company.membershipStartedAt || now(),
      }).where(eq(users.id, row.companyId));
    }
    return row;
  });
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
  const [row] = await db.insert(orders).values({ ...o, status: o.status ?? 'open', createdAt: ts, updatedAt: ts }).returning();
  return row;
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

// ---- Bids ----
export async function createBid(b: {
  orderId: number; companyId: number; companyName: string; amount: string; weeks: string; note?: string;
  estimatedCostCny?: number; profitCny?: number; platformCommissionCny?: number; netProfitCny?: number; commissionBasis?: string;
  bidRiskLevel?: string; bidRiskScore?: number; bidRiskReason?: string;
}) {
  const db = await getDb();
  const [row] = await db.insert(bids).values({ ...b, status: 'pending', createdAt: now() }).returning();
  return row;
}

export async function createCommissionSettlement(p: {
  orderId: number; bidId: number; companyId: number; companyName: string;
  revenueCny: number; estimatedCostCny: number; profitCny: number;
  platformCommissionCny: number; contractorNetProfitCny: number; commissionBasis?: string;
}) {
  const db = await getDb();
  const existing = await getCommissionSettlementByOrder(p.orderId);
  if (existing) return existing;
  const [row] = await db.insert(commissionSettlements).values({
    ...p, commissionRatePct: 10, status: 'pending', createdAt: now(),
  }).returning();
  return row;
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

export async function updateBid(id: number, status: string) {
  const db = await getDb();
  await db.update(bids).set({ status }).where(eq(bids.id, id));
}

/** 业主选定中标方：中标 bid → accepted，同订单其余 pending bid → rejected */
export async function settleBidsForOrder(orderId: number, acceptCompanyId: number) {
  const db = await getDb();
  await db.update(bids).set({ status: 'rejected' })
    .where(and(eq(bids.orderId, orderId), eq(bids.status, 'pending')));
  await db.update(bids).set({ status: 'accepted' })
    .where(and(eq(bids.orderId, orderId), eq(bids.companyId, acceptCompanyId)));
}

// ---- Contracts ----
export async function createContract(c: { orderId: number; content: string }) {
  const db = await getDb();
  const [row] = await db.insert(contracts).values({ ...c, homeownerSigned: 0, companySigned: 0, createdAt: now() }).returning();
  return row;
}

export async function getContractByOrder(orderId: number) {
  const db = await getDb();
  const [row] = await db.select().from(contracts).where(eq(contracts.orderId, orderId)).orderBy(asc(contracts.id)).limit(1);
  return row ?? null;
}

export async function signContract(id: number, signer: 'homeowner' | 'company') {
  const db = await getDb();
  const field = signer === 'homeowner' ? { homeownerSigned: 1 } : { companySigned: 1 };
  await db.update(contracts).set({ ...field, signedAt: now() }).where(eq(contracts.id, id));
}

// ---- 项目删除（级联清理：合同 → 投标 → 订单 → 任务 → 结果 → 项目 + 户型图文件） ----
export async function deleteProject(id: number) {
  const db = await getDb();
  const project = await getProject(id);
  if (!project) return false;
  const orderRows = await db.select({ id: orders.id }).from(orders).where(eq(orders.projectId, id));
  const orderIds = orderRows.map(o => o.id);
  if (orderIds.length > 0) {
    await db.delete(contracts).where(inArray(contracts.orderId, orderIds));
    await db.delete(bids).where(inArray(bids.orderId, orderIds));
  }
  await db.delete(orders).where(eq(orders.projectId, id));
  await db.delete(tasks).where(eq(tasks.projectId, id));
  await db.delete(results).where(eq(results.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
  // 上传的户型图文件一并清理（失败不影响删除结果）
  if (project.floorPlanPath) {
    try { fs.unlinkSync(project.floorPlanPath); } catch { /* ignore */ }
  }
  return true;
}
