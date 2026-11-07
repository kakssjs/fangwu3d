'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NewProjectForm from '../components/NewProjectForm';

// 核心链智能体逐个执行；匹配在「业主确认发布 + 装修公司投标（发布数据）」后单独触发
const AGENT_FLOW = [
  { icon: '⬡', name: 'FloorPlan', label: '户型识别' },
  { icon: '◈', name: 'Designer', label: '二维设计' },
  { icon: '◆', name: 'Render', label: '3D 建模' },
  { icon: '▤', name: 'Quote', label: '报价工期' },
  { icon: '✓', name: 'QA', label: '质检交付' },
];

type User = { id: number; role: string; name: string; companyName?: string };

export default function HomeownerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [projects, setProjects] = useState<{ id: number; name: string; style: string; stage: number }[]>([]);
  // 删除项目（两级确认，防误触）
  const [delId, setDelId] = useState<number | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw) as User;
        if (parsed && parsed.role === 'homeowner') setUser(parsed);
      }
    } catch {}
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch('/api/projects?homeownerId=' + user.id)
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setProjects(data as { id: number; name: string; style: string; stage: number }[]);
        }
      })
      .catch(() => {});
  }, [user]);

  // 删除项目：级联清理任务/结果/订单/投标/合同（两级确认后才调用）
  const confirmDelete = async (id: number) => {
    if (delBusy) return;
    setDelBusy(true);
    try {
      const res = await fetch('/api/projects/' + id, { method: 'DELETE' });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        setDelId(null);
      }
    } catch {
      /* ignore */
    }
    setDelBusy(false);
  };

  if (!authChecked) {
    return <main className="container"><div className="panel empty-state"><p>正在校验身份...</p></div></main>;
  }

  if (!user) {
    return (
      <main className="container" style={{ paddingTop: 32 }}>
        <div className="panel" style={{ maxWidth: 520, margin: '48px auto', textAlign: 'center' }}>
          <div className="panel-title"><div className="accent-bar" />需要登录</div>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '18px 0 22px' }}>
            请先登录个人装修账号，即可创建项目、使用 AI 智能体流水线。
          </p>
          <button onClick={() => router.push('/')} className="btn btn-primary">返回首页登录</button>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ paddingTop: 32 }}>
      <div className="section-label" style={{ marginTop: 0 }}>
        <h2>业主工作台</h2>
        <div className="line" />
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>HOMEOWNER CONSOLE</span>
      </div>

      <div className="pipeline" style={{ margin: '20px 0 10px' }}>
        {AGENT_FLOW.map((item, i) => (
          <div key={item.name} className={"pipeline-node " + (i === 0 ? 'done' : 'running')}>
            <div className="pipeline-icon">{item.icon}</div>
            <span>
              <b style={{ color: 'var(--accent)', fontSize: 11, fontFamily: 'var(--font-mono)', display: 'block' }}>{item.name}</b>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 11.5, margin: '0 0 32px', textAlign: 'center' }}>
        业主确认发布后 → 装修公司投标（发布数据）→ 匹配智能体「小桥」按真实投标匹配
      </p>

      {projects.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div className="section-label">
            <h2>我的项目</h2>
            <div className="line" />
          </div>
          <div className="grid-3">
            {projects.map(p => (
              <div key={p.id} style={{ position: 'relative' }}>
                <a href={'/project/' + p.id} className="action-card">
                  <div className="icon" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)' }}>⌂</div>
                  <h3>{p.name}</h3>
                  <p>{p.style} · {p.stage >= 3 ? '发布 · 竞标 · 匹配' : '智能体设计中'}</p>
                </a>
                {delId === p.id ? (
                  <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
                    <button
                      className="btn"
                      disabled={delBusy}
                      onClick={() => void confirmDelete(p.id)}
                      style={{ fontSize: 11, padding: '3px 10px', background: 'var(--bad-bg)', border: '1px solid #f1c4bf', color: 'var(--accent-danger)' }}
                    >
                      {delBusy ? '删除中…' : '确认删除'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setDelId(null)} style={{ fontSize: 11, padding: '3px 10px' }}>
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setDelId(p.id)}
                    style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, padding: '3px 10px', color: 'var(--text-dim)' }}
                  >
                    🗑 删除
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div id="new-project" className="section-label">
        <h2>启动智能体流水线</h2>
        <div className="line" />
      </div>
      <div className="panel" style={{ maxWidth: 620, margin: '0 auto' }}>
        <div className="panel-title">
          <div className="accent-bar" />
          项目需求录入
          <small>STEP 01 / 05</small>
        </div>
        <NewProjectForm />
      </div>
    </main>
  );
}
