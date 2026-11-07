'use client';

import LeadHero from './components/LeadHero';

const AGENT_FLOW = [
  { icon: '⬡', name: 'FloorPlan', label: '户型识别' },
  { icon: '◈', name: 'Designer', label: '二维设计' },
  { icon: '◆', name: 'Render', label: '3D 建模' },
  { icon: '▤', name: 'Quote', label: '报价工期' },
  { icon: '⊞', name: 'Matcher', label: '装修队匹配' },
];

export default function Home() {
  return (
    <main>
      <LeadHero />

      <div className="container">
        <div className="section-label">
          <h2>智能体流水线</h2>
          <div className="line" />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            CORE_CHAIN v1.0
          </span>
        </div>
        <div className="pipeline">
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

        <div className="grid-3" style={{ marginTop: 32 }}>
          <div className="action-card fade-up">
            <div className="icon" style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid var(--border)' }}>⬡</div>
            <h3>AI 户型识别</h3>
            <p>上传户型图，AI 智能识别房间布局，自动计算面积与动线</p>
          </div>
          <div className="action-card fade-up">
            <div className="icon" style={{ background: 'rgba(108,92,231,0.1)', border: '1px solid rgba(108,92,231,0.2)' }}>◈</div>
            <h3>智能设计报价</h3>
            <p>AI 生成设计方案，自动计算报价与工期，全流程可视化</p>
          </div>
          <div className="action-card fade-up">
            <div className="icon" style={{ background: 'rgba(0,255,163,0.1)', border: '1px solid rgba(0,255,163,0.2)' }}>⊞</div>
            <h3>装修队匹配</h3>
            <p>多家装修公司竞价，业主择优签约，全程平台监管保障</p>
          </div>
        </div>

        <div className="section-label" style={{ marginTop: 56, marginBottom: 24 }}>
          <h2>如何开始</h2>
          <div className="line" />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            GET STARTED
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button data-auth="register" onClick={() => document.querySelector<HTMLButtonElement>('[data-auth="register"]')?.click()} className="btn btn-primary" style={{ fontSize: 14, padding: '12px 28px' }}>
            个人用户注册
          </button>
          <button data-auth="register" onClick={() => document.querySelector<HTMLButtonElement>('[data-auth="register"]')?.click()} className="btn btn-ghost" style={{ fontSize: 14, padding: '12px 28px' }}>
            装潢公司入驻
          </button>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, marginTop: 16 }}>
          个人用户免费使用 AI 设计 · 仅装潢公司付费接单
        </p>
      </div>
    </main>
  );
}
