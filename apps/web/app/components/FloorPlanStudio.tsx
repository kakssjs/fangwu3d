'use client';

// 户型图输入工作台：上传图片 / 画板手绘 → Agnes 标准平面图 → 3D
// 2D 与 3D 同源：画板上的房间矩形（或 AI 识别出的矩形）就是 3D 的几何事实源
// 框支持编辑：改名字、改大小（数值或拖拽角点/整体移动）
import { useCallback, useEffect, useRef, useState } from 'react';
import { planFromRects, type PlanGeometry, type RoomRect } from '@i-renovation/shared/plan';

export interface StudioRect {
  id: number;
  x: number; y: number; w: number; d: number; // 画布像素坐标
  name: string;
}

export interface StudioData {
  image?: string | null;      // 上传底图（dataURL）
  stdImage?: string | null;   // Agnes 标准平面图（url 或 dataURL）
  rects?: StudioRect[];
  strokes?: number[][][];     // 自由画笔折线
}

const CANVAS_W = 820;
const CANVAS_H = 560;
const M_PER_PX = 0.0125; // 80px ≈ 1m，无总面积时的默认比例
const NAME_CYCLE = ['客厅', '主卧', '次卧', '厨房', '卫生间', '阳台', '书房', '餐厅'];

/** 压缩到 ≤1024px 并比大小取 JPEG/PNG 小者（高频细节图 JPEG 可能更大） */
function compressCanvas(canvas: HTMLCanvasElement): string {
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const off = document.createElement('canvas');
  off.width = Math.round(canvas.width * scale);
  off.height = Math.round(canvas.height * scale);
  const ctx = off.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/jpeg', 0.82);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, off.width, off.height);
  ctx.drawImage(canvas, 0, 0, off.width, off.height);
  const jpeg = off.toDataURL('image/jpeg', 0.82);
  const png = off.toDataURL('image/png');
  return jpeg.length <= png.length ? jpeg : png;
}

type DragState =
  | { mode: 'pen'; pts: number[][] }
  | { mode: 'draw-rect'; startX: number; startY: number }
  | { mode: 'move'; id: number; offsetX: number; offsetY: number }
  | { mode: 'resize'; id: number; corner: 'tl' | 'tr' | 'bl' | 'br'; orig: StudioRect };

interface Props {
  projectId: number;
  totalArea?: number;
  initial?: StudioData | null;
  onApply?: (geometry: PlanGeometry | null) => void;
  onRooms?: (rects: StudioRect[]) => void;
  onStdImage?: (url: string | null) => void;
}

export default function FloorPlanStudio({ projectId, totalArea, initial, onApply, onRooms, onStdImage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef<DragState | null>(null);
  const nextId = useRef(1);
  const hydrated = useRef(false);

  const [tool, setTool] = useState<'rect' | 'pen'>('rect');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [rects, setRects] = useState<StudioRect[]>([]);
  const [strokes, setStrokes] = useState<number[][][]>([]);
  const [stdImage, setStdImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'agnes' | 'recognize' | 'apply' | 'save'>('');
  const [msg, setMsg] = useState('');

  // 恢复已保存的户型输入（仅一次，避免2s轮询冲掉编辑中状态）
  useEffect(() => {
    if (hydrated.current || !initial) return;
    hydrated.current = true;
    if (initial.image) setBgImage(initial.image);
    if (initial.stdImage) setStdImage(initial.stdImage);
    if (initial.rects?.length) {
      setRects(initial.rects);
      nextId.current = Math.max(...initial.rects.map(r => r.id)) + 1;
    }
    if (initial.strokes?.length) setStrokes(initial.strokes);
  }, [initial]);

  // 数据回调（父页面用于 房间渲染图 / Agent 施工图 展示）
  useEffect(() => { onRooms?.(rects); }, [rects, onRooms]);
  useEffect(() => { onStdImage?.(stdImage); }, [stdImage, onStdImage]);

  // 底图加载
  useEffect(() => {
    if (!bgImage) { bgImgRef.current = null; return; }
    const img = new Image();
    img.onload = () => { bgImgRef.current = img; redraw(); };
    img.src = bgImage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgImage]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fdfcf9';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (bgImgRef.current) {
      ctx.globalAlpha = 0.55;
      const img = bgImgRef.current;
      const s = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }

    // 自由画笔（手绘草图线条）
    ctx.strokeStyle = '#3a2e25';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pts of strokes) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }

    // 房间矩形 + 标签 + 角点手柄
    for (const r of rects) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
      ctx.strokeStyle = '#0aa2b8';
      ctx.lineWidth = 2.5;
      ctx.fillRect(r.x, r.y, r.w, r.d);
      ctx.strokeRect(r.x, r.y, r.w, r.d);
      const cx = r.x + r.w / 2, cy = r.y + r.d / 2;
      ctx.fillStyle = '#204048';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.name, cx, cy - 3);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#5b7a82';
      const mw = (r.w * M_PER_PX).toFixed(1), md = (r.d * M_PER_PX).toFixed(1);
      ctx.fillText(`${mw}×${md}m`, cx, cy + 14);
      // 四角手柄（可拖拽改大小）
      ctx.fillStyle = '#0aa2b8';
      for (const [hx, hy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.d], [r.x + r.w, r.y + r.d]]) {
        ctx.fillRect(hx - 4, hy - 4, 8, 8);
      }
    }
  }, [rects, strokes]);

  useEffect(() => { redraw(); }, [redraw]);

  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (CANVAS_W / rect.width),
      (e.clientY - rect.top) * (CANVAS_H / rect.height),
    ];
  }

  /** 命中测试：角点（改大小）优先，其次框内部（移动） */
  function hitRect(x: number, y: number): { r: StudioRect; corner?: 'tl' | 'tr' | 'bl' | 'br' } | null {
    const tol = 12;
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      const corners: [number, number, 'tl' | 'tr' | 'bl' | 'br'][] = [
        [r.x, r.y, 'tl'], [r.x + r.w, r.y, 'tr'], [r.x, r.y + r.d, 'bl'], [r.x + r.w, r.y + r.d, 'br'],
      ];
      for (const [cx, cy, corner] of corners) {
        if (Math.abs(x - cx) <= tol && Math.abs(y - cy) <= tol) return { r, corner };
      }
    }
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d) return { r };
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const [x, y] = canvasPos(e);
    if (tool === 'rect') {
      const hit = hitRect(x, y);
      if (hit?.corner) {
        drawing.current = { mode: 'resize', id: hit.r.id, corner: hit.corner, orig: { ...hit.r } };
      } else if (hit) {
        drawing.current = { mode: 'move', id: hit.r.id, offsetX: x - hit.r.x, offsetY: y - hit.r.y };
      } else {
        drawing.current = { mode: 'draw-rect', startX: x, startY: y };
      }
    } else {
      drawing.current = { mode: 'pen', pts: [[x, y]] };
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drawing.current;
    if (!d) return;
    const [x, y] = canvasPos(e);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    if (d.mode === 'pen') {
      d.pts.push([x, y]);
      redraw();
      ctx.strokeStyle = '#3a2e25';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(d.pts[d.pts.length - 2][0], d.pts[d.pts.length - 2][1]);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (d.mode === 'draw-rect') {
      redraw();
      ctx.strokeStyle = '#0aa2b8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(d.startX, d.startY, x - d.startX, y - d.startY);
      ctx.setLineDash([]);
    } else if (d.mode === 'move') {
      setRects(prev => prev.map(r => r.id === d.id
        ? { ...r, x: Math.max(0, Math.min(CANVAS_W - r.w, x - d.offsetX)), y: Math.max(0, Math.min(CANVAS_H - r.d, y - d.offsetY)) }
        : r));
    } else if (d.mode === 'resize') {
      const o = d.orig;
      const MIN = 20;
      setRects(prev => prev.map(r => {
        if (r.id !== d.id) return r;
        if (d.corner === 'br') return { ...r, w: Math.max(MIN, x - o.x), d: Math.max(MIN, y - o.y) };
        if (d.corner === 'tr') return { ...r, y: Math.min(y, o.y + o.d - MIN), w: Math.max(MIN, x - o.x), d: Math.max(MIN, o.y + o.d - y) };
        if (d.corner === 'bl') return { ...r, x: Math.min(x, o.x + o.w - MIN), w: Math.max(MIN, o.x + o.w - x), d: Math.max(MIN, y - o.y) };
        return { ...r, x: Math.min(x, o.x + o.w - MIN), y: Math.min(y, o.y + o.d - MIN), w: Math.max(MIN, o.x + o.w - x), d: Math.max(MIN, o.y + o.d - y) };
      }));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drawing.current;
    drawing.current = null;
    if (!d) return;
    const [x, y] = canvasPos(e);
    if (d.mode === 'pen') {
      if (d.pts.length > 1) setStrokes(prev => [...prev, d.pts]);
    } else if (d.mode === 'draw-rect') {
      const rx = Math.min(d.startX, x), ry = Math.min(d.startY, y);
      const rw = Math.abs(x - d.startX), rd = Math.abs(y - d.startY);
      if (rw > 12 && rd > 12) {
        const name = NAME_CYCLE[rects.length % NAME_CYCLE.length];
        setRects(prev => [...prev, { id: nextId.current++, x: rx, y: ry, w: rw, d: rd, name }]);
      }
    }
    redraw();
  }

  /** 修改房间框大小（数值编辑，单位米） */
  function resizeRect(id: number, dim: 'w' | 'd', meters: number) {
    const px = Math.max(20, Math.min(1200, meters / M_PER_PX));
    setRects(prev => prev.map(r => r.id === id ? { ...r, [dim]: px } : r));
  }

  function renameRect(id: number, name: string) {
    setRects(prev => prev.map(r => r.id === id ? { ...r, name } : r));
  }

  function onUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // 压缩到 ≤1024px 再入画布，避免超大 base64
        const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
        const off = document.createElement('canvas');
        off.width = Math.round(img.width * scale);
        off.height = Math.round(img.height * scale);
        off.getContext('2d')!.drawImage(img, 0, 0, off.width, off.height);
        setBgImage(off.toDataURL('image/jpeg', 0.85));
        setMsg('底图已加载 — 可直接「AI 识别房间」，或用矩形工具在图上框出房间');
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  /** 合成画布（底图+笔迹+矩形）用于 Agnes / MiMo */
  function composite(): HTMLCanvasElement {
    const off = document.createElement('canvas');
    off.width = CANVAS_W;
    off.height = CANVAS_H;
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const src = canvasRef.current;
    if (src) ctx.drawImage(src, 0, 0);
    return off;
  }

  async function genStandard() {
    setBusy('agnes');
    setMsg('');
    try {
      const dataUrl = compressCanvas(composite());
      const res = await fetch('/api/agnes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: '将这张户型草图重绘为标准建筑平面图：白色背景、黑色粗实线墙体、蓝色窗户线条、带开启弧线的门、灰色房间名称与面积标注，工程制图风格。严格保持参考图户型的布局、房间形状、比例和朝向不变，只重绘为标准制图风格，不增删房间。',
          size: '2K',
          ratio: '4:3',
          image: dataUrl,
        }),
      });
      const json = await res.json() as { url?: string; b64_json?: string; error?: string };
      const url = json.url ?? (json.b64_json ? `data:image/png;base64,${json.b64_json}` : null);
      if (!url) { setMsg('生成失败：' + (json.error ?? '未知错误')); return; }
      setStdImage(url);
      setMsg('标准平面图已生成 — 已放入「Agent 施工图」（AI 生成 · 尺寸以现场量房为准）');
    } catch {
      setMsg('网络错误，Agnes 生成失败');
    }
    setBusy('');
  }

  async function recognize() {
    setBusy('recognize');
    setMsg('');
    try {
      // 优先用标准平面图识别（更干净），否则用当前合成图
      const src = stdImage && stdImage.startsWith('data:') ? stdImage : compressCanvas(composite());
      const res = await fetch('/api/mimo/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: src }),
      });
      const json = await res.json() as { rooms?: { name: string; x: number; y: number; w: number; d: number }[]; error?: string };
      if (!json.rooms?.length) { setMsg('识别失败：' + (json.error ?? '未识别出房间')); return; }
      const mapped: StudioRect[] = json.rooms.map(r => ({
        id: nextId.current++,
        x: r.x * CANVAS_W, y: r.y * CANVAS_H,
        w: r.w * CANVAS_W, d: r.d * CANVAS_H,
        name: r.name,
      }));
      setRects(mapped);
      setMsg(`已识别 ${mapped.length} 个房间 — 可编辑名字/大小后生成渲染图与 3D`);
    } catch {
      setMsg('网络错误，识别失败');
    }
    setBusy('');
  }

  function applyTo3D() {
    if (rects.length === 0) { setMsg('请先框出或识别房间'); return; }
    setBusy('apply');
    try {
      // 像素 → 米：优先按申报总面积校准，否则默认 80px≈1m
      const pxArea = rects.reduce((s, r) => s + r.w * r.d, 0);
      const mPerPx = totalArea && totalArea > 10 && pxArea > 0
        ? Math.sqrt(totalArea / pxArea)
        : M_PER_PX;
      const rooms: RoomRect[] = rects.map(r => ({
        name: r.name,
        x: r.x * mPerPx, y: r.y * mPerPx,
        w: r.w * mPerPx, d: r.d * mPerPx,
      }));
      const geometry = planFromRects(rooms);
      onApply?.(geometry);
      setMsg(`已按此户型图生成 3D：开间 ${geometry.width}m × 进深 ${geometry.depth}m，${geometry.walls.length} 面墙${geometry.warnings.length ? `，${geometry.warnings.length} 条提示` : ''}`);
    } catch (err) {
      setMsg('3D 生成失败：' + (err as Error).message);
    }
    setBusy('');
  }

  async function save() {
    setBusy('save');
    setMsg('');
    try {
      await fetch(`/api/projects/${projectId}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'floorplan',
          upsert: true,
          content: {
            image: bgImage, stdImage, rects, strokes,
            savedAt: new Date().toISOString(),
            aiGenerated: true,
          },
        }),
      });
      setMsg('已保存户型输入');
    } catch {
      setMsg('保存失败');
    }
    setBusy('');
  }

  return (
    <div>
      {/* 工具条 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => fileRef.current?.click()}>
          ⬆ 上传户型图
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        <span style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)' }} />
        <button className={tool === 'rect' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 12, padding: '5px 12px' }}
          onClick={() => setTool('rect')}>▭ 框房间（可拖动/调角）</button>
        <button className={tool === 'pen' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 12, padding: '5px 12px' }}
          onClick={() => setTool('pen')}>✏ 手绘</button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
          onClick={() => { setStrokes(s => s.slice(0, -1)); setRects(r => r.slice(0, -1)); }}>↩ 撤销</button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
          onClick={() => { setStrokes([]); setRects([]); setBgImage(null); setStdImage(null); }}>✕ 清空</button>
      </div>

      {/* 画布 */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          width: '100%', maxWidth: CANVAS_W, borderRadius: 12, display: 'block',
          border: '1px solid rgba(0, 229, 255, 0.18)', cursor: 'crosshair',
          touchAction: 'none', background: '#fdfcf9',
        }}
      />

      {/* 房间清单：可编辑名字与大小 */}
      {rects.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {rects.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 8, background: 'rgba(0,229,255,0.08)', fontSize: 12, flexWrap: 'wrap',
            }}>
              <input
                value={r.name}
                onChange={e => renameRect(r.id, e.target.value)}
                style={{ width: 62, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 5, color: 'inherit', outline: 'none', padding: '2px 5px' }}
              />
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>宽</span>
              <input
                type="number" step="0.1" min="0.3"
                value={(r.w * M_PER_PX).toFixed(1)}
                onChange={e => resizeRect(r.id, 'w', Number(e.target.value) || 0.3)}
                style={{ width: 46, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 5, color: 'inherit', outline: 'none', padding: '2px 4px' }}
              />
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>深</span>
              <input
                type="number" step="0.1" min="0.3"
                value={(r.d * M_PER_PX).toFixed(1)}
                onChange={e => resizeRect(r.id, 'd', Number(e.target.value) || 0.3)}
                style={{ width: 46, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 5, color: 'inherit', outline: 'none', padding: '2px 4px' }}
              />
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>m</span>
              <button onClick={() => setRects(prev => prev.filter(x => x.id !== r.id))}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 动作 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button className="btn btn-primary" disabled={busy !== ''} onClick={() => void genStandard()}>
          {busy === 'agnes' ? 'Agnes 生成中…' : '✦ Agnes 生成标准平面图'}
        </button>
        <button className="btn btn-ghost" disabled={busy !== ''} onClick={() => void recognize()}>
          {busy === 'recognize' ? 'AI 识别中…' : '◎ AI 识别房间'}
        </button>
        <button className="btn btn-primary" disabled={busy !== ''} onClick={applyTo3D}>
          {busy === 'apply' ? '建模中…' : '▣ 按此图生成 3D'}
        </button>
        <button className="btn btn-ghost" disabled={busy !== ''} onClick={() => void save()}>
          {busy === 'save' ? '保存中…' : '保存'}
        </button>
      </div>

      {msg && (
        <p style={{ color: 'var(--accent)', fontSize: 12, marginTop: 10 }}>{msg}</p>
      )}
    </div>
  );
}
