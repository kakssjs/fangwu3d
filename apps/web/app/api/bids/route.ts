import { NextResponse } from 'next/server';
import { createBid, listBidsByOrder, getOrder, listTasks, createTask } from '@i-renovation/shared';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      orderId?: number; companyId?: number; companyName?: string;
      amount?: string | number; weeks?: string | number; note?: string;
    };

    const orderId = Number(body.orderId);
    const companyId = Number(body.companyId);
    const companyName = (body.companyName ?? '').trim();
    const amount = body.amount !== undefined && body.amount !== null ? String(body.amount).trim() : '';
    const weeks = body.weeks !== undefined && body.weeks !== null ? String(body.weeks).trim() : '';

    if (!Number.isFinite(orderId)) return NextResponse.json({ error: '缺少有效的 orderId' }, { status: 400 });
    if (!Number.isFinite(companyId)) return NextResponse.json({ error: '缺少有效的 companyId' }, { status: 400 });
    if (!companyName) return NextResponse.json({ error: '缺少公司名称' }, { status: 400 });
    if (!amount) return NextResponse.json({ error: '缺少报价金额' }, { status: 400 });
    if (!weeks) return NextResponse.json({ error: '缺少工期' }, { status: 400 });

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
    const { searchParams } = new URL(req.url);
    const orderId = Number(searchParams.get('orderId'));
    if (!Number.isFinite(orderId)) {
      return NextResponse.json({ error: '缺少有效的 orderId 参数' }, { status: 400 });
    }
    return NextResponse.json(await listBidsByOrder(orderId));
  } catch {
    return NextResponse.json({ error: '查询报价失败' }, { status: 400 });
  }
}
