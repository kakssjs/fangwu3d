'use client';

import LeadHero, { openAuth } from './components/LeadHero';

const AGENT_FLOW = [
  { name: 'FloorPlan', label: '户型识别', body: '上传或手绘户型图，识别房间、面积与动线。' },
  { name: 'Designer', label: '二维设计', body: '按户型生成二维装修图：墙、门、窗与尺寸。' },
  { name: 'Render', label: '3D 建模', body: '同一份平面数据拉伸成可环绕查看的 3D 模型，并出各房间效果图。' },
  { name: 'Quote', label: '报价工期', body: '材料清单、报价与工期，逐项可核对。' },
  { name: 'Matcher', label: '装修队匹配', body: '业主确认发布后，装修公司投标，匹配智能体按资质与真实投标择优推荐。' },
];

const FEATURES = [
  { icon: '⬡', title: 'AI 户型识别', body: '上传户型图，AI 智能识别房间布局，自动计算面积与动线。' },
  { icon: '◈', title: '智能设计报价', body: 'AI 生成设计方案，自动计算报价与工期，全流程可视化。' },
  { icon: '⊞', title: '装修队匹配', body: '多家装修公司参与，业主择优签约，全程平台监管保障。' },
];

const GALLERY = [
  { src: '/images/gallery/modern-living.jpg', label: '现代简约', en: 'Modern' },
  { src: '/images/gallery/nordic-bedroom.jpg', label: '北欧风', en: 'Nordic' },
  { src: '/images/gallery/japanese-zen.jpg', label: '日式禅意', en: 'Zen' },
  { src: '/images/gallery/chinese-classic.jpg', label: '新中式', en: 'Chinese' },
  { src: '/images/gallery/industrial-kitchen.jpg', label: '工业风', en: 'Industrial' },
  { src: '/images/gallery/luxury-villa.jpg', label: '轻奢别墅', en: 'Luxury' },
  { src: '/images/gallery/french-elegant.jpg', label: '法式优雅', en: 'French' },
  { src: '/images/gallery/coastal-breeze.jpg', label: '地中海', en: 'Coastal' },
];

const BENEFITS = ['户型识别', '二维施工图', '3D 交互模型', '报价与工期', '装修队匹配'];

export default function Home() {
  return (
    <main>
      <LeadHero />

      <div className="landing-benefits">
        {BENEFITS.map((b, i) => (
          <span key={b}><b>0{i + 1}</b>{b}</span>
        ))}
      </div>

      <section className="home-section home-editorial">
        <p className="editorial-kicker">01 / THE I RENOVATION WAY</p>
        <h2>一张户型图，交给智能体团队</h2>
        <p className="lead">识别、设计、建模、报价、匹配，由六位数字员工分工接力；关键决定始终由你来做。</p>
      </section>

      <section className="home-section home-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <div className="ico-box" aria-hidden="true">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="home-section home-gallery">
        <div className="home-gallery-head">
          <div>
            <p className="editorial-kicker">02 / STYLES</p>
            <h2>你想要的样子</h2>
          </div>
          <p>八种常见风格。选一种开始，再在对话里改到满意。</p>
        </div>
        <div className="gallery-grid">
          {GALLERY.map((g) => (
            <figure key={g.src} className="gallery-item">
              <img src={g.src} alt={g.label} loading="lazy" />
              <figcaption><span>{g.label}</span><small>{g.en}</small></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="home-process">
        <p className="editorial-kicker">03 / CORE CHAIN</p>
        <h2>智能体流水线</h2>
        <ol className="steps-list">
          {AGENT_FLOW.map((s) => (
            <li key={s.name}>
              <span className="en">{s.name}</span>
              <strong>{s.label}</strong>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-section home-note">
        <h2>个人用户免费使用 AI 设计</h2>
        <p>户型识别、二维图、3D 模型、效果图与报价对业主免费；仅装潢公司在接单时付费。</p>
      </section>

      <section className="home-join">
        <p className="editorial-kicker">GET STARTED</p>
        <h2>装潢公司入驻，接到合适的单</h2>
        <p>提交执照与资质，经人工审核后即可参与业主发布的项目。</p>
        <div className="landing-actions">
          <button type="button" className="btn btn-light" onClick={() => openAuth('register')}>个人用户注册</button>
          <button type="button" className="btn btn-outline-light" onClick={() => openAuth('register')}>装潢公司入驻</button>
        </div>
      </section>

      <footer className="home-foot">I Renovation · JUNCTION CHINA 2026 · Xiaomi MiMo 赛道</footer>
    </main>
  );
}
