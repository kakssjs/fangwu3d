import { NextResponse } from 'next/server';
import { createMembershipPayment, getUser, setCompanyMembership } from '@i-renovation/shared';
import { getMembershipTier, membershipFeeFor, type ContractorScale } from '@i-renovation/shared/membership';
import { requireSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['company']);
    if (s instanceof NextResponse) return s;
    const body = await req.json() as { tierId?: string; companyScale?: ContractorScale; paymentReference?: string };
    const tier = getMembershipTier(body.tierId);
    const user = await getUser(s.uid);
    if (!user || user.role !== 'company') return NextResponse.json({ error: '公司账号不存在' }, { status: 404 });

    const isFirstYear = !user.membershipStartedAt && !Number(user.membershipPaidAmount ?? 0);
    const amountCny = membershipFeeFor(tier.id, isFirstYear);
    const payment = await createMembershipPayment({
      companyId: user.id,
      companyName: user.companyName ?? user.name,
      tier: tier.id,
      amountCny,
      paymentReference: body.paymentReference?.trim() || undefined,
    });
    await setCompanyMembership(user.id, {
      companyScale: body.companyScale ?? user.companyScale ?? 'small',
      membershipTier: tier.id,
      membershipStatus: 'pending_payment',
      monthlyLeadQuota: tier.monthlyLeadQuota,
      monthlyLeadsUsed: 0,
      membershipPaidAmount: 0,
    });
    return NextResponse.json({ ok: true, payment, tier, isFirstYear, amountCny });
  } catch {
    return NextResponse.json({ error: '会员申请失败' }, { status: 400 });
  }
}
