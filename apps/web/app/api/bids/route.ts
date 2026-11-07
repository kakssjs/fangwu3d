import { NextResponse } from 'next/server';
import { createBid, listBidsByOrder, getOrder, getUser, listTasks, createTask } from '@i-renovation/shared';
import { companyCanSeeOrder, forbidden, isOrderParty, requireSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['company']); if (s instanceof NextResponse) return s;
    const body = (await req.json()) as {
      orderId?: number; companyName?: string;
      amount?: string | number; weeks?: string | number; note?: string;
    };

    const orderId = Number(body.orderId);
    // 投标公司 = 登录的公司账号；公司名取账号资料，不信页面传来的
    const companyId = s.uid;
    const me = await getUser(s.uid);
    const companyName = (me?.companyName ?? me?.name ?? '').trim();
    const amount = body.amount !== undefined && body.amount !== null ? String(body.amount).trim() : '';
    const weeks = body.weeks !== undefined && body.weeks !== null ? String(body.weeks).trim() : '';

    if (!Number.isFinite(orderId)) return NextResponse.json({ error: '缺少有效的 orderId' }, { status: 400 });
    if (!companyName) return NextResponse.json({ error: '缺少公司名称' }, { status: 400 });
    if (!amount) return NextResponse.json({ error: '缺少报价金额' }, { status: 400 });
    if (!weeks) return NextResponse.json({ error: '缺少工期' }, { status: 400 });

    // 只能给公开招标中的订单投标
    const target = await getOrder(orderId);
    if (!target) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    if (target.status !== 'open') return NextResponse.json({ error: '该订单已不接受投标' }, { status: 409 });

    const bid = await createBid({
      orderId,
      companyId,
      companyName,
      amount,
      weeks,
      note: body.note?.trim() || undefined,
    });

    // —— 装修公司发布数据（投标）到达 → 触发匹配智能体（等真实投标数据后才匹配） ——
    // 同一项目已有待执行/执行中的匹配任务时不重复建；旧匹配已完成后新投标到达 → 重新匹配
    try {
      const order = await getOrder(orderId);
      if (order) {
        const tasks = await listTasks(order.projectId);
        const active = tasks.some(t => t.toAgent === 'matcher' && (t.status === 'pending' || t.status === 'running'));
        if (!active) {
          await createTask(order.projectId, 'orchestrator', 'matcher', {
            projectId: order.projectId,
            orderId,
            reason: `收到 ${companyName} 投标（¥${amount} · ${weeks} 周），匹配智能体基于真实投标数据开始匹配`,
          });
        }
      }
    } catch (e) {
      console.warn('[bids] 触发匹配任务失败：', (e as Error).message);
    }

    return NextResponse.json(bid);
  } catch {
    return NextResponse.json({ error: '提交报价失败' }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const s = await requireSession(req); if (s instanceof NextResponse) return s;
    const { searchParams } = new URL(req.url);
    const orderId = Number(searchParams.get('orderId'));
    if (!Number.isFinite(orderId)) {
      return NextResponse.json({ error: '缺少有效的 orderId 参数' }, { status: 400 });
    }
    const order = await getOrder(orderId);
    if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    const bids = await listBidsByOrder(orderId);
    // 业主和老板看全部报价；公司只能看自己的，看不到竞争对手的报价
    if (s.role === 'company') return NextResponse.json(bids.filter(b => b.companyId === s.uid));
    if (!isOrderParty(s, order)) return forbidden();
    return NextResponse.json(bids);
  } catch {
    return NextResponse.json({ error: '查询报价失败' }, { status: 400 });
  }
}
