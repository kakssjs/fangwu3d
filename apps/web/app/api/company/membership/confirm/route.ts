import { NextResponse } from 'next/server';
import { getUser, setCompanyMembership, setMembershipPaymentStatus } from '@i-renovation/shared';
import { getMembershipTier } from '@i-renovation/shared/membership';
import { requireSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['boss']);
    if (s instanceof NextResponse) return s;
    const body = await req.json() as { paymentId?: number; action?: 'approve' | 'reject' };
    if (!Number.isFinite(body.paymentId) || !['approve', 'reject'].includes(body.action ?? '')) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    const updated = await setMembershipPaymentStatus(body.paymentId!, body.action === 'approve' ? 'paid' : 'rejected');
    if (!updated) return NextResponse.json({ error: '支付记录不存在' }, { status: 404 });
    if (body.action === 'approve') {
      const tier = getMembershipTier(updated.tier);
      const current = await getUser(updated.companyId);
      const base = current?.membershipExpiresAt && new Date(current.membershipExpiresAt) > new Date() ? new Date(current.membershipExpiresAt) : new Date();
      const expires = new Date(base);
      expires.setMonth(expires.getMonth() + Number(updated.periodMonths ?? 12));
      await setCompanyMembership(updated.companyId, {
        membershipTier: tier.id,
        membershipStatus: 'active',
        membershipExpiresAt: expires.toISOString(),
        monthlyLeadQuota: tier.monthlyLeadQuota,
        monthlyLeadsUsed: 0,
        membershipPaidAmount: updated.amountCny,
        membershipStartedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json({ ok: true, payment: updated });
  } catch {
    return NextResponse.json({ error: '会员确认失败' }, { status: 400 });
  }
}
