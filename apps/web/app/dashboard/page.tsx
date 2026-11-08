'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NewProjectForm from '../components/NewProjectForm';

const AGENT_FLOW = [
  { icon: '⌂', name: 'FloorPlan', label: '户型识别', note: '读取户型、房间与门窗' },
  { icon: '◇', name: 'Designer', label: '方案设计', note: '风格、布局与空间关系' },
  { icon: '◉', name: '3D Studio', label: '3D 建模', note: '家具、材质与漫游' },
  { icon: '¥', name: 'Quote', label: '报价工期', note: '材料清单与施工排期' },
  { icon: '✓', name: 'QA', label: '质检交付', note: '布局、图片与报价核验' },
];

const HOME_IMAGES = [
  'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1800&q=88',
  'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=86',
  'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=86',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=86',
];

type User = { id: number; role: string; name: string; companyName?: string };
type ProjectCard = { id: number; name: string; style: string; stage: number };

export default function HomeownerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
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
        if (Array.isArray(data)) setProjects(data as ProjectCard[]);
      })
      .catch(() => {});
  }, [user]);

  const confirmDelete = async (id: number) => {
    if (delBusy) return;
    setDelBusy(true);
    try {
      const res = await fetch('/api/projects/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || '删除失败');
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        setDelId(null);
      }
    } catch (error) { window.alert(error instanceof Error ? error.message : '删除失败，请重试'); }
    setDelBusy(false);
  };

  if (!authChecked) {
    return <main className="container"><div className="panel empty-state"><p>正在准备你的设计空间...</p></div></main>;
  }

  if (!user) {
    return (
      <main className="container" style={{ paddingTop: 32 }}>
        <div className="role-hero" style={{ backgroundImage: `url("${HOME_IMAGES[0]}")` }}>
          <div className="role-hero-content">
            <span className="role-kicker"><i /> HOMEOWNER STUDIO</span>
            <h1 className="role-title">请先登录，继续打造你的理想家</h1>
            <p className="role-subtitle">登录后即可创建装修项目，使用户型识别、3D 设计、报价工期与装修队匹配。</p>
            <div className="role-actions">
              <button onClick={() => router.push('/')} className="btn btn-primary">返回首页登录</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ paddingTop: 24 }}>
      <section className="role-hero" style={{ backgroundImage: `url("${HOME_IMAGES[0]}")` }}>
        <div className="role-hero-content">
          <span className="role-kicker"><i /> HOMEOWNER STUDIO · {user.name}</span>
          <h1 className="role-title">把理想家，变成可执行的设计方案</h1>
          <p className="role-subtitle">
            从户型识别到 3D 空间、材质搭配、预算工期和装修队匹配，所有设计决策都在同一个项目空间里完成。
          </p>
          <div className="role-actions">
            <a href="#new-project" className="btn btn-primary">创建装修项目</a>
            {projects[0] && <a href={'/project/' + projects[0].id} className="btn btn-ghost role-ghost-light">继续最近项目</a>}
          </div>
        </div>
      </section>

      <section className="role-stat-grid">
        <div className="role-stat-card"><strong>{projects.length}</strong><span>我的装修项目<br />户型、设计、报价与施工进度</span></div>
        <div className="role-stat-card"><strong>3D</strong><span>沉浸式空间预览<br />家具、材质、漫游与 Blender 导出</span></div>
        <div className="role-stat-card"><strong>AI × 5</strong><span>设计智能体协作<br />识别、设计、渲染、报价、质检</span></div>
      </section>

      <section>
        <div className="section-label"><h2>你的专属设计流水线</h2><div className="line" /><span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>DESIGN PIPELINE</span></div>
        <div className="role-feature-grid">
          {AGENT_FLOW.map(item => (
            <div className="role-feature-card" key={item.name}>
              <b>{item.icon} &nbsp; {item.name}</b>
              <h3>{item.label}</h3>
              <p>{item.note}</p>
            </div>
          ))}
          <div className="role-feature-card">
            <b>↗ &nbsp; MATCH</b>
            <h3>装修队匹配</h3>
            <p>根据真实报价、工期、资质与风格专长推荐施工团队。</p>
          </div>
        </div>
      </section>

      <section>
        <div className="section-label"><h2>我的项目</h2><div className="line" /><span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>MY PROJECTS</span></div>
        {projects.length === 0 ? (
          <div className="panel empty-state" style={{ padding: 34 }}>
            <p>还没有装修项目。创建第一个项目，AI 将生成户型、3D 与全屋设计方案。</p>
          </div>
        ) : (
          <div className="grid-3">
            {projects.map((p, index) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <a href={'/project/' + p.id} className="role-project-card" style={{ display: 'block', backgroundImage: `url("${HOME_IMAGES[(index % 3) + 1]}")` }}>
                  <div className="role-project-content">
                    <h3>{p.name}</h3>
                    <p>{p.style} · {p.stage >= 3 ? '发布 · 竞标 · 匹配' : 'AI 设计进行中'}</p>
                  </div>
                </a>
                {delId === p.id ? (
                  <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
                    <button className="btn" disabled={delBusy} onClick={() => void confirmDelete(p.id)} style={{ fontSize: 11, padding: '4px 10px', background: 'var(--bad-bg)', border: '1px solid #f1c4bf', color: 'var(--accent-danger)' }}>
                      {delBusy ? '删除中…' : '确认删除'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setDelId(null)} style={{ fontSize: 11, padding: '4px 10px' }}>取消</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost" onClick={() => setDelId(p.id)} style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, padding: '4px 10px', color: '#fffdf8', background: 'rgba(18,31,25,.38)', borderColor: 'rgba(255,255,255,.22)' }}>
                    删除
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="new-project" style={{ marginTop: 38 }}>
        <div className="section-label"><h2>开始新的设计</h2><div className="line" /><span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>NEW PROJECT</span></div>
        <div className="role-brief">
          <div className="role-brief-visual" style={{ backgroundImage: `url("${HOME_IMAGES[3]}")` }}>
            <div className="role-brief-copy">
              <h3>先描述你想要的生活</h3>
              <p>家庭成员、收纳需求、厨房形式、预算与风格偏好，都会成为 AI 设计师的依据。</p>
            </div>
          </div>
          <div className="panel" style={{ padding: 26 }}>
            <div className="panel-title"><div className="accent-bar" />项目需求录入<small>HOME BRIEF · 01</small></div>
            <NewProjectForm />
          </div>
        </div>
      </section>
    </main>
  );
}
