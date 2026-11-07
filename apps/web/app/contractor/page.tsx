"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTRACTOR_MEMBERSHIP_TIERS, getMembershipTier, membershipFeeFor, type MembershipBillingCycle, type MembershipTierId } from "@i-renovation/shared/membership";
import { calculateContractorCommission, commissionLabel, type CommissionQuote } from "@i-renovation/shared/commission";
import { explainFairBidding } from "@i-renovation/shared/fair-bidding";

type PortalUser = {
  id: number;
  role: string;
  name: string;
  companyName?: string;
};

type Order = {
  id: number;
  projectId: number;
  homeownerId: number;
  companyId: number | null;
  status: string;
  bidAmount: string | null;
  bidWeeks: string | null;
  bidNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type Bid = {
  id: number;
  orderId: number;
  companyId: number;
  companyName: string;
  amount: string;
  weeks: string;
  note: string | null;
  status: string;
  createdAt: string;
  bidRiskLevel?: string;
  bidRiskScore?: number;
  bidRiskReason?: string;
};

type MyBid = Bid & { projectName: string; estimatedCostCny?: number; profitCny?: number; platformCommissionCny?: number; netProfitCny?: number };

type MembershipProfile = {
  membershipStartedAt?: string;
  membershipPaidAmount?: number;
  companyScale?: string;
  membershipTier?: string;
  membershipStatus?: string;
  membershipExpiresAt?: string;
  monthlyLeadQuota?: number;
  monthlyLeadsUsed?: number;
};

type ProjectInfo = {
  name: string;
  style: string;
  budget: string;
  area: string | null;
};

function isOrderArray(v: unknown): v is Order[] {
  return (
    Array.isArray(v) &&
    v.every(
      (o) =>
        typeof o === "object" &&
        o !== null &&
        typeof (o as Order).id === "number",
    )
  );
}

function isBidArray(v: unknown): v is Bid[] {
  return (
    Array.isArray(v) &&
    v.every(
      (b) =>
        typeof b === "object" &&
        b !== null &&
        typeof (b as Bid).id === "number",
    )
  );
}

function bidStatusTag(status: string) {
  if (status === "accepted")
    return <span className="tag tag-green">已接受</span>;
  if (status === "rejected")
    return <span className="tag tag-orange">已拒绝</span>;
  return <span className="tag tag-cyan">待审核</span>;
}

function orderStatusTag(status: string) {
  if (status === "matched")
    return <span className="tag tag-purple">已匹配</span>;
  if (status === "company_confirmed")
    return <span className="tag tag-cyan">公司已确认</span>;
  if (status === "homeowner_confirmed")
    return <span className="tag tag-cyan">业主已确认</span>;
  if (status === "contracted")
    return <span className="tag tag-green">已签约</span>;
  if (status === "confirmed")
    return <span className="tag tag-green">双方已确认</span>;
  return <span className="tag tag-cyan">{status}</span>;
}

export default function ContractorPortal() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<"projects" | "bids" | "orders" | "membership">("projects");
  const [membership, setMembership] = useState<MembershipProfile | null>(null);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [billingCycle, setBillingCycle] = useState<MembershipBillingCycle>('annual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myBids, setMyBids] = useState<MyBid[]>([]);
  const [projMap, setProjMap] = useState<Record<number, ProjectInfo | null>>(
    {},
  );
  const [bidFor, setBidFor] = useState<number | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidWeeks, setBidWeeks] = useState("");
  const [bidNote, setBidNote] = useState("");
  const [bidCost, setBidCost] = useState("");
  const [commissionPreview, setCommissionPreview] = useState<CommissionQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [contractFor, setContractFor] = useState<number | null>(null);
  const [contractText, setContractText] = useState("");
  const [companySigned, setCompanySigned] = useState(false);
  const projRef = useRef<Record<number, ProjectInfo | null>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw) as PortalUser | null;
        if (
          parsed &&
          parsed.role === "company" &&
          typeof parsed.id === "number"
        )
          setUser(parsed);
      }
    } catch {
      /* 忽略损坏的本地用户数据 */
    }
    setAuthChecked(true);
  }, []);

  const ensureProjects = useCallback(async (ids: number[]) => {
    const need = ids.filter((id) => projRef.current[id] === undefined);
    if (need.length === 0) return;
    const entries: Array<[number, ProjectInfo | null]> = await Promise.all(
      need.map(async (id): Promise<[number, ProjectInfo | null]> => {
        try {
          const res = await fetch(`/api/projects/${id}`);
          const data = (await res.json()) as {
            project?: {
              name?: string;
              style?: string;
              budget?: string;
              area?: string | null;
            };
          };
          const p = data.project;
          return [
            id,
            p
              ? {
                  name: p.name ?? `项目 #${id}`,
                  style: p.style ?? "-",
                  budget: p.budget ?? "-",
                  area: p.area ?? null,
                }
              : null,
          ];
        } catch {
          return [id, null];
        }
      }),
    );
    const next: Record<number, ProjectInfo | null> = { ...projRef.current };
    for (const [id, info] of entries) next[id] = info;
    projRef.current = next;
    setProjMap(next);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((data: unknown) => {
        if (data && typeof data === 'object') setMembership(data as MembershipProfile);
      })
      .catch(() => {});
  }, [user]);

  async function applyMembership(tierId: MembershipTierId) {
    if (membershipBusy) return;
    const paymentReference = window.prompt('请先向平台核实线下收款方式。已付款可填写转账流水号；未付款可留空申请，核实收款后才会开通。');
    if (paymentReference === null) return;
    setMembershipBusy(true);
    try {
      const res = await fetch('/api/company/membership/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId, companyScale: membership?.companyScale ?? 'small', billingCycle, paymentReference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '会员申请失败');
      window.alert(`申请已提交：单号 ${data.payment.id}，应付 ¥${data.amountCny}。请联系平台核实收款方式，老板确认收款后生效。现有会员权益继续有效。`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '会员申请失败');
    } finally {
      setMembershipBusy(false);
    }
  }

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [openRes, mineRes] = await Promise.all([
        fetch("/api/orders?status=open"),
        fetch(`/api/orders?role=company&id=${user.id}`),
      ]);
      const openData: unknown = await openRes.json();
      const mineData: unknown = await mineRes.json();
      const openList = isOrderArray(openData) ? openData : [];
      const mineList = isOrderArray(mineData) ? mineData : [];
      setOpenOrders(openList);
      setMyOrders(mineList);

      const orderMap: Record<number, Order> = {};
      for (const o of [...openList, ...mineList]) orderMap[o.id] = o;

      await ensureProjects([...openList, ...mineList].map((o) => o.projectId));

      const orderIds = Object.keys(orderMap).map(Number);
      const bidLists = await Promise.all(
        orderIds.map(async (id) => {
          try {
            const res = await fetch(`/api/bids?orderId=${id}`);
            const data: unknown = await res.json();
            return isBidArray(data) ? data : [];
          } catch {
            return [] as Bid[];
          }
        }),
      );
      const nameOf = (orderId: number) => {
        const o = orderMap[orderId];
        const p = o ? projRef.current[o.projectId] : null;
        return p?.name ?? (o ? `项目 #${o.projectId}` : `订单 #${orderId}`);
      };
      setMyBids(
        bidLists
          .flat()
          .filter((b) => b.companyId === user.id)
          .map((b) => ({ ...b, projectName: nameOf(b.orderId) })),
      );
    } catch {
      setError("数据加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [user, ensureProjects]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  function updateBidFinancials(amount: string, cost: string) {
    setBidAmount(amount);
    setBidCost(cost);
    setCommissionPreview(amount.trim() ? calculateContractorCommission({ amount, estimatedCost: cost, amountInWan: true }) : null);
  }

  async function submitBid(orderId: number) {
    if (!user || !bidAmount.trim() || !bidWeeks.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          companyId: user.id,
          companyName: user.companyName ?? user.name,
          amount: bidAmount.trim(),
          weeks: bidWeeks.trim(),
          note: bidNote.trim() || undefined,
          estimatedCost: bidCost.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "提交报价失败");
        return;
      }
      setBidFor(null);
      setBidAmount("");
      setBidWeeks("");
      setBidNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmOrder(orderId: number) {
    setBusy(true);
    try {
      await fetch(`/api/orders/${orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer: "company" }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function viewContract(orderId: number) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as {
        content?: string;
        companySigned?: number;
        error?: string;
      };
      if (!res.ok || typeof data.content !== "string") {
        setError(data.error ?? "获取合同失败");
        return;
      }
      setContractFor(orderId);
      setContractText(data.content);
      setCompanySigned(data.companySigned === 1);
    } finally {
      setBusy(false);
    }
  }

  async function signContract(orderId: number) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer: "company" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        companySigned?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "签署失败");
        return;
      }
      setCompanySigned(data.companySigned === 1);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const projLabel = useCallback(
    (projectId: number) => projMap[projectId]?.name ?? `项目 #${projectId}`,
    [projMap],
  );
  const projMeta = useCallback(
    (projectId: number) => {
      const p = projMap[projectId];
      if (!p) return `项目编号 ${projectId}`;
      const area = p.area ? `${p.area}㎡` : "面积待定";
      return `${p.style} · ${area} · 预算 ${p.budget}`;
    },
    [projMap],
  );

  return (
    <main className="container" style={{ paddingTop: 24 }}>
      <section
        className="role-hero"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1800&q=88")',
        }}
      >
        <div className="role-hero-content">
          <span className="role-kicker"><i /> CONTRACTOR NETWORK · {user?.companyName ?? user?.name ?? '装潢公司'}</span>
          <h1 className="role-title">把好项目，交给真正能落地的团队</h1>
          <p className="role-subtitle">
            浏览真实装修需求，提交报价与工期，管理竞价、订单和施工合同。平台只展示脱敏项目信息，最终合作由业主决定。
          </p>
          <div className="role-actions">
            <button
              className="btn btn-primary"
              onClick={() => setTab('projects')}
            >
              查看开放项目
            </button>
            <button
              className="btn btn-ghost role-ghost-light"
              onClick={() => setTab('orders')}
            >
              管理订单
            </button>
          </div>
        </div>
      </section>

      {!authChecked ? (
        <div className="panel empty-state" style={{ marginTop: 18 }}>
          <p>正在校验装修公司身份...</p>
        </div>
      ) : !user ? (
        <div
          className="panel"
          style={{ maxWidth: 560, margin: '28px auto', textAlign: 'center' }}
        >
          <div className="panel-title">
            <div className="accent-bar" />
            需要装潢公司账号
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '18px 0 22px', lineHeight: 1.8 }}>
            本页面仅对装潢公司开放。注册并完成资质提交后，即可浏览开放项目、参与竞价、承接订单与签署合同。
          </p>
          <Link href="/" className="btn btn-primary">前往注册 / 登录</Link>
        </div>
      ) : (
        <>
          <section className="role-stat-grid">
            <div className="role-stat-card">
              <strong>{openOrders.length}</strong>
              <span>开放项目<br />可浏览需求并提交报价</span>
            </div>
            <div className="role-stat-card">
              <strong>{myBids.length}</strong>
              <span>我的竞价<br />查看报价、工期与审核状态</span>
            </div>
            <div className="role-stat-card">
              <strong>{myOrders.length}</strong>
              <span>合作订单<br />确认合作、合同与施工交付</span>
            </div>
          </section>

          <div className="notice notice-ok" style={{ marginBottom: 14 }}>
            <strong>密封竞价规则：</strong>{explainFairBidding().join('；')}
          </div>

          <div className="role-tabs">
            {(
              [
                { key: 'projects', label: '开放项目' },
                { key: 'bids', label: '我的竞价' },
                { key: 'orders', label: '订单管理' },
              ] as const
            ).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`btn role-tab ${tab === t.key ? 'active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="role-feature-grid">
            <div className="role-feature-card">
              <b>01 · BID</b>
              <h3>精准报价</h3>
              <p>根据项目面积、风格、预算和工期要求，提交更有竞争力的施工方案。</p>
            </div>
            <div className="role-feature-card">
              <b>02 · DELIVERY</b>
              <h3>订单交付</h3>
              <p>统一管理匹配、双方确认、合同签署与订单状态，减少沟通遗漏。</p>
            </div>
            <div className="role-feature-card">
              <b>03 · TRUST</b>
              <h3>资质与口碑</h3>
              <p>资质由平台人工审核，匹配结果结合真实投标和公司服务能力。</p>
            </div>
          </div>

          {error && (
            <div className="tag tag-orange" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          {loading ? (
            <div className="panel empty-state">
              <p>加载中...</p>
            </div>
          ) : (
            <>
              {tab === "membership" && (
                <div>
                  <div className="panel" style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(35,58,50,.96), rgba(88,111,98,.88))', color: '#fffdf8', border: '0' }}>
                    <div className="panel-title" style={{ color: '#fffdf8' }}>
                      <div className="accent-bar" />
                      会员与客户资源
                      <button className="btn" onClick={async () => {
                        try {
                          const res = await fetch('/api/company/membership/apply');
                          if (!res.ok) throw new Error('读取付款记录失败');
                          const rows = await res.json() as Array<{ id: number; amountCny: number; status: string }>;
                          window.alert(rows.map(p => `单号 ${p.id} · ¥${p.amountCny} · ${{ pending: '待核实收款', paid: '已收款开通', rejected: '已驳回' }[p.status] ?? p.status}`).join('\n') || '暂无记录');
                        } catch { window.alert('读取付款记录失败，请稍后重试'); }
                      }}>付款记录</button>
                      <small>{getMembershipTier(membership?.membershipTier).name} · {membership?.membershipStatus === 'active' ? '已开通' : '待支付'}</small>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,.76)', lineHeight: 1.8, margin: 0 }}>
                      不同套餐对应不同的客户资源数量、匹配优先级和品牌曝光。装修队规模会影响推荐套餐，也可以根据业务增长升级。
                    </p>
                  </div>
                  <div className="role-tabs" style={{ marginTop: 0 }}>
                    {([
                      { key: 'annual', label: '按年' },
                      { key: 'quarterly', label: '按季度' },
                      { key: 'monthly', label: '按月' },
                    ] as const).map(item => (
                      <button key={item.key} className={`btn role-tab ${billingCycle === item.key ? 'active' : ''}`} onClick={() => setBillingCycle(item.key)}>{item.label}</button>
                    ))}
                  </div>
                  <div className="role-feature-grid">
                    {CONTRACTOR_MEMBERSHIP_TIERS.map((tier) => {
                      const active = membership?.membershipTier === tier.id;
                      return (
                        <div className="role-feature-card" key={tier.id} style={active ? { borderColor: 'var(--accent)', boxShadow: '0 16px 42px rgba(38,82,65,.12)' } : undefined}>
                          <b>{tier.badge}</b>
                          <h3>{tier.name}</h3>
                          <p style={{ color: 'var(--accent)', fontSize: 18, fontFamily: 'var(--font-serif)', marginBottom: 4 }}>¥{membershipFeeFor(tier.id, !membership?.membershipStartedAt && !Number(membership?.membershipPaidAmount ?? 0), billingCycle).toLocaleString()} / {billingCycle === 'monthly' ? '月' : billingCycle === 'quarterly' ? '季' : '年'}</p>
                          <p style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 8 }}>首年按年 ¥{tier.firstYearFeeCny.toLocaleString()} · 续费 ¥{tier.annualFeeCny.toLocaleString()} / 年</p>
                          <p>{tier.benefits.slice(0, 3).join(' · ')}</p>
                          <button
                            className={active ? 'btn btn-ghost' : 'btn btn-primary'}
                            disabled={membershipBusy}
                            onClick={() => void applyMembership(tier.id)}
                            style={{ marginTop: 12 }}
                          >
                            {active && membership?.membershipStatus === 'active' ? '申请续费' : '申请开通'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {tab === "projects" && (
                <>
                  {membership?.membershipStatus !== 'active' && (
                    <div className="notice notice-warn" style={{ marginBottom: 12 }}>
                      当前尚未开通有效会员。完成入驻费支付后，才能获取客户资源并参与项目竞价。
                      <button className="btn btn-primary" style={{ marginLeft: 10, fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('membership')}>查看套餐</button>
                    </div>
                  )}
                  {openOrders.length === 0 ? (
                    <div className="panel empty-state">
                      <p>暂无开放项目可竞价</p>
                    </div>
                  ) : (
                    openOrders.map((o) => (
                      <div
                        key={o.id}
                        className="panel"
                        style={{ marginBottom: 12 }}
                      >
                        <div className="panel-title">
                          <div className="accent-bar" />
                          {projLabel(o.projectId)}
                          {orderStatusTag(o.status)}
                        </div>
                        <p
                          style={{
                            color: "var(--text-dim)",
                            fontSize: 13,
                            margin: "0 0 12px",
                          }}
                        >
                          {projMeta(o.projectId)}
                        </p>
                        {bidFor !== o.id ? (
                          <button
                            className="btn btn-ghost"
                            disabled={membership?.membershipStatus !== 'active'}
                            onClick={() => {
                              setBidFor(o.id);
                              setBidAmount("");
                              setBidWeeks("");
                              setBidNote("");
                              setBidCost("");
                              setCommissionPreview(null);
                            }}
                          >
                            参与竞价 →
                          </button>
                        ) : (
                          <div>
                            <div className="form-group">
                              <label>报价金额（万元）</label>
                              <input
                                className="form-input"
                                value={bidAmount}
                                onChange={(e) => updateBidFinancials(e.target.value, bidCost)}
                                placeholder="如 18"
                              />
                            </div>
                            <div className="form-group">
                              <label>工期（周）</label>
                              <input
                                className="form-input"
                                value={bidWeeks}
                                onChange={(e) => setBidWeeks(e.target.value)}
                                placeholder="如 12"
                              />
                            </div>
                            <div className="form-group">
                              <label>预计项目成本（万元，用于利润分成）</label>
                              <input
                                className="form-input"
                                value={bidCost}
                                onChange={(e) => updateBidFinancials(bidAmount, e.target.value)}
                                placeholder="如 12.5"
                              />
                            </div>
                            {commissionPreview && (
                              <div className="notice notice-ok" style={{ marginBottom: 10, fontSize: 12 }}>
                                {commissionLabel(commissionPreview)}
                              </div>
                            )}
                            <div className="form-group">
                              <label>备注说明</label>
                              <textarea
                                className="form-input"
                                rows={3}
                                value={bidNote}
                                onChange={(e) => setBidNote(e.target.value)}
                                placeholder="方案亮点、用材说明（选填）"
                              />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                className="btn btn-primary"
                                disabled={busy}
                                onClick={() => void submitBid(o.id)}
                              >
                                提交报价
                              </button>
                              <button
                                className="btn btn-ghost"
                                onClick={() => setBidFor(null)}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}
              {tab === "bids" && (
                <>
                  {myBids.length === 0 ? (
                    <div className="panel empty-state">
                      <p>暂无竞价记录，可在「开放项目」中参与竞价。</p>
                    </div>
                  ) : (
                    <div className="panel">
                      <div className="panel-title">
                        <div className="accent-bar" />
                        我的竞价记录
                      </div>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>项目</th>
                            <th>报价</th>
                            <th>工期</th>
                            <th>状态</th>
                            <th>提交时间</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myBids.map((b) => (
                            <tr key={b.id}>
                              <td>{b.projectName}</td>
                              <td>{b.amount}万</td>
                              <td>{b.weeks} 周</td>
                              <td>¥{(b.estimatedCostCny ?? 0).toLocaleString()}</td>
                              <td>¥{(b.profitCny ?? 0).toLocaleString()}</td>
                              <td>¥{(b.platformCommissionCny ?? 0).toLocaleString()}</td>
                              <td>¥{(b.netProfitCny ?? 0).toLocaleString()}</td>
                              <td>{b.bidRiskLevel === 'low_ball' ? <span className="tag tag-orange">低价风险</span> : b.bidRiskLevel === 'high_ball' ? <span className="tag tag-orange">价格偏高</span> : <span className="tag tag-green">合理</span>}</td>
                              <td>{bidStatusTag(b.status)}</td>
                              <td>{b.createdAt.slice(0, 10)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
              {tab === "orders" && (
                <>
                  {myOrders.length === 0 ? (
                    <div className="panel empty-state">
                      <p>暂无相关订单，确认合作后订单会出现在这里。</p>
                    </div>
                  ) : (
                    myOrders.map((o) => (
                      <div
                        key={o.id}
                        className="panel"
                        style={{ marginBottom: 12 }}
                      >
                        <div className="panel-title">
                          <div className="accent-bar" />
                          {projLabel(o.projectId)}
                          {orderStatusTag(o.status)}
                        </div>
                        <p
                          style={{
                            color: "var(--text-dim)",
                            fontSize: 13,
                            margin: "0 0 12px",
                          }}
                        >
                          {projMeta(o.projectId)}
                        </p>
                        {(o.status === "matched" ||
                          o.status === "homeowner_confirmed") && (
                          <button
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => void confirmOrder(o.id)}
                          >
                            确认合作
                          </button>
                        )}
                        {(o.status === "confirmed" ||
                          o.status === "contracted") && (
                          <button
                            className="btn btn-ghost"
                            disabled={busy}
                            onClick={() => void viewContract(o.id)}
                          >
                            查看合同
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      {contractFor !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,28,24,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setContractFor(null)}
        >
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">
              <div className="accent-bar" />
              施工合同 · 订单 #{contractFor}
            </div>
            <pre style={{ whiteSpace: "pre-wrap", maxHeight: "55vh", overflow: "auto" }}>{contractText}</pre>
            {companySigned ? (
              <span className="tag tag-green">本公司已签署</span>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void signContract(contractFor)}
              >
                签署合同
              </button>
            )}{" "}
            <button
              className="btn btn-ghost"
              onClick={() => setContractFor(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
