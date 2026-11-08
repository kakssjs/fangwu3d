import { companyCheckout } from '@/lib/company-payment';
import { NextResponse } from 'next/server';
import { listMembershipPayments } from '@i-renovation/shared';
import { type ContractorScale, type MembershipBillingCycle } from '@i-renovation/shared/membership';
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
    if (body.tierId !== 'basic' || body.billingCycle !== 'monthly') {
      return NextResponse.json({ error: '目前仅开放企业基础会员：39 元/月' }, { status: 400 });
    }
    return NextResponse.json(await companyCheckout(s.uid));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '会员申请失败' }, { status: 503 });
  }
}

export async function GET(req: Request) {
  const s = await requireSession(req, ['company']);
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await listMembershipPayments(s.uid));
}
