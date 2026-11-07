'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProjectForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError('');
    const fd = new FormData(e.currentTarget);
    try {
      const u = JSON.parse(localStorage.getItem('user') ?? '{}');
      if (u?.id) fd.set('homeownerId', String(u.id));
    } catch {}
    const res = await fetch('/api/projects', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error ?? '提交失败'); return; }
    const { id } = await res.json();
    router.push(`/project/${id}`);
  }

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label>项目名称</label>
        <input name="name" required placeholder="如：张女士 89㎡ 全屋翻新" className="form-input" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group">
          <label>装修风格</label>
          <select name="style" className="form-input">
            {['现代简约', '北欧', '原木', '新中式', '轻奢', '工业风'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>建筑面积（㎡）</label>
          <input name="area" placeholder="89" className="form-input" />
        </div>
      </div>
      <div className="form-group">
        <label>预算（万元）</label>
        <input name="budget" placeholder="15-20" className="form-input" />
      </div>
      <div className="form-group">
        <label>装修需求</label>
        <textarea name="needs" rows={3} placeholder="三口之家，收纳要多，厨房想开放式……" className="form-input" />
      </div>
      <div className="form-group">
        <label>户型图上传</label>
        <input name="floorPlan" type="file" accept="image/*" className="form-input" />
      </div>
      <button disabled={busy} className="btn btn-primary" style={{ width: '100%' }}>
        {busy ? '⏳ 提交中…' : '⚡ 生成设计方案'}
      </button>
      {error && <p style={{ color: 'var(--accent-danger)', fontSize: 13, marginTop: 10 }}>{error}</p>}
      <p style={{ color: 'var(--text-dim)', fontSize: 11.5, marginTop: 14, lineHeight: 1.7 }}>
        提交后 Agent 流水线逐个执行：户型识别 → 二维设计 → 报价工期 → QA 质检；你确认发布后，装修公司投标，匹配智能体按真实投标匹配
      </p>
    </form>
  );
}
