import { NextResponse } from 'next/server';
import { setMembershipPaymentStatus } from '@i-renovation/shared';
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
    if (!updated) return NextResponse.json({ error: '支付记录不存在或已处理' }, { status: 409 });
    return NextResponse.json({ ok: true, payment: updated });
  } catch {
    return NextResponse.json({ error: '会员确认失败' }, { status: 400 });
  }
}
