import { NextResponse } from 'next/server';
import { createUser, getUserByPhone } from '@i-renovation/shared';
import { MIN_PASSWORD, checkBossLogin, hashPassword, setSessionCookie } from '@/lib/auth';
import { getMembershipTier, recommendedTierForScale, type ContractorScale } from '@i-renovation/shared/membership';

type RegisterBody = {
  role?: string;
  name?: string;
  phone?: string;
  email?: string;
  password?: string;
  companyName?: string;
  license?: string;
  qualifications?: string[];
  districts?: string[];
  serviceTypes?: string[];
  specialties?: string[];
  companyScale?: string;
  membershipTier?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterBody;
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
    if (existing) {
      return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 409 });
    }

    if (role === 'homeowner') {
      const user = await createUser({
        role: 'homeowner',
        name,
        phone,
        email,
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
    const user = await createUser({
      role: 'company',
      name,
      phone,
      email,
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
    const res = NextResponse.json({
      id: user.id,
      role: user.role,
      membership: {
        tier: membershipTier.id,
        tierName: membershipTier.name,
        firstYearFeeCny: membershipTier.firstYearFeeCny,
        annualFeeCny: membershipTier.annualFeeCny,
        status: 'pending_payment',
      },
    });
    setSessionCookie(res, user.id, 'company');
    return res;
  } catch {
    return NextResponse.json({ error: '注册失败' }, { status: 400 });
  }
}
