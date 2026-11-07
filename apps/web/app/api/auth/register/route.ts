import { NextResponse } from 'next/server';
import { createMembershipPayment, createUser, getUserByPhone, getUserByVerifiedEmail, setUserPasswordHash, setUserVerifiedEmail } from '@i-renovation/shared';
import { MIN_PASSWORD, checkBossLogin, hashPassword, setSessionCookie } from '@/lib/auth';
import { consumeCode, emailEnabled, normalizeEmail } from '@/lib/email';
import { billingPeriodMonths, getMembershipTier, membershipFeeFor, recommendedTierForScale, type ContractorScale, type MembershipBillingCycle } from '@i-renovation/shared/membership';

type RegisterBody = {
  role?: string;
  name?: string;
  phone?: string;
  email?: string;
  /** 邮箱验证码（开启邮箱验证时必填） */
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
      (body.membershipTier !== undefined && !['basic', 'professional', 'elite'].includes(body.membershipTier)) ||
      (body.billingCycle !== undefined && !['monthly', 'quarterly', 'annual'].includes(body.billingCycle))
    )) return NextResponse.json({ error: '套餐或付款周期无效' }, { status: 400 });
    const role = body.role;

    if (role !== 'homeowner' && role !== 'company') {
      return NextResponse.json({ error: 'role 必须为 homeowner 或 company' }, { status: 400 });
    }

    const name = (body.name ?? '').trim();
    const phone = (body.phone ?? '').trim();
    const email = body.email?.trim() || undefined;
    const password = body.password ?? '';

    if (!name) return NextResponse.json({ error: '请填写姓名' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: '请填写手机号' }, { status: 400 });
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json({ error: `请设置至少 ${MIN_PASSWORD} 位的登录密码` }, { status: 400 });
    }
    // 老板账号的手机号不能被注册成普通账号
    if (checkBossLogin(phone, '') !== null) {
      return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 409 });
    }
    const passwordHash = hashPassword(password);

    // 防止重复注册：同一手机号只能注册一次
    const existing = await getUserByPhone(phone);
    // 旧版本创建的、从来没有设过密码的账号：允许用同一手机号和同一身份设置密码并登录，否则这些用户永远进不来。
    // 已经有密码的账号不能这样认领。（见 AUTH.md）
    const claimable = !!existing && !existing.passwordHash && existing.role === role;
    if (existing && !claimable) {
      return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 409 });
    }

    // 开启邮箱验证后：注册必须用验证码确认邮箱。放在手机号检查之后，手机号重复时不会白白用掉验证码
    let verifiedEmail: string | undefined;
    if (emailEnabled()) {
      const normalized = normalizeEmail(body.email);
      if (!normalized) return NextResponse.json({ error: '请填写有效的邮箱' }, { status: 400 });
      const owner = await getUserByVerifiedEmail(normalized);
      if (owner && owner.id !== existing?.id) {
        return NextResponse.json({ error: '该邮箱已注册，请直接用邮箱验证码登录' }, { status: 409 });
      }
      if (!(await consumeCode(normalized, body.emailCode, 'register'))) {
        return NextResponse.json({ error: '邮箱验证码错误或已过期，请重新获取' }, { status: 400 });
      }
      verifiedEmail = normalized;
    }

    if (existing && claimable) {
      await setUserPasswordHash(existing.id, passwordHash);
      if (verifiedEmail) await setUserVerifiedEmail(existing.id, verifiedEmail);
      const res = NextResponse.json({ id: existing.id, role: existing.role, claimed: true });
      setSessionCookie(res, existing.id, role);
      return res;
    }
    const emailFields = verifiedEmail
      ? { email: verifiedEmail, emailVerifiedAt: new Date().toISOString() }
      : { email };

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
    const membershipTier = getMembershipTier(body.membershipTier ?? recommendedTierForScale(companyScale).id);
    const billingCycle = (body.billingCycle ?? 'annual') as MembershipBillingCycle;
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
      membershipTier: membershipTier.id,
      membershipStatus: 'pending_payment',
      monthlyLeadQuota: membershipTier.monthlyLeadQuota,
    });
    await createMembershipPayment({
      companyId: user.id,
      companyName: user.companyName ?? user.name,
      tier: membershipTier.id,
      billingCycle,
      periodMonths: billingPeriodMonths(billingCycle),
      amountCny: membershipFeeFor(membershipTier.id, true, billingCycle),
    });
    const res = NextResponse.json({
      id: user.id,
      role: user.role,
      membership: {
        tier: membershipTier.id,
        tierName: membershipTier.name,
        firstYearFeeCny: membershipTier.firstYearFeeCny,
        annualFeeCny: membershipTier.annualFeeCny,
        status: 'pending_payment',
        billingCycle,
        amountCny: membershipFeeFor(membershipTier.id, true, billingCycle),
      },
    });
    setSessionCookie(res, user.id, 'company');
    return res;
  } catch {
    return NextResponse.json({ error: '注册失败' }, { status: 400 });
  }
}
