'use client';
import { useEffect, useState } from 'react';

interface TaskRecord {
  id: number; projectId: number; projectName: string;
  fromAgent: string; toAgent: string; status: string;
  retry: number; tokensCost: number; createdAt: string; updatedAt: string;
}
interface Approval {
  id: string; type: string; level: '高' | '中' | '低'; subject: string; detail: string; action: string;
}
interface OrderRecord {
  id: number; projectId: number; projectName: string; status: string;
  bidAmount: string | null; bidWeeks: string | null; matchScore: string | null;
  createdAt: string; contractedAt: string | null;
}
interface CommissionSettlement {
  id: number; orderId: number; bidId: number; companyId: number; companyName: string;
  revenueCny: number; estimatedCostCny: number; profitCny: number; commissionRatePct: number;
  platformCommissionCny: number; contractorNetProfitCny: number; status: string; createdAt: string; settledAt?: string | null;
}
interface MembershipPayment {
  id: number; companyId: number; companyName: string; tier: string; amountCny: number;
  status: string; paymentReference?: string | null; createdAt: string; paidAt?: string | null;
}
interface BossData {
  projects: { id: number; name: string; style: string; budget: string; area: string | null; stage: number; createdAt: string }[];
  tasks: TaskRecord[];
  costs: {
    totalTokens: number; taskCount: number; doneCount: number; failedCount: number; imageCount: number;
    byAgent: { agent: string; tokens: number; count: number; failed: number }[];
  };
  orders: OrderRecord[];
  approvals: Approval[];
  membershipPayments?: MembershipPayment[];
  commissionSettlements?: CommissionSettlement[];
}

const AGENT_LABEL: Record<string, string> = {
  floor_plan: '户型识别', designer: '二维设计', render: '3D渲染', quote: '报价工期',
  matcher: '装修队匹配', growth: '增长获客', consultant: '顾问客服', qa: '质检', orchestrator: '调度器',
};

function statusTag(status: string) {
  const map: Record<string, { text: string; cls: string }> = {
    done: { text: '已完成', cls: 'tag tag-green' },
    running: { text: '执行中', cls: 'tag tag-cyan' },
    pending: { text: '排队中', cls: 'tag tag-purple' },
    failed: { text: '失败', cls: 'tag tag-orange' },
    escalated: { text: '已升级', cls: 'tag tag-orange' },
    waiting_user: { text: '待用户补充', cls: 'tag tag-orange' },
    open: { text: '开放竞标', cls: 'tag tag-cyan' },
    matched: { text: '已选定', cls: 'tag tag-purple' },
    confirmed: { text: '双方确认', cls: 'tag tag-green' },
    contracted: { text: '已签约', cls: 'tag tag-green' },
    homeowner_confirmed: { text: '业主已确认', cls: 'tag tag-orange' },
    company_confirmed: { text: '公司已确认', cls: 'tag tag-orange' },
  };
  const m = map[status];
  return <span className={m ? m.cls : 'tag tag-cyan'}>{m ? m.text : status}</span>;
}

function levelTag(level: string) {
  if (level === '高') return <span className="tag tag-orange">高</span>;
  if (level === '中') return <span className="tag tag-cyan">中</span>;
  return <span className="tag tag-green">低</span>;
}

export default function BossConsole() {
  const [tab, setTab] = useState<'approvals' | 'tasks' | 'costs' | 'orders' | 'membership' | 'commissions'>('approvals');
  const [membershipBusy, setMembershipBusy] = useState<number | null>(null);
  const [data, setData] = useState<BossData | null>(null);
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = () => fetch('/api/boss').then(async r => {
      // 未登录或不是老板账号：停止轮询，显示提示
      if (r.status === 401 || r.status === 403) { setDenied(true); clearInterval(timer); return; }
      setData(await r.json());
    }).catch(() => {});
    load();
    timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  async function settleCommission(settlementId: number, action: 'settle' | 'cancel') {
    setMembershipBusy(settlementId);
    try {
      await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlementId, action }),
      });
      const res = await fetch('/api/boss');
      if (res.ok) setData(await res.json());
    } finally {
      setMembershipBusy(null);
    }
  }

  async function confirmMembership(paymentId: number, action: 'approve' | 'reject') {
    setMembershipBusy(paymentId);
    try {
      await fetch('/api/company/membership/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, action }),
      });
      const res = await fetch('/api/boss');
      if (res.ok) setData(await res.json());
    } finally {
      setMembershipBusy(null);
    }
  }

  const costs = data?.costs;
  const maxTokens = Math.max(1, ...(costs?.byAgent.map(a => a.tokens) ?? [1]));
  const agents = [...new Set((data?.tasks ?? []).map(t => t.toAgent))];
  const visibleTasks = (data?.tasks ?? [])
    .filter(t => filterAgent === 'all' || t.toAgent === filterAgent)
    .slice()
    .reverse();

  if (denied) {
    return (
      <main className="container" style={{ paddingTop: 32 }}>
        <div className="panel" style={{ maxWidth: 520, margin: '48px auto', textAlign: 'center' }}>
          <div className="panel-title"><div className="accent-bar" />仅限老板账号</div>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '18px 0 22px' }}>
            请用老板账号登录后查看控制台。
          </p>
          <a href="/" className="btn btn-primary">返回首页登录</a>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ paddingTop: 32 }}>
      <div className="section-label" style={{ marginTop: 0 }}>
        <h2>老板控制台 · 决策中心</h2>
        <div className="line" />
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          BOSS CONSOLE · LIVE
        </span>
      </div>

      <div className="stats-row" style={{ marginTop: 20, marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">待审批</div>
          <div className="value orange">{data?.approvals.length ?? '-'}</div>
        </div>
        <div className="stat-card">
          <div className="label">活跃项目</div>
          <div className="value cyan">{data?.projects.length ?? '-'}</div>
        </div>
        <div className="stat-card">
          <div className="label">Token 消耗</div>
          <div className="value purple">{(costs?.totalTokens ?? 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">图像生成</div>
          <div className="value green">{costs?.imageCount ?? '-'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {([
          { key: 'approvals', label: '审批队列' },
          { key: 'tasks', label: '任务记录' },
          { key: 'costs', label: '成本看板' },
          { key: 'orders', label: '订单（第一单）' },
          { key: 'membership', label: '入驻费 / 会员' },
          { key: 'commissions', label: '利润分成' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={tab === t.key ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- 审批队列 ---------- */}
      {tab === 'approvals' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 16 }}>
            ★ 红线：Agent 不碰钱、不签合同、不认证资质、不承诺安全 —— 以下决策必须由老板人工确认
          </p>
          {(data?.approvals ?? []).length === 0 && (
            <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              暂无待审批事项 — 所有 Agent 任务正常流转
            </div>
          )}
          {(data?.approvals ?? []).map(item => (
            <div key={item.id} className="timeline-item">
              <div className="timeline-dot" />
              <div className="timeline-body" style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className="tag tag-purple">{item.type}</span>
                  <strong style={{ fontSize: 14 }}>{item.subject}</strong>
                  {levelTag(item.level)}
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 10 }}>{item.detail}</p>
                {decisions[item.id] ? (
                  <span className={decisions[item.id] === 'approved' ? 'tag tag-green' : 'tag tag-orange'}>
                    {decisions[item.id] === 'approved' ? '已通过' : '已驳回'}
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 14px' }}
                      onClick={() => setDecisions(p => ({ ...p, [item.id]: 'approved' }))}>通过</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 14px' }}
                      onClick={() => setDecisions(p => ({ ...p, [item.id]: 'rejected' }))}>驳回</button>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 6 }}>{item.action}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------- 任务记录 ---------- */}
      {tab === 'tasks' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Agent：</span>
            <button onClick={() => setFilterAgent('all')}
              className={`btn ${filterAgent === 'all' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '3px 10px' }}>全部</button>
            {agents.map(a => (
              <button key={a} onClick={() => setFilterAgent(a)}
                className={`btn ${filterAgent === a ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '3px 10px' }}>
                {AGENT_LABEL[a] ?? a}
              </button>
            ))}
          </div>
          <div className="panel">
            <table className="data-table">
              <thead>
                <tr><th>Task</th><th>项目</th><th>交接</th><th>状态</th><th>重试</th><th>Tokens</th><th>时间</th></tr>
              </thead>
              <tbody>
                {visibleTasks.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>#{t.id}</td>
                    <td>{t.projectName}</td>
                    <td style={{ fontSize: 12 }}>
                      {AGENT_LABEL[t.fromAgent] ?? t.fromAgent} → {AGENT_LABEL[t.toAgent] ?? t.toAgent}
                    </td>
                    <td>{statusTag(t.status)}</td>
                    <td>{t.retry}</td>
                    <td>{t.tokensCost ? t.tokensCost.toLocaleString() : '-'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.updatedAt.slice(5, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
                {visibleTasks.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>暂无任务记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---------- 成本看板 ---------- */}
      {tab === 'costs' && (
        <>
          <div className="stats-row" style={{ marginBottom: 18 }}>
            <div className="stat-card">
              <div className="label">任务总数</div>
              <div className="value cyan">{costs?.taskCount ?? '-'}</div>
            </div>
            <div className="stat-card">
              <div className="label">完成 / 失败</div>
              <div className="value green">{costs?.doneCount ?? 0} / {costs?.failedCount ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="label">Token 合计</div>
              <div className="value purple">{(costs?.totalTokens ?? 0).toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="label">图像调用</div>
              <div className="value orange">{costs?.imageCount ?? 0}</div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">
              <div className="accent-bar" />
              Token 消耗 · 按 Agent
              <small>单位经济核算（方案 §3.3）</small>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {(costs?.byAgent ?? []).map(a => (
                <div key={a.agent}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{AGENT_LABEL[a.agent] ?? a.agent} <span style={{ color: 'var(--text-dim)' }}>({a.count} 任务{a.failed ? ` · 失败 ${a.failed}` : ''})</span></span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{a.tokens.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--accent-soft)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: `${Math.max(2, (a.tokens / maxTokens) * 100)}%`,
                      background: 'linear-gradient(90deg, var(--accent), var(--accent3))',
                    }} />
                  </div>
                </div>
              ))}
              {(costs?.byAgent ?? []).length === 0 && (
                <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 16 }}>暂无成本数据</p>
              )}
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 14 }}>
              每单成本 = Token 成本 + 图像生成调用 → 用于校准定价（商业化评分：单位经济）
            </p>
          </div>
        </>
      )}

      {/* ---------- 入驻费 / 会员 ---------- */}
      {tab === 'membership' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 14 }}>
            装修队入驻费与会员套餐由平台线下收款或支付网关确认。确认后才会开放客户资源、竞价资格与套餐加权。
          </p>
          <div className="panel">
            <table className="data-table">
              <thead><tr><th>公司</th><th>套餐</th><th>入驻费</th><th>支付凭证</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {(data?.membershipPayments ?? []).map(p => (
                  <tr key={p.id}>
                    <td>{p.companyName}</td>
                    <td>{p.tier}</td>
                    <td>¥{p.amountCny.toLocaleString()}</td>
                    <td>{p.paymentReference || '-'}</td>
                    <td>{statusTag(p.status)}</td>
                    <td>
                      {p.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} disabled={membershipBusy === p.id} onClick={() => void confirmMembership(p.id, 'approve')}>确认收款</button>
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} disabled={membershipBusy === p.id} onClick={() => void confirmMembership(p.id, 'reject')}>驳回</button>
                        </div>
                      ) : p.status === 'paid' ? <span className="tag tag-green">已开通</span> : <span className="tag tag-orange">已驳回</span>}
                    </td>
                  </tr>
                ))}
                {(data?.membershipPayments ?? []).length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>暂无入驻费支付记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---------- 利润分成 ---------- */}
      {tab === 'commissions' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 14 }}>
            平台按装修队项目利润的 10% 提取服务费。未填写预计成本时，暂按成交金额估算利润；实际结算时可按真实成本复核。
          </p>
          <div className="stats-row" style={{ marginBottom: 16 }}>
            <div className="stat-card"><div className="label">累计利润</div><div className="value green">¥{(data?.commissionSettlements ?? []).reduce((s, x) => s + x.profitCny, 0).toLocaleString()}</div></div>
            <div className="stat-card"><div className="label">平台 10% 分成</div><div className="value purple">¥{(data?.commissionSettlements ?? []).reduce((s, x) => s + x.platformCommissionCny, 0).toLocaleString()}</div></div>
            <div className="stat-card"><div className="label">待结算</div><div className="value orange">{(data?.commissionSettlements ?? []).filter(x => x.status === 'pending').length}</div></div>
          </div>
          <div className="panel">
            <table className="data-table">
              <thead><tr><th>订单</th><th>装修队</th><th>成交额</th><th>预估成本</th><th>利润</th><th>平台 10%</th><th>净利</th><th>操作</th></tr></thead>
              <tbody>
                {(data?.commissionSettlements ?? []).map(x => (
                  <tr key={x.id}>
                    <td>ORDER_{x.orderId}</td><td>{x.companyName}</td>
                    <td>¥{x.revenueCny.toLocaleString()}</td><td>¥{x.estimatedCostCny.toLocaleString()}</td>
                    <td>¥{x.profitCny.toLocaleString()}</td><td>¥{x.platformCommissionCny.toLocaleString()}</td><td>¥{x.contractorNetProfitCny.toLocaleString()}</td>
                    <td>{x.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 9px' }} disabled={membershipBusy === x.id} onClick={() => void settleCommission(x.id, 'settle')}>确认结算</button>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 9px' }} disabled={membershipBusy === x.id} onClick={() => void settleCommission(x.id, 'cancel')}>作废</button>
                      </div>
                    ) : x.status === 'settled' ? <span className="tag tag-green">已结算</span> : <span className="tag tag-orange">已作废</span>}</td>
                  </tr>
                ))}
                {(data?.commissionSettlements ?? []).length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>暂无利润分成记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---------- 订单（第一单） ---------- */}
      {tab === 'orders' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 14 }}>
            「第一单」闭环凭证：订单 → 双方确认 → 合同 → 模拟收款。平台不碰资金（业主直付装修队）。
          </p>
          <div className="panel">
            <table className="data-table">
              <thead>
                <tr><th>Order</th><th>项目</th><th>状态</th><th>报价</th><th>工期</th><th>匹配度</th></tr>
              </thead>
              <tbody>
                {(data?.orders ?? []).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>ORDER_{o.id}</td>
                    <td>{o.projectName}</td>
                    <td>{statusTag(o.status)}</td>
                    <td>{o.bidAmount ? `¥${Number(o.bidAmount).toLocaleString()}` : '-'}</td>
                    <td>{o.bidWeeks ? `${o.bidWeeks} 周` : '-'}</td>
                    <td>{o.matchScore ?? '-'}</td>
                  </tr>
                ))}
                {(data?.orders ?? []).length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>
                    暂无订单 — 业主在项目页「发布到接单市场」后生成
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, marginTop: 24 }}>
        老板控制台 · 每 3 秒刷新 · 所有任务交接与成本入账可追溯（Task Record）
      </p>
    </main>
  );
}
