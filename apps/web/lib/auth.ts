// 登录与权限：密码哈希（Node 内置 scrypt）+ 签名会话 Cookie + 各 API 的身份/归属校验。
// 服务端只相信 Cookie 里签名过的身份，不再相信页面传来的 homeownerId / companyId / role。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getOrder, getOrderByProject, getProject, getUser, listBidsByOrder } from '@i-renovation/shared';

export type Role = 'homeowner' | 'company' | 'boss';
export type Session = { uid: number; role: Role; exp: number };

const COOKIE = 'ireno_session';
const MAX_AGE_S = 7 * 24 * 3600;
export const MIN_PASSWORD = 8;

// ---------- 密码 ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** 校验密码。legacy=true 表示库里存的是旧版明文密码，校验通过后应升级为哈希。 */
export function checkPassword(password: string, stored: string | null | undefined): { ok: boolean; legacy: boolean } {
  if (!stored) return { ok: false, legacy: false };
  const parts = stored.split('$');
  if (parts.length === 3 && parts[0] === 'scrypt') {
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return { ok: crypto.timingSafeEqual(actual, expected), legacy: false };
  }
  return { ok: safeEqual(password, stored), legacy: true };
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- 老板账号（库里没有老板角色，账号放在 .env.local） ----------

/** 手机号是老板账号时返回 true/false 表示密码是否正确；不是老板账号返回 null。 */
export function checkBossLogin(phone: string, password: string): boolean | null {
  const bossPhone = process.env.BOSS_PHONE?.trim();
  const bossPassword = process.env.BOSS_PASSWORD ?? '';
  if (!bossPhone || phone !== bossPhone) return null;
  return bossPassword.length >= MIN_PASSWORD && safeEqual(password, bossPassword);
}

// ---------- 会话 Cookie ----------

let cachedSecret: string | null = null;

/**
 * 会话签名密钥：优先用环境变量 SESSION_SECRET（至少 32 个字符）。
 * 没配置也不能让所有人登录不了：第一次用到时随机生成一个，存进 apps/web/.session-secret（git 忽略），
 * 之后一直用它，重启不会让大家掉线。写不了文件（只读环境）就只在内存里用，重启后需要重新登录。
 * 正式上线仍应配置 SESSION_SECRET。
 */
function secret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.SESSION_SECRET ?? '';
  if (fromEnv.length >= 32) return (cachedSecret = fromEnv);
  const file = path.join(process.cwd(), '.session-secret');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return (cachedSecret = saved);
  } catch { /* 还没有 */ }
  const fresh = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(file, fresh, { mode: 0o600 });
  } catch { /* 写不了：只在内存里用 */ }
  console.warn('[auth] SESSION_SECRET 未配置，已自动生成并保存到 apps/web/.session-secret。正式上线请在环境变量里配置 SESSION_SECRET。');
  return (cachedSecret = fresh);
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** 用会话密钥做的带密钥摘要（存邮箱验证码、限额键时用，数据库泄露也反推不出验证码）。 */
export function keyedHash(text: string): string {
  return crypto.createHmac('sha256', secret()).update(`email-code\0${text}`).digest('hex');
}

export function setSessionCookie(res: NextResponse, uid: number, role: Role): void {
  const session: Session = { uid, role, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  res.cookies.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    // HTTP 部署时不要强制 Secure Cookie，否则浏览器不会保存登录状态；HTTPS 部署可设置 COOKIE_SECURE=true。
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production' && (process.env.PUBLIC_BASE_URL ?? '').startsWith('https://'),
    path: '/',
    maxAge: MAX_AGE_S,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export function readSession(req: Request): Session | null {
  const raw = req.headers.get('cookie')?.split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [payload, mac] = raw.split('.');
  if (!payload || !mac) return null;
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    if (!s || typeof s.uid !== 'number' || !['homeowner', 'company', 'boss'].includes(s.role)) return null;
    if (s.exp < Math.floor(Date.now() / 1000)) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * 需要登录（可限定角色）。返回会话，或可直接 return 的 401/403 响应。
 * 用法：const s = await requireSession(req, ['homeowner']); if (s instanceof NextResponse) return s;
 */
export async function requireSession(req: Request, roles?: Role[]): Promise<Session | NextResponse> {
  let s: Session | null;
  try {
    s = readSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!s) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  // 非老板账号：确认账号仍存在且角色未变
  if (s.role !== 'boss') {
    const user = await getUser(s.uid);
    if (!user || user.role !== s.role) return NextResponse.json({ error: '请重新登录' }, { status: 401 });
  }
  if (roles && !roles.includes(s.role)) return NextResponse.json({ error: '无权访问' }, { status: 403 });
  return s;
}

export const forbidden = () => NextResponse.json({ error: '无权访问' }, { status: 403 });

// ---------- 归属校验 ----------

type OrderRow = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/** 订单当事人：业主本人、中标/选定的公司；老板全部可见。 */
export function isOrderParty(s: Session, order: OrderRow): boolean {
  if (s.role === 'boss') return true;
  if (s.role === 'homeowner') return order.homeownerId === s.uid;
  return order.companyId === s.uid;
}

/** 公司可查看订单：公开招标中、已被选定、或本公司投过标。 */
export async function companyCanSeeOrder(s: Session, order: OrderRow): Promise<boolean> {
  if (s.role !== 'company') return false;
  if (order.status === 'open' || order.companyId === s.uid) return true;
  const bids = await listBidsByOrder(order.id);
  return bids.some(b => b.companyId === s.uid);
}

/** 查看项目：业主本人、老板；公司仅限已发布到接单市场且自己可见的项目。 */
export async function canViewProject(s: Session, projectId: number): Promise<boolean> {
  if (s.role === 'boss') return true;
  if (s.role === 'homeowner') {
    const p = await getProject(projectId);
    return !!p && p.homeownerId === s.uid;
  }
  const order = await getOrderByProject(projectId);
  return !!order && (await companyCanSeeOrder(s, order));
}

/** 修改项目（结果、重跑、删除）：业主本人或老板。 */
export async function canEditProject(s: Session, projectId: number): Promise<boolean> {
  if (s.role === 'boss') return true;
  if (s.role !== 'homeowner') return false;
  const p = await getProject(projectId);
  return !!p && p.homeownerId === s.uid;
}
