import { NextResponse } from 'next/server';
import { getOrder, updateOrder, settleBidsForOrder } from '@i-renovation/shared';
import { companyCanSeeOrder, forbidden, isOrderParty, requireSession } from '@/lib/auth';

type OrderPatch = {
  companyId?: number;
  status?: string;
  bidAmount?: string;
  bidWeeks?: string;
  bidNote?: string;
  matchScore?: string;
  homeownerConfirmedAt?: string;
  companyConfirmedAt?: string;
  confirmedAt?: string;
  contractedAt?: string;
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req); if (s instanceof NextResponse) return s;
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });

    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    if (!isOrderParty(s, order) && !(await companyCanSeeOrder(s, order))) return forbidden();
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: '查询订单失败' }, { status: 400 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req, ['homeowner', 'boss']); if (s instanceof NextResponse) return s;
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });

    const existing = await getOrder(id);
    if (!existing) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    if (!isOrderParty(s, existing)) return forbidden();

    const body = (await req.json()) as OrderPatch;
    const patch: OrderPatch = {};
    if (body.companyId !== undefined) patch.companyId = Number(body.companyId);
    if (body.status !== undefined) patch.status = String(body.status);
    if (body.bidAmount !== undefined) patch.bidAmount = String(body.bidAmount);
    if (body.bidWeeks !== undefined) patch.bidWeeks = String(body.bidWeeks);
    if (body.bidNote !== undefined) patch.bidNote = String(body.bidNote);
    if (body.matchScore !== undefined) patch.matchScore = String(body.matchScore);
    if (body.homeownerConfirmedAt !== undefined) patch.homeownerConfirmedAt = String(body.homeownerConfirmedAt);
    if (body.companyConfirmedAt !== undefined) patch.companyConfirmedAt = String(body.companyConfirmedAt);
    if (body.confirmedAt !== undefined) patch.confirmedAt = String(body.confirmedAt);
    if (body.contractedAt !== undefined) patch.contractedAt = String(body.contractedAt);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
    }

    await updateOrder(id, patch);
    // 业主选定中标方（status=matched + companyId）→ 同步应标状态
    if (patch.status === 'matched' && patch.companyId !== undefined) {
      await settleBidsForOrder(id, patch.companyId);
    }
    const updated = await getOrder(id);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: '更新订单失败' }, { status: 400 });
  }
}
