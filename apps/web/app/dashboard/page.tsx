'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NewProjectForm from '../components/NewProjectForm';
import { INTERIOR_IMAGES, projectImage } from '@/lib/visuals';

const DESIGN_FLOW = [
  { step: '01', label: '空间规划', note: '梳理户型、动线与生活需求' },
  { step: '02', label: '方案设计', note: '确定风格、尺度与空间关系' },
  { step: '03', label: '三维呈现', note: '预览家具、材质、灯光与空间' },
  { step: '04', label: '预算工期', note: '整理材料、费用与施工计划' },
  { step: '05', label: '交付审核', note: '复核布局、报价和设计完整性' },
];

const HOME_IMAGES = [INTERIOR_IMAGES.living, INTERIOR_IMAGES.livingWarm, INTERIOR_IMAGES.kitchen, INTERIOR_IMAGES.bedroom];

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
          <span className="role-kicker"><i /> 私宅设计中心 · {user.name}</span>
          <h1 className="role-title">让空间，回到生活本身</h1>
          <p className="role-subtitle">
            从户型规划、空间设计到材质搭配、预算工期与施工落地，每一个决定都清晰、克制、可执行。
          </p>
          <div className="role-actions">
            <a href="#new-project" className="btn btn-primary">创建装修项目</a>
            {projects[0] && <a href={'/project/' + projects[0].id} className="btn btn-ghost role-ghost-light">继续最近项目</a>}
          </div>
        </div>
      </section>

      <section className="editorial-gallery">
        <div className="editorial-shot" style={{ backgroundImage: `url("${INTERIOR_IMAGES.living}")` }}>
          <div className="editorial-caption"><b>自然光与安静秩序</b><span>Living / 01</span></div>
        </div>
        <div className="editorial-shot" style={{ backgroundImage: `url("${INTERIOR_IMAGES.kitchen}")` }}>
          <div className="editorial-caption"><b>日常动线</b><span>Kitchen / 02</span></div>
        </div>
        <div className="editorial-shot" style={{ backgroundImage: `url("${INTERIOR_IMAGES.bedroom}")` }}>
          <div className="editorial-caption"><b>舒适留白</b><span>Bedroom / 03</span></div>
        </div>
        <div className="editorial-shot" style={{ backgroundImage: `url("${INTERIOR_IMAGES.detail}")` }}>
          <div className="editorial-caption"><b>材质细节</b><span>Detail / 04</span></div>
        </div>
        <div className="editorial-shot" style={{ backgroundImage: `url("${INTERIOR_IMAGES.dining}")` }}>
          <div className="editorial-caption"><b>家庭交流</b><span>Dining / 05</span></div>
        </div>
      </section>

      <section className="role-stat-grid">
        <div className="role-stat-card"><strong>{projects.length}</strong><span>我的装修项目<br />户型、设计、报价与施工进度</span></div>
        <div className="role-stat-card"><strong>3D</strong><span>沉浸式空间预览<br />家具、材质、漫游与 Blender 导出</span></div>
        <div className="role-stat-card"><strong>全流程</strong><span>从设计到交付<br />规划、呈现、预算、审核</span></div>
      </section>

      <section>
        <div className="section-label"><h2>从构想到落地</h2><div className="line" /><span>完整设计流程</span></div>
        <div className="role-feature-grid">
          {DESIGN_FLOW.map(item => (
            <div className="role-feature-card" key={item.step}>
              <b>{item.step}</b>
              <h3>{item.label}</h3>
              <p>{item.note}</p>
            </div>
          ))}
          <div className="role-feature-card">
            <b>06</b>
            <h3>施工匹配</h3>
            <p>综合报价、工期、资质与风格专长，找到更适合的施工团队。</p>
          </div>
        </div>
      </section>

      <section>
        <div className="section-label"><h2>我的项目</h2><div className="line" /><span>我的空间</span></div>
        {projects.length === 0 ? (
          <div className="panel empty-state" style={{ padding: 34 }}>
            <p>还没有装修项目。创建第一个项目，系统将生成户型、三维空间与全屋设计方案。</p>
          </div>
        ) : (
          <div className="grid-3">
            {projects.map((p, index) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <a href={'/project/' + p.id} className="role-project-card" style={{ display: 'block', backgroundImage: `url("${projectImage(index + 1)}")` }}>
                  <div className="role-project-content">
                    <h3>{p.name}</h3>
                    <p>{p.style} · {p.stage >= 3 ? '施工匹配中' : '方案设计中'}</p>
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
                  <button className="btn btn-ghost" onClick={() => setDelId(p.id)} style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, padding: '4px 10px', color: '#fffdf8', background: 'rgba(27,36,42,.38)', borderColor: 'rgba(255,255,255,.22)' }}>
                    删除
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="new-project" style={{ marginTop: 38 }}>
        <div className="section-label"><h2>开始新的设计</h2><div className="line" /><span>空间需求</span></div>
        <div className="role-brief">
          <div className="role-brief-visual" style={{ backgroundImage: `url("${HOME_IMAGES[3]}")` }}>
            <div className="role-brief-copy">
              <h3>先描述你想要的生活</h3>
              <p>家庭成员、收纳需求、厨房形式、预算与风格偏好，都会成为设计团队的重要依据。</p>
            </div>
          </div>
          <div className="panel" style={{ padding: 26 }}>
            <div className="panel-title"><div className="accent-bar" />项目需求<small>居住 brief</small></div>
            <NewProjectForm />
          </div>
        </div>
      </section>
    </main>
  );
}
