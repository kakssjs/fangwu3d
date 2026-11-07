import { NextResponse } from 'next/server';
import { getOrder, updateOrder } from '@i-renovation/shared';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });

    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });

    const body = (await req.json()) as { signer?: string };
    const signer = body.signer;
    if (signer !== 'homeowner' && signer !== 'company') {
      return NextResponse.json({ error: "signer 必须为 'homeowner' 或 'company'" }, { status: 400 });
    }

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
