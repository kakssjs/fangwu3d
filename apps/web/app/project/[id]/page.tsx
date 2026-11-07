'use client';
import { useEffect, useState, use, Suspense, lazy, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanGeometry, PlanRoom } from '@i-renovation/shared/plan';
import FloorPlanStudio, { type StudioData, type StudioRect } from '../../components/FloorPlanStudio';
import AgentAvatar from '../../components/AgentAvatar';
import { agentOf } from '@/lib/agents';

const Scene3D = lazy(() => import('../../components/Scene3D'));

const STAGES: { key: string; label: string }[] = [
  { key: 'floor_plan', label: '户型识别' },
  { key: 'designer', label: '二维设计' },
  { key: 'quote', label: '报价工期' },
  { key: 'qa', label: '质检交付' },
];

interface ProjectData {
  project: { id: number; name: string; style: string; area?: string; budget: string; stage: number; needs?: string };
  results: { kind: string; content: Record<string, unknown> }[];
  tasks: {
    id: number; toAgent: string; fromAgent: string; status: string; createdAt: string;
    output?: { exception?: { rule?: string; ruleName?: string; action?: string; detail?: string }; ask?: string; degraded?: boolean } | null;
  }[];
}

interface DecorationImage {
  room: string;
  prompt: string;
  url?: string;
  b64?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

interface OrderData {
  id: number;
  projectId: number;
  homeownerId: number;
  companyId: number | null;
  status: string;
  bidAmount: string | null;
  bidWeeks: string | null;
  bidNote: string | null;
  matchScore: string | null;
  homeownerConfirmedAt: string | null;
  companyConfirmedAt: string | null;
  confirmedAt: string | null;
  contractedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BidData {
  id: number;
  orderId: number;
  companyId: number;
  companyName: string;
  amount: string;
  weeks: string;
  note: string | null;
  status: string;
  createdAt: string;
}

interface ContractData {
  id: number;
  orderId: number;
  content: string;
  homeownerSigned: number;
  companySigned: number;
  createdAt: string;
  signedAt: string | null;
}

function readUser(): { id: number; name: string } {
  try {
    const saved = localStorage.getItem('user');
    if (saved) {
      const u = JSON.parse(saved) as { id?: unknown; name?: unknown };
      return {
        id: typeof u.id === 'number' && Number.isFinite(u.id) ? u.id : 1,
        name: typeof u.name === 'string' && u.name ? u.name : '业主',
      };
    }
  } catch {
    /* ignore */
  }
  return { id: 1, name: '业主' };
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ProjectData | null>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [bids, setBids] = useState<BidData[]>([]);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [showRecommend, setShowRecommend] = useState(false);
  const [userName, setUserName] = useState('业主');
  // 装饰图对话
  const [decorations, setDecorations] = useState<DecorationImage[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  // 户型图输入（上传 / 画板手绘）
  const [fpData, setFpData] = useState<StudioData | null>(null);
  const [customGeom, setCustomGeom] = useState<PlanGeometry | null>(null);
  const [fpSource, setFpSource] = useState<'user' | 'agent'>('user');
  // 工作台数据 → 下游（Agent 施工图 / 房间渲染图）
  const [studioRects, setStudioRects] = useState<StudioRect[]>([]);
  const [stdUrl, setStdUrl] = useState<string | null>(null);
  const [genRoomsBusy, setGenRoomsBusy] = useState(false);
  const [genRoomsProgress, setGenRoomsProgress] = useState('');
  // 报价调整 + 最终确认（业主人工动作）
  const [adjustPct, setAdjustPct] = useState(0);
  const [decision, setDecision] = useState<{ finalTotal: number; adjustPct: number; confirmedAt: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  // 删除项目（两级确认，防误触）
  const [delConfirm, setDelConfirm] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  useEffect(() => {
    const load = () => fetch('/api/projects/' + id).then(r => r.json()).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    setUserName(readUser().name);
  }, []);

  // Load decoration images from results
  useEffect(() => {
    if (!data) return;
    const dec = data.results.find(r => r.kind === 'decorations')?.content as { images?: DecorationImage[] } | undefined;
    if (dec?.images) {
      setDecorations(dec.images);
      if (dec.images.length > 0 && selectedIdx < 0) setSelectedIdx(0);
    }
  }, [data, selectedIdx]);

  // 恢复已保存的户型输入与业主决策（仅一次）
  useEffect(() => {
    if (!data) return;
    if (!fpData) {
      const fp = data.results.find(r => r.kind === 'floorplan')?.content as StudioData | undefined;
      if (fp && (fp.stdImage || fp.image || fp.rects?.length)) setFpData(fp);
    }
    if (!decision) {
      const dc = data.results.find(r => r.kind === 'decision')?.content as { finalTotal?: number; adjustPct?: number; confirmedAt?: string } | undefined;
      if (dc?.confirmedAt) {
        setDecision({ finalTotal: dc.finalTotal ?? 0, adjustPct: dc.adjustPct ?? 0, confirmedAt: dc.confirmedAt });
        if (typeof dc.adjustPct === 'number') setAdjustPct(dc.adjustPct);
      }
    }
  }, [data, fpData, decision]);

  // 工作台数据回调（保持引用稳定，避免反复触发）
  const handleRooms = useCallback((r: StudioRect[]) => setStudioRects(r), []);
  const handleStd = useCallback((u: string | null) => setStdUrl(u), []);

  // 根据房型图生成各房间渲染图（Agnes）：识别/手绘的房间有几个生成几个
  async function generateRoomRenderings() {
    if (genRoomsBusy) return;
    setGenRoomsBusy(true);
    try {
      const M_PER_PX = 0.0125;
      // 房间源：用户识别/手绘的房间（studioRects）优先，Agent 识别/启发式（plan.rooms）兜底
      const rooms: { name: string; area: number }[] = studioRects.length
        ? studioRects.map(r => ({ name: r.name, area: Math.round(r.w * r.d * M_PER_PX * M_PER_PX * 10) / 10 }))
        : (plan?.rooms ?? []);
      // 有几个房间生成几张，不设上限
      const target = rooms.filter(r => r.name && r.area > 0);
      if (target.length === 0) return;
      const imgs: DecorationImage[] = new Array(target.length);
      let doneCount = 0;
      setGenRoomsProgress(`0/${target.length}`);
      // 3 张并发，兼顾限流与速度
      let next = 0;
      const workers = Array.from({ length: Math.min(3, target.length) }, async () => {
        while (next < target.length) {
          const i = next++;
          const room = target[i];
          const prompt = `Interior decoration design photo of a ${room.name}, ${room.area} square meters, ${data!.project.style} style, warm lighting, realistic, high quality, architectural visualization`;
          try {
            const res = await fetch('/api/agnes/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, size: '1K', ratio: '16:9' }),
            });
            const j = await res.json() as { url?: string; b64_json?: string };
            imgs[i] = { room: room.name, prompt, url: j.url, b64: j.b64_json };
          } catch {
            imgs[i] = { room: room.name, prompt };
          }
          doneCount += 1;
          setGenRoomsProgress(`${doneCount}/${target.length}`);
        }
      });
      await Promise.all(workers);
      setDecorations(imgs);
      if (imgs.length > 0) setSelectedIdx(0);
      await fetch(`/api/projects/${id}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'decorations',
          upsert: true,
          content: { images: imgs, style: data!.project.style, note: `根据房型图生成的各房间渲染图（${imgs.length} 间，AI 生成）` },
        }),
      });
    } finally {
      setGenRoomsBusy(false);
      setGenRoomsProgress('');
    }
  }

  // 最终确认（业主人工动作）→ 自动发布到接单市场
  async function finalConfirm() {
    if (confirmBusy) return;
    setConfirmBusy(true);
    try {
      const base = quote?.total ?? 0;
      const finalTotal = Math.round(base * (1 + adjustPct / 100));
      const confirmedAt = new Date().toISOString();
      await fetch(`/api/projects/${id}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'decision',
          content: { finalTotal, adjustPct, confirmedAt, note: '业主最终确认（人工动作）· 确认后自动发布' },
        }),
      });
      if (!order) {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: Number(id), homeownerId: readUser().id }),
        });
        if (res.ok) setOrder((await res.json()) as OrderData);
      }
      setDecision({ finalTotal, adjustPct, confirmedAt });
    } finally {
      setConfirmBusy(false);
    }
  }

  // Chat: modify decoration image
  async function sendChat() {
    if (!chatInput.trim() || chatBusy || selectedIdx < 0) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatBusy(true);
    try {
      const currentImg = decorations[selectedIdx];
      const roomName = currentImg?.room ?? '';
      const res = await fetch('/api/agnes/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          imageUrl: currentImg?.url || currentImg?.b64 ? (currentImg.url ?? `data:image/png;base64,${currentImg.b64}`) : undefined,
          style: data?.project.style,
          room: roomName,
        }),
      });
      const json = await res.json();
      if (json.url || json.b64_json) {
        const newImg: DecorationImage = {
          room: roomName,
          prompt: msg,
          url: json.url,
          b64: json.b64_json,
        };
        const nextImgs = decorations.map((d, i) => i === selectedIdx ? newImg : d);
        setDecorations(nextImgs);
        setChatMessages(prev => [...prev, { role: 'assistant', content: `已根据"${msg}"重新生成 ${roomName} 装饰图`, imageUrl: json.url || `data:image/png;base64,${json.b64_json}` }]);
        // 持久化替换结果（覆盖式，刷新后不丢）
        void fetch(`/api/projects/${id}/results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'decorations',
            upsert: true,
            content: { images: nextImgs, style: data?.project.style, note: `根据房型图生成的各房间渲染图（${nextImgs.length} 间，AI 生成）` },
          }),
        });
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: '生成失败：' + (json.error ?? '未知错误') }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '网络错误，请重试' }]);
    }
    setChatBusy(false);
  }

  useEffect(() => {
    let cancelled = false;
    const loadOrderFlow = async () => {
      try {
        const homeownerId = readUser().id;
        const ordersRes = await fetch('/api/orders?role=homeowner&id=' + homeownerId);
        const ordersJson: unknown = await ordersRes.json();
        if (cancelled) return;
        const list = Array.isArray(ordersJson) ? (ordersJson as OrderData[]) : [];
        const current = list.find(o => o.projectId === Number(id)) ?? null;
        setOrder(current);
        if (current) {
          const bidsRes = await fetch('/api/bids?orderId=' + current.id);
          const bidsJson: unknown = await bidsRes.json();
          if (!cancelled && Array.isArray(bidsJson)) setBids(bidsJson as BidData[]);
          if (current.status === 'confirmed' || current.status === 'contracted') {
            const cRes = await fetch('/api/orders/' + current.id + '/contract');
            if (!cancelled) setContract(cRes.ok ? ((await cRes.json()) as ContractData) : null);
          } else if (!cancelled) {
            setContract(null);
          }
        } else if (!cancelled) {
          setBids([]);
          setContract(null);
        }
      } catch {
        /* ignore */
      }
    };
    loadOrderFlow();
    const t = setInterval(loadOrderFlow, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id]);

  if (!data) {
    return (
      <div className="container" style={{ padding: 80, textAlign: 'center', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: 32, marginBottom: 12, animation: 'ring-pulse 1.5s ease-in-out infinite' }}>⟳</div>
        <div style={{ fontSize: 15, marginBottom: 8 }}>正在启动智能体流水线…</div>
        <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>INITIALIZING AGENTS...</div>
      </div>
    );
  }

  const done = new Set(data.tasks.filter(t => t.status === 'done').map(t => t.toAgent));
  const running = new Set(data.tasks.filter(t => t.status === 'running').map(t => t.toAgent));
  const failed = new Set(data.tasks.filter(t => t.status === 'failed').map(t => t.toAgent));
  const byKind = (k: string) => data.results.find(r => r.kind === k)?.content as Record<string, unknown> | undefined;

  const plan = byKind('plan') as { rooms?: PlanRoom[]; geometry?: PlanGeometry; note?: string; warnings?: string[] } | undefined;
  const design = byKind('design') as { svg?: string; note?: string } | undefined;
  const quote = byKind('quote') as { items?: { item: string; qty: number; unit: string; price?: number; total: number }[]; total?: number; weeks?: number; schedule?: { phase: string; weeks: number }[] } | undefined;
  const match = byKind('match') as { contractors?: { id?: number | string; bidId?: number; name: string; rating?: number; score?: number; reason: string; districts?: string[]; types?: string[]; verified?: boolean; amount?: string | number; weeks?: string | number }[]; note?: string; source?: string; bidCount?: number } | undefined;

  const doneCount = STAGES.filter(s => done.has(s.key)).length;
  const progress = Math.round((doneCount / STAGES.length) * 100);
  const totalArea = plan?.rooms?.reduce((s, r) => s + r.area, 0) ?? 0;

  // 异常横幅（EXCEPTION_RULES）：等待用户补充 / 升级老板裁决 / 降级交付
  const waitingTasks = data.tasks.filter(t => t.status === 'waiting_user');
  const escalatedTasks = data.tasks.filter(t => t.status === 'escalated');

  const recommended = match?.contractors?.[0];
  const matchedBid = order && order.companyId !== null
    ? bids.find(b => b.companyId === order.companyId) ?? null
    : null;

  // —— 发布/匹配阶段状态流：业主确认 → 发布 → 等待装修公司投标 → 匹配智能体匹配 ——
  const matcherTask = [...data.tasks].filter(t => t.toAgent === 'matcher').sort((a, b) => b.id - a.id)[0];
  const matcherBusy = !!matcherTask && (matcherTask.status === 'pending' || matcherTask.status === 'running');
  const matchCount = match?.contractors?.length ?? 0;

  const orderStatusTag = (status: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      open: { text: '开放竞标中', cls: 'tag tag-cyan' },
      bidding: { text: '竞标进行中', cls: 'tag tag-cyan' },
      matched: { text: '已选定公司', cls: 'tag tag-purple' },
      homeowner_confirmed: { text: '业主已确认', cls: 'tag tag-orange' },
      company_confirmed: { text: '公司已确认', cls: 'tag tag-orange' },
      confirmed: { text: '双方已确认', cls: 'tag tag-green' },
      contracted: { text: '已签约', cls: 'tag tag-green' },
    };
    const m = map[status];
    return <span className={m ? m.cls : 'tag tag-cyan'}>{m ? m.text : status}</span>;
  };

  const publishProject = async () => {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: Number(id), homeownerId: readUser().id }),
      });
      if (res.ok) setOrder((await res.json()) as OrderData);
    } catch {
      /* ignore */
    }
  };

  const chooseBid = async (bid: BidData) => {
    if (!order) return;
    try {
      const res = await fetch('/api/orders/' + order.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: bid.companyId,
          status: 'matched',
          bidAmount: bid.amount,
          bidWeeks: bid.weeks,
        }),
      });
      if (res.ok) setOrder((await res.json()) as OrderData);
    } catch {
      /* ignore */
    }
  };

  const confirmSide = async (signer: 'homeowner' | 'company') => {
    if (!order) return;
    try {
      const res = await fetch('/api/orders/' + order.id + '/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signer }),
      });
      if (res.ok) setOrder((await res.json()) as OrderData);
    } catch {
      /* ignore */
    }
  };

  const generateContract = async () => {
    if (!order) return;
    try {
      const res = await fetch('/api/orders/' + order.id + '/contract', { method: 'POST' });
      if (res.ok) setContract((await res.json()) as ContractData);
    } catch {
      /* ignore */
    }
  };

  const signContract = async (signer: 'homeowner' | 'company') => {
    if (!order) return;
    try {
      const res = await fetch('/api/orders/' + order.id + '/contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signer }),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as ContractData;
      setContract(updated);
      if (updated.homeownerSigned === 1 && updated.companySigned === 1 && order.status !== 'contracted') {
        try {
          const patchRes = await fetch('/api/orders/' + order.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'contracted', contractedAt: new Date().toISOString() }),
          });
          if (patchRes.ok) setOrder((await patchRes.json()) as OrderData);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  };

  // 用户补充/确认后恢复等待中的任务（reask_user → 续跑流水线）
  const handleResume = async () => {
    try {
      await fetch(`/api/projects/${id}/resume`, { method: 'POST' });
      const res = await fetch('/api/projects/' + id);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
  };

  // 删除项目（业主动作，两级确认后执行）：级联清理任务/结果/订单/投标/合同，返回工作台
  const deleteProject = async () => {
    if (delBusy) return;
    setDelBusy(true);
    try {
      const res = await fetch('/api/projects/' + id, { method: 'DELETE' });
      if (res.ok) {
        router.push('/dashboard');
        return;
      }
    } catch {
      /* ignore */
    }
    setDelBusy(false);
  };

  return (
    <main className="container" style={{ paddingTop: 32 }}>
      {/* 项目头部 */}
      <div className="section-label" style={{ marginTop: 0 }}>
        <h2>{data.project.name}</h2>
        <div className="line" />
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          PRJ_{id} &nbsp;·&nbsp; {data.project.style} &nbsp;·&nbsp; STAGE {data.project.stage >= 3 ? 'PUBLISH / MATCH' : 'DESIGNING'}
        </span>
        {delConfirm ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn"
              disabled={delBusy}
              onClick={() => void deleteProject()}
              style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(255,77,96,0.18)', border: '1px solid rgba(255,77,96,0.5)', color: '#ff6b7a' }}
            >
              {delBusy ? '删除中…' : '确认删除？'}
            </button>
            <button className="btn btn-ghost" onClick={() => setDelConfirm(false)} style={{ fontSize: 11, padding: '3px 10px' }}>
              取消
            </button>
          </span>
        ) : (
          <button
            className="btn btn-ghost"
            onClick={() => setDelConfirm(true)}
            style={{ fontSize: 11, padding: '3px 10px', color: 'var(--text-dim)' }}
          >
            🗑 删除项目
          </button>
        )}
      </div>

      {/* 异常处理横幅（EXCEPTION_RULES）：反问用户 / 升级老板裁决 */}
      {waitingTasks.map(t => (
        <div key={`wait_${t.id}`} style={{
          marginTop: 16, padding: '14px 18px', borderRadius: 10,
          background: 'rgba(255, 176, 32, 0.08)', border: '1px solid rgba(255, 176, 32, 0.35)',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <AgentAvatar agentKey={t.toAgent} size={40} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <b style={{ color: '#ffb020', fontSize: 13 }}>⏳ 需要您补充信息 · {agentOf(t.toAgent).name}</b>
            <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, lineHeight: 1.7 }}>
              {String(t.output?.exception?.detail ?? '')} —— {String(t.output?.ask ?? '请补充后继续')}
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleResume} style={{ whiteSpace: 'nowrap' }}>
            我已补充，继续 →
          </button>
        </div>
      ))}
      {escalatedTasks.map(t => (
        <div key={`esc_${t.id}`} style={{
          marginTop: waitingTasks.length ? 10 : 16, padding: '14px 18px', borderRadius: 10,
          background: 'rgba(255, 77, 96, 0.08)', border: '1px solid rgba(255, 77, 96, 0.35)',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <AgentAvatar agentKey={t.toAgent} size={40} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <b style={{ color: '#ff4d60', fontSize: 13 }}>🔔 已升级老板裁决 · {String(t.output?.exception?.ruleName ?? '异常升级')}</b>
            <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, lineHeight: 1.7 }}>
              {agentOf(t.toAgent).name}（{t.toAgent}）：{String(t.output?.exception?.detail ?? '')} —— 按红线规则 Agent 不得自行改动，已提交老板人工裁决（重跑 / 降级交付 / 通知业主）
            </div>
          </div>
          <a className="btn" href="/boss" style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>去控制台查看 →</a>
        </div>
      ))}

      {/* 流水线进度 */}
      <div className="pipeline" style={{ marginTop: 24 }}>
        {STAGES.map((s, i) => (
          <div key={s.key} className={
            done.has(s.key) ? 'pipeline-node done' :
            running.has(s.key) ? 'pipeline-node running' :
            failed.has(s.key) ? 'pipeline-node failed' : 'pipeline-node'
          }>
            <div className="pipeline-icon"><AgentAvatar agentKey={s.key} size={34} /></div>
            <span>
              <b style={{ color: 'rgba(0, 229, 255, 0.8)', fontSize: 10, fontFamily: 'var(--font-mono)', display: 'block' }}>{agentOf(s.key).name} · {agentOf(s.key).role}</b>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* 统计卡片 */}
      <div className="stats-row" style={{ marginTop: 24 }}>
        <div className="stat-card">
          <div className="label">Progress</div>
          <div className="value cyan">{progress}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Status</div>
          <div className="value green">{doneCount}/{STAGES.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Budget</div>
          <div className="value purple">{data.project.budget}</div>
        </div>
        <div className="stat-card">
          <div className="label">Area</div>
          <div className="value orange">{data.project.area ? `${data.project.area}㎡` : '-'}</div>
        </div>
      </div>

      {/* 二维装修图（施工参考）：用户上传 / 画板手绘工作台 */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div className="accent-bar" />
          二维装修图（施工参考）
          <small>上传图片 / 手绘 → 标准房型图 → 3D</small>
        </div>
        <FloorPlanStudio
          projectId={Number(id)}
          totalArea={Number(data.project.area) || undefined}
          initial={fpData}
          onApply={(g) => {
            setCustomGeom(g);
            setFpSource('user');
          }}
          onRooms={handleRooms}
          onStdImage={handleStd}
        />
      </section>

      {/* 户型识别结果（用户房型图识别出的房间） */}
      {(studioRects.length > 0 || plan?.rooms) && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-title">
            <div className="accent-bar" />
            户型识别结果
            <small>{studioRects.length > 0 ? '来自你的房型图' : `PRJ_${id}`}</small>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>房间</th><th>面积</th><th>占比</th></tr>
            </thead>
            <tbody>
              {(studioRects.length > 0
                ? studioRects.map(r => ({ name: r.name, area: Math.round(r.w * r.d * 0.0125 * 0.0125 * 10) / 10 }))
                : (plan?.rooms ?? [])
              ).map((r, i, arr) => {
                const sum = arr.reduce((s, x) => s + x.area, 0) || 1;
                return (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.area}㎡</td>
                    <td>{Math.round((r.area / sum) * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 10 }}>
            AI 识别生成，尺寸以现场量房为准
          </p>
        </section>
      )}

      {/* Agent 施工图：标准房型图（上传图 / Agnes 手绘标准化） */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div className="accent-bar" />
          Agent 施工图
          <small>标准房型图 · 与 3D 同源</small>
        </div>
        {(stdUrl || fpData?.stdImage || fpData?.image) ? (
          <>
            <img
              src={(stdUrl ?? fpData?.stdImage ?? fpData?.image) as string}
              alt="标准房型图"
              style={{ width: '100%', maxWidth: 820, borderRadius: 12, border: '1px solid rgba(0, 229, 255, 0.18)', display: 'block' }}
            />
            <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 10 }}>
              {(stdUrl || fpData?.stdImage) ? 'AI 生成标准房型图 · 尺寸以现场量房为准' : '上传户型图 · 可在上方工作台一键标准化'}
            </p>
          </>
        ) : design?.svg ? (
          <>
            <div dangerouslySetInnerHTML={{ __html: design.svg }} style={{ overflowX: 'auto', border: '1px solid rgba(0, 229, 255, 0.18)', borderRadius: 12, padding: 10 }} />
            <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 10 }}>{design.note}</p>
          </>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            暂无房型图 — 在上方工作台上传图片或手绘框房间，点「Agnes 生成标准平面图」
          </p>
        )}
      </section>

      {/* 各房间渲染图（根据房型图生成）+ 对话修改 */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div className="accent-bar" />
          各房间渲染图（根据房型图生成）
          <small>AGNES IMAGE ENGINE</small>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 4px' }}>
          <button className="btn btn-primary" disabled={genRoomsBusy} onClick={() => void generateRoomRenderings()}>
            {genRoomsBusy ? `渲染图生成中 ${genRoomsProgress}…` : '✦ 生成各房间渲染图'}
          </button>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            基于房型图房间（{(studioRects.length ? studioRects.map(r => r.name) : (plan?.rooms ?? []).map(r => r.name)).join('、') || '识别后可用'}）· 共 {(studioRects.length || (plan?.rooms ?? []).length) || 0} 间，有几个生成几张 · {data.project.style} 风格
          </span>
        </div>
        {/* 房间选择 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 16px' }}>
            {decorations.map((d, i) => {
              const dup = decorations.filter(x => x.room === d.room).length > 1;
              const ord = decorations.slice(0, i).filter(x => x.room === d.room).length + 1;
              return (
                <button
                  key={`${i}-${d.room}`}
                  onClick={() => setSelectedIdx(i)}
                  className={`btn ${selectedIdx === i ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 12, padding: '5px 14px' }}
                >
                  {d.room}{dup ? ` ${ord}` : ''}
                </button>
              );
            })}
          </div>
          {/* 当前房间装饰图 */}
          {(() => {
            const cur = decorations[selectedIdx];
            if (!cur) return null;
            return (
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,229,255,0.18)', background: 'rgba(0,0,0,0.15)' }}>
                {cur.url ? (
                  <img src={cur.url} alt={cur.room} style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' }} />
                ) : cur.b64 ? (
                  <img src={`data:image/png;base64,${cur.b64}`} alt={cur.room} style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>图片生成中或失败，请通过下方对话重新生成</div>
                )}
              </div>
            );
          })()}

          {/* 对话修改区 */}
          <div style={{ marginTop: 16, border: '1px solid rgba(108,92,231,0.25)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'rgba(108,92,231,0.1)', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>💬 对话修改装饰图 — 当前：{decorations[selectedIdx]?.room || '选择房间'}</span>
              <span className="tag tag-purple" style={{ fontSize: 10 }}>AGNES AI</span>
            </div>
            {/* 消息列表 */}
            <div style={{ maxHeight: 260, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chatMessages.length === 0 && (
                <p style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: '18px 0' }}>
                  输入修改意见，AI 将重新生成装饰图。例如："换成蓝色沙发"、"增加绿植"、"改成暖色调灯光"
                </p>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: m.role === 'user' ? 'rgba(0,229,255,0.12)' : 'rgba(108,92,231,0.12)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(0,229,255,0.2)' : 'rgba(108,92,231,0.2)'}`,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}>
                  <div>{m.content}</div>
                  {m.imageUrl && <img src={m.imageUrl} alt="" style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />}
                </div>
              ))}
              {chatBusy && (
                <div style={{ alignSelf: 'flex-start', color: 'var(--text-dim)', fontSize: 12, padding: '4px 0' }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>⟳ AI 正在生成...</span>
                </div>
              )}
            </div>
            {/* 输入框 */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid rgba(108,92,231,0.15)' }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
                placeholder={`修改 ${decorations[selectedIdx]?.room || '房间'} 的装饰图...`}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                disabled={chatBusy}
              />
              <button onClick={() => void sendChat()} disabled={chatBusy || !chatInput.trim()} className="btn btn-primary" style={{ fontSize: 12, padding: '8px 18px' }}>
                {chatBusy ? '...' : '发送'}
              </button>
            </div>
          </div>
        </section>

      {/* 3D 视图 */}
      {(customGeom || (plan?.rooms && plan.rooms.length > 0)) && (() => {
        const useUser = fpSource === 'user' && customGeom;
        const effGeom = useUser ? customGeom : (plan?.geometry ?? null);
        const effRooms = useUser ? customGeom!.rooms : (plan?.rooms || []);
        const effWarnings = useUser ? customGeom!.warnings : (plan?.warnings ?? []);
        return (
          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-title">
              <div className="accent-bar" />
              3D 空间建模（2D→3D 同源重建）
              <small>{useUser ? '来源：用户户型图' : 'PLAN JSON → EXTRUSION'}</small>
            </div>
            {customGeom && plan?.geometry && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className={useUser ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={() => setFpSource('user')}>按我的户型图</button>
                <button className={!useUser ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={() => setFpSource('agent')}>Agent 自动布局</button>
              </div>
            )}
            <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading 3D...</div>}>
              <Scene3D geometry={effGeom} rooms={effRooms} />
            </Suspense>
            {effWarnings.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(240,160,60,0.08)', border: '1px solid rgba(240,160,60,0.25)', fontSize: 11, color: 'var(--text-dim)' }}>
                ⚠ ForgeFloor 校验提示：{effWarnings.join('；')}
              </div>
            )}
          </section>
        );
      })()}

      {quote?.items && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-title">
            <div className="accent-bar" />
            费用计算 · 材料清单与报价工期
            <small>约 {quote.weeks} 周 · 报价师「小算」</small>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>项目</th><th>数量</th><th>单价</th><th>费用</th></tr>
            </thead>
            <tbody>
              {quote.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.item}</td>
                  <td>{it.qty}{it.unit}</td>
                  <td>¥{(it.price ?? 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>¥{it.total.toLocaleString()}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 700 }}>合计</td>
                <td />
                <td />
                <td style={{ textAlign: 'right', fontWeight: 700 }}>¥{(quote.total ?? 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 10 }}>
            工期：{quote.schedule?.map(s => `${s.phase} ${s.weeks}周`).join(' → ')}
          </p>

          {/* 用户调价 + 最终确认（人工动作） */}
          <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(0,229,255,0.18)', background: 'rgba(0,229,255,0.05)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)' }}>对报价有异议？调整</span>
              <input
                type="number" step="1" value={adjustPct}
                onChange={e => setAdjustPct(Number(e.target.value) || 0)}
                disabled={!!decision}
                style={{ width: 72, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)', color: 'var(--text)', outline: 'none' }}
              />
              <span style={{ color: 'var(--text-dim)' }}>%　调整后</span>
              <strong style={{ color: 'var(--accent)', fontSize: 16 }}>
                ¥{Math.round((quote.total ?? 0) * (1 + adjustPct / 100)).toLocaleString()}
              </strong>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {decision ? (
                <>
                  <span className="tag tag-green">✓ 已最终确认</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    确认价 ¥{decision.finalTotal.toLocaleString()} · {decision.confirmedAt.slice(0, 10)} · 已自动发布到接单市场
                  </span>
                </>
              ) : (
                <>
                  <button className="btn btn-primary" disabled={confirmBusy} onClick={() => void finalConfirm()}>
                    {confirmBusy ? '确认中…' : '✓ 最终确认方案'}
                  </button>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    可先在上方对话修改房间效果；确认后将自动发布，无需再手动操作
                  </span>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {matchCount > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-title">
            <div className="accent-bar" />
            匹配的装修队
            <small>匹配师「小桥」按真实投标匹配 · 脱敏信息</small>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 4px' }}>
            <AgentAvatar agentKey="matcher" size={40} />
            <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              <b>小桥 · 匹配师</b>
              <span style={{ color: 'var(--text-dim)' }}>　基于装修公司发布的真实投标数据（报价 / 工期）+ 资质档案（人工审核状态 / 风格专长 / 服务范围）打分匹配；资质审核仅老板人工，选定装修队由业主决定</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 14 }}>
            {match!.contractors!.map((c, i) => (
              <div key={i} className="contractor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="name">{c.name}</span>
                  <span className="tag tag-orange">{c.score != null ? `匹配度 ${c.score}%` : `★${c.rating ?? '-'}`}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                  <span className={`tag ${c.verified ? 'tag-green' : 'tag-cyan'}`}>{c.verified ? '✓ 资质已人工审核' : '◌ 资质待审核'}</span>
                  {c.amount != null && c.weeks != null && <span className="tag tag-orange">投标 ¥{c.amount} · {c.weeks} 周</span>}
                  {c.types?.map(t => <span key={t} className="tag tag-purple">{t}</span>)}
                  {c.districts?.map(d => <span key={d} className="tag tag-cyan">📍{d}</span>)}
                </div>
                <div className="meta">
                  匹配理由：{c.reason}
                </div>
              </div>
            ))}
          </div>
          {match!.note && <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 12 }}>{match!.note}</p>}
        </section>
      )}

      {/* 实时智能体活动流 */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div className="accent-bar" />
          智能体执行日志
          <small style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', animation: 'pulse 1.5s infinite' }}>● LIVE</small>
        </div>
        <div style={{ margin: '12px 0 18px', height: 6, borderRadius: 3, background: 'rgba(0,229,255,0.1)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent3))', width: progress + '%', transition: 'width 0.8s ease', boxShadow: progress > 0 ? '0 0 12px rgba(0,229,255,0.5)' : 'none' }} />
        </div>
        {/* 任务交接链：真实 fromAgent → toAgent（数字员工协作） */}
        {data.tasks.length > 0 && (
          <div style={{ margin: '4px 0 18px', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(108,92,231,0.22)', background: 'rgba(108,92,231,0.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>🔗 任务交接链 · 数字员工协作</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {[...data.tasks].sort((a, b) => a.id - b.id).map((t, i) => {
                const from = agentOf(t.fromAgent);
                const to = agentOf(t.toAgent);
                return (
                  <Fragment key={t.id}>
                    {i === 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.14)', border: `1px solid ${from.color}55` }}>
                        <AgentAvatar agentKey={t.fromAgent} size={28} />
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{from.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{from.role}</span>
                      </span>
                    )}
                    <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>→</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.14)', border: `1px solid ${to.color}55` }}>
                      <AgentAvatar agentKey={t.toAgent} size={28} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{to.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{to.role}</span>
                      <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>#{t.id}</span>
                      {t.status === 'done' && <span style={{ fontSize: 9, color: 'var(--accent3)' }}>✓</span>}
                      {t.status === 'running' && <span style={{ fontSize: 9, color: 'var(--accent)', animation: 'pulse 1s infinite' }}>●</span>}
                      {t.status === 'failed' && <span style={{ fontSize: 9, color: 'var(--accent-danger)' }}>✗</span>}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
        {/* 阶段日志：每个数字员工头像 + 名字 */}
        {STAGES.map((s) => {
          const a = agentOf(s.key);
          const status = done.has(s.key) ? 'done' : running.has(s.key) ? 'running' : failed.has(s.key) ? 'failed' : 'pending';
          const task = data.tasks.find(t => t.toAgent === s.key);
          return (
            <div key={s.key} className="timeline-item" style={{ opacity: status === 'pending' ? 0.5 : 1 }}>
              <div className={'timeline-dot ' + (status === 'pending' ? '' : status)} style={status === 'pending' ? { background: 'rgba(125,147,184,0.3)' } : undefined} />
              <div className="timeline-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AgentAvatar agentKey={s.key} size={38} />
                <div>
                  <div className="title">{a.name} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>· {a.role} · {s.label}</span></div>
                  <div className="time">
                    {status === 'done' && <span style={{ color: 'var(--accent3)' }}>&#10003; 已完成</span>}
                    {status === 'running' && <span style={{ color: 'var(--accent)' }}>&#9679; 执行中...</span>}
                    {status === 'failed' && <span style={{ color: 'var(--accent-danger)' }}>&#10007; 失败</span>}
                    {status === 'pending' && <span>&#9711; 等待中</span>}
                    {task && <span style={{ marginLeft: 8 }}>Task #{task.id}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!match && (
          <div style={{ textAlign: 'center', padding: '18px 0 6px' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite', marginRight: 8, verticalAlign: 'middle' }} />
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Agent 流水线执行中 — 上方日志实时刷新</span>
          </div>
        )}
      </section>

      {/* 发布 · 竞标 · 匹配（第二阶段：等待业主确认 → 发布 → 等待装修公司发布数据（投标）→ 匹配智能体匹配） */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div className="accent-bar" />
          发布 · 竞标 · 匹配
          <small>MARKETPLACE · 业主确认后发布，装修公司投标后匹配智能体「小桥」自动匹配</small>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 6px' }}>
          {[
            {
              label: '① 业主最终确认', ok: !!decision, pending: !decision && !!quote,
              hint: decision ? `确认价 ¥${decision.finalTotal.toLocaleString()}` : (quote ? '等待你在报价区确认方案' : '等待报价生成'),
            },
            {
              label: '② 发布到接单市场', ok: !!order, pending: !!decision && !order,
              hint: order ? `ORDER_${order.id} 已发布` : '业主确认后自动发布',
            },
            {
              label: '③ 装修公司发布数据（投标）', ok: bids.length > 0, pending: !!order && bids.length === 0,
              hint: bids.length > 0 ? `${bids.length} 家已投标` : (order ? '等待装修公司发布投标数据…' : '发布后装修公司可投标'),
            },
            {
              label: '④ 匹配智能体匹配', ok: matchCount > 0, pending: matcherBusy || (bids.length > 0 && matchCount === 0),
              hint: matchCount > 0 ? `已匹配 ${matchCount} 家` : (matcherBusy ? '小桥匹配中…' : (bids.length > 0 ? '待匹配' : '等待投标数据')),
            },
          ].map((s, i) => (
            <div key={i} style={{
              flex: '1 1 220px', padding: '12px 14px', borderRadius: 12,
              border: `1px solid ${s.ok ? 'rgba(0,255,163,0.35)' : s.pending ? 'rgba(0,229,255,0.35)' : 'var(--border)'}`,
              background: s.ok ? 'rgba(0,255,163,0.07)' : s.pending ? 'rgba(0,229,255,0.06)' : 'rgba(0,0,0,0.12)',
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: s.ok ? 'var(--accent3)' : s.pending ? 'var(--accent)' : 'var(--text-dim)' }}>
                {s.ok ? '✓ ' : s.pending ? '● ' : '○ '}{s.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>{s.hint}</div>
            </div>
          ))}
        </div>
        {doneCount === STAGES.length && !order && !decision && (
          <button onClick={publishProject} className="btn btn-primary" style={{ marginTop: 12 }}>发布项目</button>
        )}
      </section>

      {/* 竞标动态 */}
      {order && (order.status === 'open' || order.status === 'bidding') && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-title">
            <div className="accent-bar" />
            竞标动态
            <small>ORDER_{order.id}</small>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {orderStatusTag(order.status)}
            <button onClick={() => setShowRecommend(v => !v)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 12px' }}>
              推荐匹配
            </button>
          </div>
          {showRecommend && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(108,92,231,0.10)', border: '1px solid rgba(108,92,231,0.25)', fontSize: 12, color: 'var(--text)' }}>
              <span className="tag tag-purple" style={{ marginRight: 8 }}>AI 推荐</span>
              {recommended
                ? `${recommended.name}（${recommended.score != null ? `匹配度 ${recommended.score}%` : `★${recommended.rating ?? '-'}`}）· 匹配理由：${recommended.reason}`
                : '暂无 AI 推荐结果'}
            </div>
          )}
          {bids.length === 0 && (
            <p style={{ color: 'var(--text-dim)', fontSize: 12.5, margin: '12px 0 4px' }}>
              ⏳ 已发布到接单市场，正在等待装修公司发布投标数据…（收到投标后匹配智能体「小桥」自动开始匹配）
            </p>
          )}
          {bids.length > 0 && <table className="data-table" style={{marginTop:14}}><thead><tr><th>Company</th><th>Amount</th><th>Weeks</th></tr></thead><tbody>{bids.map(b=><tr key={b.id}><td>{b.companyName}</td><td>{b.amount}</td><td>{b.weeks}</td></tr>)}</tbody></table>}
        </section>
      )}

      {/* 底部流水线标注 */}

      {/* match confirm */}
      {order && (order.status === 'matched' || order.status === 'homeowner_confirmed' || order.status === 'company_confirmed') && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-title">
            <div className="accent-bar" />
            Match Confirmation
            <small>ORDER_{order.id}</small>
          </div>
          <div style={{ padding: '12px 0 14px', fontSize: 13 }}>
            <p style={{ color: 'var(--text-dim)' }}>
              Company: {matchedBid ? matchedBid.companyName : (order.companyId ? 'Company #' + order.companyId : '-')}
            </p>
            <p>Amount: {order.bidAmount ? 'Y' + order.bidAmount : '-'}   Weeks: {order.bidWeeks ?? '-'}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              {order.homeownerConfirmedAt ? (
                <span className="tag tag-green">Owner Confirmed</span>
              ) : (
                <button onClick={() => confirmSide('homeowner')} className="btn btn-primary">Confirm as Owner</button>
              )}
              {order.companyConfirmedAt ? (
                <span className="tag tag-green">Company Confirmed</span>
              ) : (
                <button onClick={() => confirmSide('company')} className="btn btn-ghost">Confirm as Company</button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* contract */}
      {order && (order.status === 'confirmed' || order.status === 'contracted') && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-title">
            <div className="accent-bar" />
            Contract
            <small>ORDER_{order.id}</small>
          </div>
          {contract ? (
            <div>
              <pre style={{ maxHeight: 300, overflow: 'auto', padding: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 10, fontSize: 12, whiteSpace: 'pre-wrap' }}>{contract.content}</pre>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                {contract.homeownerSigned === 1 ? (
                  <span className="tag tag-green">Owner Signed</span>
                ) : (
                  <button onClick={() => signContract('homeowner')} className="btn btn-primary">Sign as Owner</button>
                )}
                {contract.companySigned === 1 ? (
                  <span className="tag tag-green">Company Signed</span>
                ) : (
                  <button onClick={() => signContract('company')} className="btn btn-ghost">Sign as Company</button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Both parties confirmed. Generate contract to proceed.</p>
              <button onClick={generateContract} className="btn btn-primary" style={{ marginTop: 12 }}>Generate Contract</button>
            </div>
          )}
        </section>
      )}

      {/* billing */}
      {order && (order.status === 'confirmed' || order.status === 'contracted') && (
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(0,255,163,0.08)', border: '1px solid rgba(0,255,163,0.2)', fontSize: 12, color: 'var(--accent3)' }}>
          Platform fee is charged to the decoration company only. Homeowner pays nothing to the platform.
        </div>
      )}
      <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <span className="tag tag-cyan">STEP 01 识别→设计</span>
        <span className="tag tag-purple">STEP 02 报价→工期</span>
        <span className="tag tag-green">STEP 03 匹配→交付</span>
      </div>

      <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, marginTop: 20 }}>
        由 I Renovation 智能体团队驱动 · 每 2 秒刷新 · 生成结果供参考，最终以签约量房为准
      </p>
    </main>
  );
}