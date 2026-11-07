import { NextResponse } from 'next/server';
import { getUserByVerifiedEmail } from '@i-renovation/shared';
import { setSessionCookie, type Role } from '@/lib/auth';
import { consumeCode, emailEnabled, normalizeEmail } from '@/lib/email';

// 邮箱验证码登录。body: { email, code }。只能登录已经验证过这个邮箱的账号。
export async function POST(req: Request) {
  try {
    if (!emailEnabled()) return NextResponse.json({ error: '邮箱验证未开启' }, { status: 503 });
    const body = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown };
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: '请填写有效的邮箱' }, { status: 400 });
    const ok = await consumeCode(email, body.code, 'login');
    const user = ok ? await getUserByVerifiedEmail(email) : null;
    if (!user) return NextResponse.json({ error: '邮箱或验证码错误，或验证码已过期' }, { status: 401 });
    const res = NextResponse.json({ id: user.id, role: user.role, name: user.name, companyName: user.companyName ?? undefined });
    setSessionCookie(res, user.id, user.role as Role);
    return res;
  } catch (e) {
    console.error('email login error:', (e as Error).message);
    return NextResponse.json({ error: '登录失败' }, { status: 500 });
  }
}
