"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
};

type MyBid = Bid & { projectName: string };

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
  const [tab, setTab] = useState<"projects" | "bids" | "orders">("projects");
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
  const [busy, setBusy] = useState(false);
  const [contractFor, setContractFor] = useState<number | null>(null);
  const [contractText, setContractText] = useState("");
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
        error?: string;
      };
      if (!res.ok || typeof data.content !== "string") {
        setError(data.error ?? "获取合同失败");
        return;
      }
      setContractFor(orderId);
      setContractText(data.content);
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
    <main className="container" style={{ paddingTop: 32 }}>
      <div className="section-label" style={{ marginTop: 0 }}>
        <h2>装潢公司 · 承接平台</h2>
        <div className="line" />
        <span
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          COMPANY PORTAL v2.0
        </span>
      </div>
      {!authChecked ? (
        <div className="panel empty-state">
          <p>正在校验身份...</p>
        </div>
      ) : !user ? (
        <div
          className="panel"
          style={{ maxWidth: 520, margin: "48px auto", textAlign: "center" }}
        >
          <div className="panel-title">
            <div className="accent-bar" />
            需要装潢公司账号
          </div>
          <p
            style={{
              color: "var(--text-dim)",
              fontSize: 13,
              margin: "18px 0 22px",
            }}
          >
            本页面仅对装潢公司开放。请先在首页注册装潢公司账号，即可浏览开放项目、参与竞价并承接订单。
          </p>
          <Link href="/" className="btn btn-primary">
            前往注册 / 登录
          </Link>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, margin: "20px 0 18px" }}>
            {(
              [
                { key: "projects", label: "开放项目" },
                { key: "bids", label: "我的竞价" },
                { key: "orders", label: "订单管理" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={tab === t.key ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: 13 }}
              >
                {t.label}
              </button>
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
              {tab === "projects" && (
                <>
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
                            onClick={() => {
                              setBidFor(o.id);
                              setBidAmount("");
                              setBidWeeks("");
                              setBidNote("");
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
                                onChange={(e) => setBidAmount(e.target.value)}
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
            background: "rgba(0,0,0,0.7)",
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
            <pre style={{ whiteSpace: "pre-wrap" }}>{contractText}</pre>
            <button
              className="btn btn-primary"
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
