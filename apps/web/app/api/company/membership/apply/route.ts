import { NextResponse } from 'next/server';
import { createMembershipPayment, getUser, listMembershipPayments } from '@i-renovation/shared';
import { billingPeriodMonths, getMembershipTier, membershipFeeFor, type ContractorScale, type MembershipBillingCycle } from '@i-renovation/shared/membership';
import { requireSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['company']);
    if (s instanceof NextResponse) return s;
    const body = await req.json() as { tierId?: string; companyScale?: ContractorScale; paymentReference?: string; billingCycle?: MembershipBillingCycle };
    if (!['basic', 'professional', 'elite'].includes(body.tierId ?? '') ||
        !['monthly', 'quarterly', 'annual'].includes(body.billingCycle ?? 'annual') ||
        (body.paymentReference !== undefined && (typeof body.paymentReference !== 'string' || body.paymentReference.length > 200))) {
      return NextResponse.json({ error: '套餐、付款周期或凭证无效' }, { status: 400 });
    }
    const tier = getMembershipTier(body.tierId);
    const user = await getUser(s.uid);
    if (!user || user.role !== 'company') return NextResponse.json({ error: '公司账号不存在' }, { status: 404 });

    const isFirstYear = !user.membershipStartedAt && !Number(user.membershipPaidAmount ?? 0);
    const billingCycle = body.billingCycle ?? 'annual';
    const amountCny = membershipFeeFor(tier.id, isFirstYear, billingCycle);
    const payment = await createMembershipPayment({
      companyId: user.id,
      companyName: user.companyName ?? user.name,
      tier: tier.id,
      amountCny,
      billingCycle,
      periodMonths: billingPeriodMonths(billingCycle),
      paymentReference: body.paymentReference?.trim() || undefined,
    });
    return NextResponse.json({ ok: true, payment, tier, isFirstYear, amountCny, billingCycle });
  } catch {
    return NextResponse.json({ error: '会员申请失败' }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const s = await requireSession(req, ['company']);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await listMembershipPayments(s.uid));
}
