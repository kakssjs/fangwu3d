import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['boss']);
    if (s instanceof NextResponse) return s;
    const body = await req.json() as { paymentId?: number; action?: 'approve' | 'reject' };
    if (!Number.isFinite(body.paymentId) || !['approve', 'reject'].includes(body.action ?? '')) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    return NextResponse.json({ error: '请由装修队刷新支付宝权益，线上会员不可人工确认开通' }, { status: 409 });
  } catch {
    return NextResponse.json({ error: '会员确认失败' }, { status: 400 });
  }
}
