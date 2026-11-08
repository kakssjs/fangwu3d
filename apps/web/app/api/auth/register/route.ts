import { NextResponse } from 'next/server';
import { createUser, getUserByPhone, getUserByVerifiedEmail } from '@i-renovation/shared';
import { MIN_PASSWORD, checkBossLogin, hashPassword, setSessionCookie } from '@/lib/auth';
import { consumeCode, emailEnabled, normalizeEmail } from '@/lib/email';
import { getMembershipTier, type ContractorScale, type MembershipBillingCycle } from '@i-renovation/shared/membership';

type RegisterBody = {
  role?: string;
  name?: string;
  phone?: string;
  email?: string;
  /** 注册方式：phone = 手机号 + 密码（默认）；email = 邮箱 + 验证码（需开启邮箱验证） */
  method?: string;
  /** 邮箱验证码（邮箱注册时必填） */
  emailCode?: string;
  password?: string;
  companyName?: string;
  license?: string;
  qualifications?: string[];
  districts?: string[];
  serviceTypes?: string[];
  specialties?: string[];
  companyScale?: string;
  membershipTier?: string;
  billingCycle?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterBody;
    if (body.role === 'company' && (
      (body.membershipTier !== undefined && body.membershipTier !== 'basic') ||
      (body.billingCycle !== undefined && body.billingCycle !== 'monthly')
    )) return NextResponse.json({ error: '套餐或付款周期无效' }, { status: 400 });
    const role = body.role;

    if (role !== 'homeowner' && role !== 'company') {
      return NextResponse.json({ error: 'role 必须为 homeowner 或 company' }, { status: 400 });
    }

    const name = (body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: '请填写姓名' }, { status: 400 });

    // 两种注册方式，二选一：手机号 + 密码，或邮箱 + 验证码。以后用哪种注册的，就用哪种登录。
    const method = body.method === 'email' ? 'email' : 'phone';
    let phone: string | undefined;
    let passwordHash: string | undefined;
    let emailFields: { email?: string; emailVerifiedAt?: string };

    if (method === 'phone') {
      phone = (body.phone ?? '').trim();
      const password = body.password ?? '';
      if (!phone) return NextResponse.json({ error: '请填写手机号' }, { status: 400 });
      if (password.length < MIN_PASSWORD) {
        return NextResponse.json({ error: `请设置至少 ${MIN_PASSWORD} 位的登录密码` }, { status: 400 });
      }
      // 老板账号的手机号不能被注册成普通账号
      if (checkBossLogin(phone, '') !== null) {
        return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 409 });
      }
      if (!/^\+?\d{6,20}$/.test(phone) || password.length > 128 || name.length > 120) return NextResponse.json({ error: '请检查手机号、姓名和密码长度' }, { status: 400 });
      passwordHash = hashPassword(password);
      // 防止重复注册：同一手机号只能注册一次
      const existing = await getUserByPhone(phone);
      // 旧版本创建的、从来没有设过密码的账号：允许用同一手机号和同一身份设置密码并登录，否则这些用户永远进不来。
      // 已经有密码的账号不能这样认领。（见 AUTH.md）
      if (existing) {
        return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 409 });
      }
      // 手机号注册时填的邮箱只是联系方式，没验证过，不能用来登录
      emailFields = { email: body.email?.trim() || undefined };
    } else {
      if (!emailEnabled()) return NextResponse.json({ error: '邮箱注册未开启，请用手机号注册' }, { status: 400 });
      const email = normalizeEmail(body.email);
      if (!email) return NextResponse.json({ error: '请填写有效的邮箱' }, { status: 400 });
      if (await getUserByVerifiedEmail(email)) {
        return NextResponse.json({ error: '该邮箱已注册，请直接用邮箱验证码登录' }, { status: 409 });
      }
      if (!(await consumeCode(email, body.emailCode, 'register'))) {
        return NextResponse.json({ error: '邮箱验证码错误或已过期，请重新获取' }, { status: 400 });
      }
      emailFields = { email, emailVerifiedAt: new Date().toISOString() };
    }

    if (role === 'homeowner') {
      const user = await createUser({
        role: 'homeowner',
        name,
        phone,
        ...emailFields,
        passwordHash,
      });
      const res = NextResponse.json({ id: user.id, role: user.role });
      setSessionCookie(res, user.id, 'homeowner');
      return res;
    }

    // role === 'company'
    const companyName = (body.companyName ?? '').trim();
    if (!companyName) return NextResponse.json({ error: '请填写公司名称' }, { status: 400 });

    const companyScale = (body.companyScale ?? 'small') as ContractorScale;
    const membershipTier = getMembershipTier('basic');
    const billingCycle = (body.billingCycle ?? 'monthly') as MembershipBillingCycle;
    const user = await createUser({
      role: 'company',
      name,
      phone,
      ...emailFields,
      passwordHash,
      companyName,
      license: body.license?.trim() || undefined,
      qualifications: body.qualifications,
      districts: body.districts,
      serviceTypes: body.serviceTypes,
      specialties: body.specialties,
      companyScale,
      membershipTier: 'basic',
      membershipStatus: 'pending_payment',
      monthlyLeadQuota: membershipTier.monthlyLeadQuota,
    });
    const res = NextResponse.json({
      id: user.id,
      role: user.role,
      membership: {
        tier: membershipTier.id,
        tierName: membershipTier.name,
        status: 'pending_payment',
        billingCycle,
        amountCny: 39,
      },
    });
    setSessionCookie(res, user.id, 'company');
    return res;
  } catch {
    return NextResponse.json({ error: '注册失败' }, { status: 400 });
  }
}
