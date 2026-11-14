"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTRACTOR_MEMBERSHIP_TIERS, getMembershipTier, type MembershipBillingCycle, type MembershipTierId } from "@i-renovation/shared/membership";
import { calculateContractorCommission, commissionLabel, type CommissionQuote } from "@i-renovation/shared/commission";
import { explainFairBidding } from "@i-renovation/shared/fair-bidding";
import { projectImage } from "@/lib/visuals";

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
  const [billingCycle, setBillingCycle] = useState<MembershipBillingCycle>('monthly');
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

  const [checkout, setCheckout] = useState<{ paymentId: number; purchaseUrl?: string; qrCode?: string } | null>(null);
  // 向支付服务查询当前权益并同步到会员状态（付款由支付服务自动确认，不需要人工审核）
  const syncPayment = useCallback(async () => {
    const res = await fetch('/api/company/membership/access', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '权益查询失败');
    const profile = await fetch('/api/auth/me');
    if (profile.ok) setMembership(await profile.json());
    return data as { active: boolean; expiresAt: string | null };
  }, []);

  async function refreshPayment() {
    setMembershipBusy(true);
    try {
      const data = await syncPayment();
      if (data.active) setCheckout(null);
      window.alert(data.active ? '支付宝权益已确认，基础会员已开通' : '尚未查到有效权益，请稍后刷新；请勿立即重复付款');
    } catch (error) { window.alert(error instanceof Error ? error.message : '权益查询失败'); }
    finally { setMembershipBusy(false); }
  }

  // 自动确认：打开页面（含从支付宝付款后返回）时查一次；付款入口打开期间每 5 秒查一次，查到即开通
  useEffect(() => {
    if (user?.role !== 'company') return;
    void syncPayment().catch(() => {});
  }, [user, syncPayment]);
  useEffect(() => {
    if (!checkout) return;
    let stopped = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (stopped || Date.now() - started > 15 * 60 * 1000) { clearInterval(timer); return; }
      try {
        const data = await syncPayment();
        if (data.active && !stopped) { stopped = true; clearInterval(timer); setCheckout(null); }
      } catch { /* 网络抖动时下一次再查 */ }
    }, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [checkout, syncPayment]);

  async function applyMembership(tierId: MembershipTierId) {
    if (membershipBusy) return;
    setMembershipBusy(true);
    try {
      const res = await fetch('/api/company/membership/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId, companyScale: membership?.companyScale ?? 'small', billingCycle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '会员申请失败');
      setCheckout(data);
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
      if (!openRes.ok) setError((openData as { error?: string }).error || '接单市场读取失败');
      if (!mineRes.ok) throw new Error('读取我的订单失败');
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

  // 会员一开通（自动确认付款后）就重新读取接单市场，不用手动刷新页面
  const membershipActive = membership?.membershipStatus === 'active';
  useEffect(() => {
    if (user && membershipActive) void load();
  }, [user, membershipActive, load]);

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
    } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试'); } finally {
      setBusy(false);
    }
  }

  async function confirmOrder(orderId: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer: "company" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '确认失败');
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : '确认失败'); } finally {
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
    } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试'); } finally {
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
            'url("/interiors/kitchen.jpg")',
        }}
      >
        <div className="role-hero-content">
          <span className="role-kicker"><i /> 工程合作中心 · {user?.companyName ?? user?.name ?? '装潢公司'}</span>
          <h1 className="role-title">以专业能力，获得长期项目</h1>
          <p className="role-subtitle">
            发现真实装修需求，提交清晰报价与工期，统一管理项目、订单和施工合同。平台关注交付质量，也尊重每一支施工团队的专业价值。
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
          <section className="contract-overview">
            <div className="brief-eyebrow">OVERVIEW · 经营概览</div>
            <div className="overview-meta">
              <div className="brief-item">
                <span>开放项目</span>
                <strong>{openOrders.length}</strong>
                <em>可浏览需求并提交报价</em>
              </div>
              <div className="brief-item">
                <span>我的竞价</span>
                <strong>{myBids.length}</strong>
                <em>报价、工期与审核状态</em>
              </div>
              <div className="brief-item">
                <span>合作订单</span>
                <strong>{myOrders.length}</strong>
                <em>确认合作、合同与施工交付</em>
              </div>
              <div className="brief-item">
                <span>会员状态</span>
                <strong>{getMembershipTier(membership?.membershipTier).name}</strong>
                <em>{membership?.membershipStatus === 'active' ? '已开通 · 客户资源已解锁' : '待支付 · 开通后可参与竞价'}</em>
              </div>
            </div>
          </section>

          <div className="rule-note">
            <div className="rule-note-label">FAIR BIDDING · 密封竞价规则</div>
            <p>{explainFairBidding().join('；')}</p>
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

          <div className="collab-strip">
            {[
              { n: '01', t: '清晰报价', d: '根据项目面积、风格、预算和工期要求，提交更有竞争力的施工方案。' },
              { n: '02', t: '项目交付', d: '统一管理匹配、双方确认、合同签署与订单状态，减少沟通遗漏。' },
              { n: '03', t: '资质与口碑', d: '资质由平台人工审核，匹配结果结合真实投标和公司服务能力。' },
            ].map(x => (
              <div key={x.n} className="collab-item">
                <b>{x.n}</b>
                <h4>{x.t}</h4>
                <p>{x.d}</p>
              </div>
            ))}
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
                  <div className="panel" style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(43,67,82,.96), rgba(92,112,124,.88))', color: '#fffdf8', border: '0' }}>
                    <div className="panel-title" style={{ color: '#fffdf8' }}>
                      <div className="accent-bar" />
                      会员与客户资源
                      <button className="btn" onClick={async () => {
                        try {
                          const res = await fetch('/api/company/membership/apply');
                          if (!res.ok) throw new Error('读取付款记录失败');
                          const rows = await res.json() as Array<{ id: number; amountCny: number; status: string }>;
                          window.alert(rows.map(p => `单号 ${p.id} · ¥${p.amountCny} · ${{ pending: '等待权益确认', entitlement_confirmed: '权益已确认（非支付回执）', paid: '已收款开通', rejected: '已驳回' }[p.status] ?? p.status}`).join('\n') || '暂无记录');
                        } catch { window.alert('读取付款记录失败，请稍后重试'); }
                      }}>付款记录</button>
                      <small>{getMembershipTier(membership?.membershipTier).name} · {membership?.membershipStatus === 'active' ? '已开通' : '待支付'}</small>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,.76)', lineHeight: 1.8, margin: 0 }}>
                      基础会员提供每月 30 条客户资源；其他套餐暂未开放。个人装修用户免费。
                    </p>
                  </div>
                  <p>个人装修用户免费。企业装修队目前仅开放基础会员，39 元/月，到期需主动购买，不自动扣费。</p>
                  <button className="btn" disabled={membershipBusy} onClick={() => void refreshPayment()}>我已付款 / 刷新支付宝权益</button>
                  {checkout && <div className="notice" role="status">
                    <p>购买入口编号：{checkout.paymentId}。扫码或返回本站不代表付款成功，请刷新权益确认。</p>
                    {checkout.purchaseUrl && <a className="btn btn-primary" href={checkout.purchaseUrl} target="_blank" rel="noopener noreferrer">打开支付宝付款</a>}
                    {checkout.qrCode && <a className="btn" href={checkout.qrCode} target="_blank" rel="noopener noreferrer">查看支付宝付款码</a>}
                  </div>}
                  <div className="role-feature-grid">
                    {CONTRACTOR_MEMBERSHIP_TIERS.filter(t => t.id === 'basic').map((tier) => {
                      const active = membership?.membershipTier === tier.id;
                      return (
                        <div className="role-feature-card" key={tier.id} style={active ? { borderColor: 'var(--accent)', boxShadow: '0 16px 42px rgba(43,67,82,.12)' } : undefined}>
                          <b>{tier.badge}</b>
                          <h3>{tier.name}</h3>
                          <p style={{ color: 'var(--accent)', fontSize: 18 }}>¥39 / 月</p>
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
                    openOrders.map((o, index) => (
                      <div
                        key={o.id}
                        className="panel"
                        style={{ marginBottom: 12, overflow: 'hidden' }}
                      >
                        <div
                          style={{
                            height: 128,
                            margin: '-20px -22px 18px',
                            background: `url("${projectImage(index)}") center/cover`,
                            position: 'relative',
                          }}
                        >
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(27,36,42,.46), transparent 62%)' }} />
                        </div>
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
                            <th>预计成本</th>
                            <th>毛利</th>
                            <th>平台服务费</th>
                            <th>净利润</th>
                            <th>报价风险</th>
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
