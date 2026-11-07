import { NextResponse } from 'next/server';
import { getUserByVerifiedEmail } from '@i-renovation/shared';
import { EmailError, RESEND_AFTER_SEC, clientIp, emailEnabled, issueCode, normalizeEmail, type EmailPurpose } from '@/lib/email';

// 发送邮箱验证码。body: { email, purpose: 'register' | 'login' }
// 登录用途：邮箱没有对应账号时也回答成功（只占额度、不发信），免得被用来探测谁注册过。
export async function POST(req: Request) {
  try {
    if (!emailEnabled()) return NextResponse.json({ error: '邮箱验证未开启' }, { status: 503 });
    const body = (await req.json().catch(() => ({}))) as { email?: unknown; purpose?: unknown };
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: '请填写有效的邮箱' }, { status: 400 });
    if (body.purpose !== 'register' && body.purpose !== 'login') {
      return NextResponse.json({ error: 'purpose 必须为 register 或 login' }, { status: 400 });
    }
    const purpose = body.purpose as EmailPurpose;
    const send = purpose === 'register' || !!(await getUserByVerifiedEmail(email));
    await issueCode(email, purpose, clientIp(req), send);
    return NextResponse.json({ resendAfterSeconds: RESEND_AFTER_SEC });
  } catch (e) {
    if (e instanceof EmailError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('email code error:', (e as Error).message);
    return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 500 });
  }
}
