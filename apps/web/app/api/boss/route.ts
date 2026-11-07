import { NextResponse } from 'next/server';
import {
  getDb, projects, tasks, results, listAllProjects, listAllTasks, listAllOrders, listCompanies, EXCEPTION_RULES,
} from '@i-renovation/shared';
import { requireSession } from '@/lib/auth';

// 老板控制台数据聚合：任务记录 + 成本看板 + 审批队列 + 订单（第一单）
export async function GET(req: Request) {
  try {
    const s = await requireSession(req, ['boss']); if (s instanceof NextResponse) return s;
    const [projectRows, taskRows, orderRows, companies] = await Promise.all([
      listAllProjects(), listAllTasks(), listAllOrders(), listCompanies(),
    ]);
    const db = await getDb();
    const resultRows = await db.select().from(results);

    const nameOf = new Map(projectRows.map(p => [p.id, p.name]));

    // 任务记录（带项目名）
    const taskRecords = taskRows.map(t => ({
      id: t.id,
      projectId: t.projectId,
      projectName: nameOf.get(t.projectId) ?? `PRJ_${t.projectId}`,
      fromAgent: t.fromAgent,
      toAgent: t.toAgent,
      status: t.status,
      retry: t.retry,
      tokensCost: t.tokensCost,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    // 成本看板：Token 按 Agent 汇总 + 图像生成次数
    const byAgent = new Map<string, { tokens: number; count: number; failed: number }>();
    for (const t of taskRows) {
      const e = byAgent.get(t.toAgent) ?? { tokens: 0, count: 0, failed: 0 };
      e.tokens += t.tokensCost;
      e.count += 1;
      if (t.status === 'failed') e.failed += 1;
      byAgent.set(t.toAgent, e);
    }
    let imageCount = 0;
    for (const r of resultRows) {
      if (r.kind === 'decorations') {
        const imgs = (r.content as { images?: unknown[] })?.images;
        if (Array.isArray(imgs)) imageCount += imgs.length;
      }
    }
    const totalTokens = taskRows.reduce((s, t) => s + t.tokensCost, 0);

    // 审批队列（派生）：★ 红线动作必须老板人工确认
    const approvals: {
      id: string; type: string; level: '高' | '中' | '低'; subject: string; detail: string; action: string;
    }[] = [];
    // 异常升级（EXCEPTION_RULES action=escalate_boss）：带规则名与细节
    for (const t of taskRows.filter(x => x.status === 'escalated')) {
      const exc = (t.output as { exception?: { ruleName?: string; detail?: string } } | null)?.exception;
      approvals.push({
        id: `task_${t.id}`, type: `异常升级 · ${exc?.ruleName ?? EXCEPTION_RULES.qa_fallback_exhausted.name}`, level: '高',
        subject: `${nameOf.get(t.projectId) ?? t.projectId} · ${t.toAgent}`,
        detail: `任务 #${t.id} 触发「${exc?.ruleName ?? '异常'}」：${exc?.detail ?? '未知异常'}；按 EXCEPTION_RULES 升级老板裁决`,
        action: '裁决：重跑 / 降级交付 / 通知业主',
      });
    }
    // 等待用户补充（action=reask_user）：业主侧横幅已提示，老板可关注
    for (const t of taskRows.filter(x => x.status === 'waiting_user')) {
      const out = t.output as { exception?: { ruleName?: string; detail?: string }; ask?: string } | null;
      approvals.push({
        id: `wait_${t.id}`, type: `等待用户补充 · ${out?.exception?.ruleName ?? '信息不足'}`, level: '中',
        subject: `${nameOf.get(t.projectId) ?? t.projectId} · ${t.toAgent}`,
        detail: `任务 #${t.id}：${out?.exception?.detail ?? ''}${out?.ask ? ` → ${out.ask}` : ''}`,
        action: '关注进度 / 协助联系业主',
      });
    }
    for (const t of taskRows.filter(x => x.status === 'failed')) {
      approvals.push({
        id: `task_${t.id}`, type: '异常升级', level: '高',
        subject: `${nameOf.get(t.projectId) ?? t.projectId} · ${t.toAgent}`,
        detail: `任务 #${t.id} 重试 ${t.retry} 次后失败，按 EXCEPTION_RULES 升级老板裁决`,
        action: '裁决：重跑 / 降级交付 / 通知业主',
      });
    }
    for (const c of companies.filter(x => x.verified === 0)) {
      approvals.push({
        id: `user_${c.id}`, type: '装修队资质审核', level: '中',
        subject: c.name + (c.companyName ? `（${c.companyName}）` : ''),
        detail: `资质材料待人工审核 · 执照号 ${c.license ?? '未提供'}（★ Agent 不得代为认证）`,
        action: '通过 / 驳回',
      });
    }
    for (const o of orderRows.filter(x => ['open', 'matched', 'homeowner_confirmed', 'company_confirmed'].includes(x.status))) {
      approvals.push({
        id: `order_${o.id}`, type: '订单跟进（第一单）', level: '低',
        subject: `${nameOf.get(o.projectId) ?? o.projectId} · ORDER_${o.id}`,
        detail: `状态 ${o.status}${o.bidAmount ? ` · 报价 ¥${o.bidAmount}` : ''}${o.bidWeeks ? ` · 工期 ${o.bidWeeks} 周` : ''}`,
        action: '跟进确认 / 督促双方',
      });
    }

    return NextResponse.json({
      projects: projectRows.map(p => ({
        id: p.id, name: p.name, style: p.style, budget: p.budget, area: p.area,
        stage: p.stage, createdAt: p.createdAt,
      })),
      tasks: taskRecords,
      costs: {
        totalTokens,
        taskCount: taskRows.length,
        doneCount: taskRows.filter(t => t.status === 'done').length,
        failedCount: taskRows.filter(t => t.status === 'failed').length,
        imageCount,
        byAgent: [...byAgent.entries()].map(([agent, v]) => ({ agent, ...v })),
      },
      orders: orderRows.map(o => ({
        id: o.id, projectId: o.projectId, projectName: nameOf.get(o.projectId) ?? `PRJ_${o.projectId}`,
        status: o.status, bidAmount: o.bidAmount, bidWeeks: o.bidWeeks,
        matchScore: o.matchScore, createdAt: o.createdAt, contractedAt: o.contractedAt,
      })),
      approvals,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
