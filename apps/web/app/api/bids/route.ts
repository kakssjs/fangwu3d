import { NextResponse } from 'next/server';
import { createBid, listBidsByOrder, getOrder, getUser, getResult, listTasks, createTask, incrementMonthlyLeadUsage, ensureCurrentLeadPeriod } from '@i-renovation/shared';
import { canReceiveLead } from '@i-renovation/shared/membership';
import { calculateContractorCommission, wanToCny } from '@i-renovation/shared/commission';
import { evaluateBidRisk } from '@i-renovation/shared/fair-bidding';
import { companyCanSeeOrder, forbidden, isOrderParty, requireSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['company']); if (s instanceof NextResponse) return s;
    const body = (await req.json()) as {
      orderId?: number; companyName?: string;
      amount?: string | number; weeks?: string | number; note?: string; estimatedCost?: string | number;
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
    if (me?.membershipStatus !== 'active') {
      return NextResponse.json({ error: '请先开通入驻会员并完成入驻费支付' }, { status: 402 });
    }
    const leadPeriod = await ensureCurrentLeadPeriod(companyId);
    if (!canReceiveLead({ membershipStatus: me.membershipStatus, monthlyLeadQuota: me.monthlyLeadQuota, monthlyLeadsUsed: leadPeriod?.monthlyLeadsUsed ?? 0 })) {
      return NextResponse.json({ error: '本月客户资源已用完，请升级套餐或等待下月重置' }, { status: 402 });
    }

    // 只能给公开招标中的订单投标
    const target = await getOrder(orderId);
    if (!target) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    if (target.status !== 'open') return NextResponse.json({ error: '该订单已不接受投标' }, { status: 409 });
    const existingBids = await listBidsByOrder(orderId);
    if (existingBids.some(b => b.companyId === companyId)) {
      return NextResponse.json({ error: '同一装修队每个项目只能提交一份有效报价，请联系平台修改原报价' }, { status: 409 });
    }

    const commission = calculateContractorCommission({ amount, estimatedCost: body.estimatedCost, amountInWan: true });
    const quote = await getResult(target.projectId, 'quote');
    const platformQuoteCny = Number((quote?.content as { total?: number } | undefined)?.total ?? 0);
    const risk = evaluateBidRisk(wanToCny(amount), platformQuoteCny, commission.estimatedCostCny);
    if (!risk.acceptable) {
      return NextResponse.json({ error: risk.reason, risk, recommendedMinCny: risk.recommendedMinCny, recommendedMaxCny: risk.recommendedMaxCny }, { status: 422 });
    }
    const bid = await createBid({
      orderId,
      companyId,
      companyName,
      amount,
      weeks,
      note: body.note?.trim() || undefined,
      estimatedCostCny: commission.estimatedCostCny,
      profitCny: commission.profitCny,
      platformCommissionCny: commission.platformCommissionCny,
      netProfitCny: commission.contractorNetProfitCny,
      commissionBasis: commission.basis,
      bidRiskLevel: risk.level,
      bidRiskScore: risk.score,
      bidRiskReason: risk.reason,
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

    await incrementMonthlyLeadUsage, ensureCurrentLeadPeriod(companyId);
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
