import { NextResponse } from 'next/server';
import { getOrder, updateOrder } from '@i-renovation/shared';
import { companyCanSeeOrder, forbidden, isOrderParty, requireSession } from '@/lib/auth';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req, ['homeowner', 'company']); if (s instanceof NextResponse) return s;
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });

    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });

    // 确认方由登录身份决定，且必须是这个订单的当事人
    if (!isOrderParty(s, order)) return forbidden();
    const signer = s.role as 'homeowner' | 'company';

    const ts = new Date().toISOString();
    const patch: Parameters<typeof updateOrder>[1] = {};

    if (signer === 'homeowner') {
      patch.homeownerConfirmedAt = ts;
    } else {
      patch.companyConfirmedAt = ts;
    }

    const homeownerConfirmedAt = signer === 'homeowner' ? ts : (order.homeownerConfirmedAt ?? null);
    const companyConfirmedAt = signer === 'company' ? ts : (order.companyConfirmedAt ?? null);

    if (homeownerConfirmedAt && companyConfirmedAt) {
      patch.confirmedAt = ts;
      patch.status = 'confirmed';
    } else {
      patch.status = `${signer}_confirmed`;
    }

    await updateOrder(id, patch);
    const updated = await getOrder(id);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: '确认失败' }, { status: 400 });
  }
}
