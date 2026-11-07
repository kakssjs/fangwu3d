// 数据层：PGlite（进程内 PostgreSQL，开发用）+ Drizzle ORM
// 生产切换阿里云 RDS：只改 createClient 一行（方案 §4.1）
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { pgTable, serial, text, integer, jsonb } from 'drizzle-orm/pg-core';
import { eq, asc, and, inArray } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';

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
  verified: integer('verified').notNull().default(0),
  createdAt: text('created_at').notNull(),
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
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
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
  verified integer NOT NULL DEFAULT 0, created_at text NOT NULL
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
  note text, status text NOT NULL DEFAULT 'pending', created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS contracts (
  id serial PRIMARY KEY, order_id integer NOT NULL, content text NOT NULL,
  homeowner_signed integer NOT NULL DEFAULT 0, company_signed integer NOT NULL DEFAULT 0,
  created_at text NOT NULL, signed_at text
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
}) {
  const db = await getDb();
  const [row] = await db.insert(users).values({ ...u, verified: 0, createdAt: now() }).returning();
  return row;
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
export async function createBid(b: { orderId: number; companyId: number; companyName: string; amount: string; weeks: string; note?: string }) {
  const db = await getDb();
  const [row] = await db.insert(bids).values({ ...b, status: 'pending', createdAt: now() }).returning();
  return row;
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
