// 邮箱验证码：注册时验证邮箱、用邮箱验证码登录。
// 设计与 studio（3dgongfang/studio/src/api/auth/email.service.ts）一致：
// 6 位随机码、5 分钟有效、一次性、输错 5 次作废；只存 HMAC 摘要；发信额度持久化、先占额度再发信。
// 发信用 Nodemailer（MIT-0）走标准 SMTP，配置在 apps/web/.env.local，默认关闭。
import crypto from 'node:crypto';
import fs from 'node:fs';
import nodemailer, { type Transporter } from 'nodemailer';
import {
  consumeEmailCodeHash, deleteEmailCode, saveEmailCode, takeEmailQuota,
} from '@i-renovation/shared';
import { keyedHash } from './auth';

export type EmailPurpose = 'register' | 'login';

const CODE_TTL_SEC = 5 * 60;
export const RESEND_AFTER_SEC = 60;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** 统一成小写、去空格；格式不对返回 null。 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

interface MailSettings { enabled: boolean; host: string; port: number; secure: boolean; user: string; password: string; from: string; devOutbox?: string }

/**
 * 读发信设置。EMAIL_ENABLED=true 才开启。
 * EMAIL_DEV_OUTBOX（仅非生产环境）：不真发信，把邮件追加写进这个文件，用来本地测试。
 */
export function mailSettings(): MailSettings {
  const env = process.env;
  const devOutbox = env.NODE_ENV !== 'production' && env.EMAIL_DEV_OUTBOX ? env.EMAIL_DEV_OUTBOX : undefined;
  return {
    enabled: env.EMAIL_ENABLED === 'true',
    host: env.SMTP_HOST?.trim() ?? '',
    port: Number(env.SMTP_PORT || 465),
    secure: env.SMTP_SECURE !== 'false',
    user: env.SMTP_USER?.trim() ?? '',
    password: env.SMTP_PASSWORD ?? '',
    from: env.SMTP_FROM?.trim() || env.SMTP_USER?.trim() || '',
    devOutbox,
  };
}

/** 开着，并且发信设置齐全（或者在用本地测试发件箱）。 */
export function emailEnabled(): boolean {
  const m = mailSettings();
  return m.enabled && (!!m.devOutbox || (!!m.host && !!m.user && !!m.password && !!m.from));
}

let transport: Transporter | null = null;
let transportKey = '';

async function deliver(to: string, code: string, purpose: EmailPurpose): Promise<void> {
  const m = mailSettings();
  const what = purpose === 'register' ? '注册' : '登录';
  const subject = `I Renovation · ${what}验证码`;
  const text = `您的${what}验证码为 ${code}，5 分钟内有效。如非本人操作，请忽略此邮件。\nYour verification code is ${code}. It expires in 5 minutes.`;
  if (m.devOutbox) {
    fs.appendFileSync(m.devOutbox, JSON.stringify({ to, subject, code, purpose, at: new Date().toISOString() }) + '\n');
    return;
  }
  const key = `${m.host}|${m.port}|${m.secure}|${m.user}`;
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host: m.host, port: m.port, secure: m.secure, requireTLS: !m.secure,
      auth: { user: m.user, pass: m.password },
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 15_000,
    });
    transportKey = key;
  }
  const result = await transport.sendMail({ from: m.from, to, subject, text, disableFileAccess: true, disableUrlAccess: true });
  const accepted = (result.accepted ?? []).some((r: unknown) => String(typeof r === 'object' && r && 'address' in r ? (r as { address: string }).address : r).toLowerCase() === to);
  if (!accepted || (result.rejected ?? []).length) throw new Error('not accepted');
}

const codeKey = (email: string, purpose: EmailPurpose) => `${purpose}:${email}`;
const codeHash = (email: string, code: string, purpose: EmailPurpose) => keyedHash(`${purpose}\0${email}\0${code}`);

export class EmailError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * 发一个验证码。先占额度再发信：并发请求和超时重试也会消耗额度，不会重复轰炸邮箱。
 * 额度：同一邮箱 60 秒 1 封、24 小时 5 封；同一 IP 每小时 10 封；全站每天 200 封。
 * send=false 时只占额度、不真发（登录时邮箱没有对应账号：回答和真发一样，免得被用来探测谁注册过）。
 */
export async function issueCode(email: string, purpose: EmailPurpose, ip: string, send = true): Promise<void> {
  const e = keyedHash(`email:${email}`).slice(0, 32);
  const quotas: [string, number, number][] = [
    [`email:${e}:minute`, 60, 1],
    [`email:${e}:day`, 86_400, 5],
    [`ip:${keyedHash(`ip:${ip}`).slice(0, 32)}:hour`, 3_600, 10],
    ['site:day', 86_400, 200],
  ];
  for (const [key, period, limit] of quotas) {
    if (!(await takeEmailQuota(key, period, limit))) throw new EmailError('发送太频繁，请稍后再试', 429);
  }
  if (!send) return;
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  await saveEmailCode(codeKey(email, purpose), codeHash(email, code, purpose), CODE_TTL_SEC);
  try {
    await deliver(email, code, purpose);
  } catch {
    await deleteEmailCode(codeKey(email, purpose));
    throw new EmailError('验证码邮件发送失败，请稍后重试', 503);
  }
}

/** 核对并消费验证码：对了就作废（一次性），错了计次，5 次后作废。 */
export async function consumeCode(email: string, code: unknown, purpose: EmailPurpose): Promise<boolean> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return false;
  const key = codeKey(email, purpose);
  return consumeEmailCodeHash(key, codeHash(email, code.trim(), purpose));
}

/** 反向代理（nginx）后面取访客 IP，用于限额。 */
export function clientIp(req: Request): string {
  return req.headers.get('x-real-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}
