'use client';

// 户型图输入工作台：上传图片 / 画板手绘 → Agnes 标准平面图 → 3D
// 2D 与 3D 同源：画板上的房间矩形（或 AI 识别出的矩形）就是 3D 的几何事实源
// 框支持编辑：改名字、改大小（数值或拖拽角点/整体移动）
import { useCallback, useEffect, useRef, useState } from 'react';
import { planFromRects, type OpeningHint, type PlanGeometry, type RoomRect } from '@i-renovation/shared/plan';

export interface StudioRect {
  id: number;
  x: number; y: number; w: number; d: number; // 画布像素坐标
  name: string;
  openings?: OpeningHint[]; // 从户型图识别出的门窗（位置按比例，缩放后仍有效）
}

export interface StudioData {
  image?: string | null;      // 上传底图（dataURL）
  stdImage?: string | null;   // Agnes 标准平面图（url 或 dataURL）
  rects?: StudioRect[];
  strokes?: number[][][];     // 自由画笔折线
}

/** 画布矩形 → 米制几何：优先按申报总面积校准，否则默认 80px≈1m。3D 建模与房间渲染图共用，保证尺寸一致。 */
export function geometryFromStudioRects(rects: StudioRect[], totalArea?: number): PlanGeometry {
  const pxArea = rects.reduce((s, r) => s + r.w * r.d, 0);
  const mPerPx = totalArea && totalArea > 10 && pxArea > 0
    ? Math.sqrt(totalArea / pxArea)
    : M_PER_PX;
  const rooms: RoomRect[] = rects.map(r => ({
    name: r.name,
    x: r.x * mPerPx, y: r.y * mPerPx,
    w: r.w * mPerPx, d: r.d * mPerPx,
    openings: r.openings,
  }));
  return planFromRects(rooms);
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

const SIDE_LABEL: Record<OpeningHint['side'], string> = { N: '上', E: '右', S: '下', W: '左' };

/** 门窗在画布上的线段：沿所在的边，长度按宽度比例（至少 14px 才看得见） */
function openingSegment(r: StudioRect, h: OpeningHint) {
  const horizontal = h.side === 'N' || h.side === 'S';
  const start = horizontal ? r.x : r.y;
  const span = horizontal ? r.w : r.d;
  const len = Math.max(14, h.size * span);
  const center = start + h.pos * span;
  const a = Math.max(start, center - len / 2), b = Math.min(start + span, center + len / 2);
  const line = h.side === 'N' ? r.y : h.side === 'S' ? r.y + r.d : h.side === 'W' ? r.x : r.x + r.w;
  return horizontal ? { x1: a, y1: line, x2: b, y2: line } : { x1: line, y1: a, x2: line, y2: b };
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
  const [activeOpening, setActiveOpening] = useState<{ id: number; idx: number } | null>(null);

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
    ctx.fillStyle = '#fafaf8';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // 蓝图网格：淡而克制，仅作制图参照
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(51, 78, 93, 0.055)';
    ctx.beginPath();
    for (let gx = 41; gx < CANVAS_W; gx += 41) { ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, CANVAS_H); }
    for (let gy = 40; gy < CANVAS_H; gy += 40) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(CANVAS_W, gy + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(51, 78, 93, 0.12)';
    ctx.strokeRect(0.5, 0.5, CANVAS_W - 1, CANVAS_H - 1);

    if (bgImgRef.current) {
      ctx.globalAlpha = 0.55;
      const img = bgImgRef.current;
      const s = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }

    // 自由画笔（手绘草图线条）
    ctx.strokeStyle = '#252a2e';
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
      ctx.fillStyle = 'rgba(51, 78, 93, 0.10)';
      ctx.strokeStyle = '#334e5d';
      ctx.lineWidth = 2.5;
      ctx.fillRect(r.x, r.y, r.w, r.d);
      ctx.strokeRect(r.x, r.y, r.w, r.d);
      const cx = r.x + r.w / 2, cy = r.y + r.d / 2;
      ctx.fillStyle = '#252a2e';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.name, cx, cy - 3);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#8d7f78';
      const mw = (r.w * M_PER_PX).toFixed(1), md = (r.d * M_PER_PX).toFixed(1);
      ctx.fillText(`${mw}×${md}m`, cx, cy + 14);
      // 四角手柄（可拖拽改大小）
      ctx.fillStyle = '#334e5d';
      for (const [hx, hy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.d], [r.x + r.w, r.y + r.d]]) {
        ctx.fillRect(hx - 4, hy - 4, 8, 8);
      }
    }

    // 门窗：蓝色是窗，橙色是门；列表里指向某一项时加红色外框
    ctx.lineCap = 'butt';
    for (const r of rects) {
      (r.openings ?? []).forEach((h, i) => {
        const seg = openingSegment(r, h);
        if (activeOpening && activeOpening.id === r.id && activeOpening.idx === i) {
          ctx.strokeStyle = '#b0564c';
          ctx.lineWidth = 12;
          ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
        }
        ctx.strokeStyle = h.type === 'window' ? '#4a7fa5' : '#b07b46';
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
      });
    }
  }, [rects, strokes, activeOpening]);

  useEffect(() => { redraw(); }, [redraw]);

  /** 修改某个房间的门窗列表（识别结果可能有误，用户可检查、改、删、加） */
  function editOpenings(id: number, fn: (list: OpeningHint[]) => OpeningHint[]) {
    setRects(prev => prev.map(r => (r.id === id ? { ...r, openings: fn(r.openings ?? []) } : r)));
  }

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
      ctx.strokeStyle = '#252a2e';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(d.pts[d.pts.length - 2][0], d.pts[d.pts.length - 2][1]);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (d.mode === 'draw-rect') {
      redraw();
      ctx.strokeStyle = '#334e5d';
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
      const json = await res.json() as { rooms?: { name: string; x: number; y: number; w: number; d: number; openings?: OpeningHint[] }[]; runs?: number; error?: string };
      if (!json.rooms?.length) { setMsg('识别失败：' + (json.error ?? '未识别出房间')); return; }
      const mapped: StudioRect[] = json.rooms.map(r => ({
        id: nextId.current++,
        x: r.x * CANVAS_W, y: r.y * CANVAS_H,
        w: r.w * CANVAS_W, d: r.d * CANVAS_H,
        name: r.name,
        openings: r.openings,
      }));
      setRects(mapped);
      const openingCount = mapped.reduce((n, r) => n + (r.openings?.length ?? 0), 0);
      const doubtful = mapped.reduce((n, r) => n + (r.openings ?? []).filter(o => o.conf !== undefined && o.conf < 1).length, 0);
      setMsg(`已识别 ${mapped.length} 个房间、${openingCount} 处门窗（${json.runs && json.runs > 1 ? `${json.runs} 次识别取多数一致` : '仅 1 次识别，未经互相印证'}）`
        + (doubtful ? `，其中 ${doubtful} 处只有部分识别看到、标了「待核对」，请对照图纸检查` : '')
        + ' — 可编辑名字/大小后生成渲染图与 3D');
    } catch {
      setMsg('网络错误，识别失败');
    }
    setBusy('');
  }

  function applyTo3D() {
    if (rects.length === 0) { setMsg('请先框出或识别房间'); return; }
    setBusy('apply');
    try {
      const geometry = geometryFromStudioRects(rects, totalArea);
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
      {/* 工具条：安静的建筑制图工具栏 */}
      <div className="studio-toolbar">
        <button type="button" className="studio-btn" onClick={() => fileRef.current?.click()}>
          ↑ 上传户型图
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        <span className="studio-divider" />
        <div className="studio-segment" role="group" aria-label="绘图工具">
          <button type="button" className={tool === 'rect' ? 'studio-seg active' : 'studio-seg'}
            aria-pressed={tool === 'rect'} onClick={() => setTool('rect')}>框选房间</button>
          <button type="button" className={tool === 'pen' ? 'studio-seg active' : 'studio-seg'}
            aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}>手绘草图</button>
        </div>
        <span className="studio-divider" />
        <button type="button" className="studio-btn"
          onClick={() => { setStrokes(s => s.slice(0, -1)); setRects(r => r.slice(0, -1)); }}>撤销</button>
        <button type="button" className="studio-btn"
          onClick={() => { setStrokes([]); setRects([]); setBgImage(null); setStdImage(null); }}>清空</button>
        <span className="studio-hint">
          {tool === 'rect' ? '拖拽框选房间，可整体移动或拖动四角调整' : '按住鼠标沿墙绘制草图线条'}
        </span>
      </div>

      {/* 画布：蓝图网格 + 空状态引导 */}
      <div className="studio-canvas-wrap" style={{ maxWidth: CANVAS_W }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="studio-canvas"
          style={{ cursor: 'crosshair', touchAction: 'none' }}
        />
        {!bgImage && rects.length === 0 && strokes.length === 0 && (
          <div className="studio-empty">
            <svg width="76" height="76" viewBox="0 0 76 76" fill="none" aria-hidden="true">
              <rect x="8.5" y="13.5" width="59" height="49" rx="2.5" stroke="#c7cfd3" strokeWidth="1" />
              <path d="M8.5 34.5h26v28M34.5 13.5v21M34.5 34.5h33" stroke="#c7cfd3" strokeWidth="1" />
              <circle cx="34.5" cy="34.5" r="2.8" fill="#8d7f78" />
              <path d="M19 23h7M50 49h9" stroke="#8d7f78" strokeWidth="1" strokeLinecap="round" />
            </svg>
            <h4>上传户型图，或直接框选房间</h4>
            <p>支持 JPG / PNG 原始户型图，识别后可微调房间与门窗；<br />也可以在画布上按住拖拽，手动框出每个空间。</p>
          </div>
        )}
      </div>

      {/* 房间清单：可编辑名字与大小 */}
      {rects.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {rects.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 8, background: 'var(--accent-soft)', fontSize: 12, flexWrap: 'wrap',
            }}>
              <input
                value={r.name}
                onChange={e => renameRect(r.id, e.target.value)}
                style={{ width: 62, background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 5, color: 'inherit', outline: 'none', padding: '2px 5px' }}
              />
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>宽</span>
              <input
                type="number" step="0.1" min="0.3"
                value={(r.w * M_PER_PX).toFixed(1)}
                onChange={e => resizeRect(r.id, 'w', Number(e.target.value) || 0.3)}
                style={{ width: 46, background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 5, color: 'inherit', outline: 'none', padding: '2px 4px' }}
              />
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>深</span>
              <input
                type="number" step="0.1" min="0.3"
                value={(r.d * M_PER_PX).toFixed(1)}
                onChange={e => resizeRect(r.id, 'd', Number(e.target.value) || 0.3)}
                style={{ width: 46, background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 5, color: 'inherit', outline: 'none', padding: '2px 4px' }}
              />
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>m</span>
              <button onClick={() => setRects(prev => prev.filter(x => x.id !== r.id))}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 门窗：识别结果，可检查和修改 */}
      {rects.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            门窗 <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>
              · 图上蓝色是窗、橙色是门。AI 识别可能有错，请对照图纸检查，多的删掉、缺的补上
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 10 }}>
            {rects.map(r => (
              <div key={r.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--accent-soft)', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <b>{r.name}</b>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => editOpenings(r.id, l => [...l, { type: 'window', side: 'N', pos: 0.5, size: 0.25 }])}>+ 窗</button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => editOpenings(r.id, l => [...l, { type: 'door', side: 'S', pos: 0.5, size: 0.15 }])}>+ 门</button>
                </div>
                {(r.openings ?? []).length === 0 && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>没有门窗记录</div>
                )}
                {(r.openings ?? []).map((h, i) => {
                  const spanM = (h.side === 'N' || h.side === 'S' ? r.w : r.d) * M_PER_PX;
                  // 用户改过就算确认了；conf 缺省表示可信
                  const set = (patch: Partial<OpeningHint>) => editOpenings(r.id, l => l.map((o, j) => (j === i ? { ...o, ...patch, conf: 1 } : o)));
                  const doubtful = h.conf !== undefined && h.conf < 1;
                  return (
                    <div key={i}
                      onMouseEnter={() => setActiveOpening({ id: r.id, idx: i })}
                      onMouseLeave={() => setActiveOpening(null)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                      {doubtful ? (
                        <button type="button" title="只有部分识别看到了这一处。点这里表示已对照图纸确认"
                          onClick={() => set({})}
                          style={{ background: 'var(--warn-bg)', border: '1px solid #f0d9a4', color: 'var(--accent-warn)', borderRadius: 5, fontSize: 10, padding: '1px 5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>待核对 ✓</button>
                      ) : null}
                      <select value={h.type} onChange={e => set({ type: e.target.value as OpeningHint['type'] })}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 5, padding: '2px 3px' }}>
                        <option value="window">窗</option>
                        <option value="door">门</option>
                      </select>
                      <select value={h.side} onChange={e => set({ side: e.target.value as OpeningHint['side'] })}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 5, padding: '2px 3px' }}>
                        {(['N', 'E', 'S', 'W'] as const).map(sd => <option key={sd} value={sd}>{SIDE_LABEL[sd]}墙</option>)}
                      </select>
                      <input type="range" min={0} max={100} value={Math.round(h.pos * 100)}
                        onChange={e => set({ pos: Number(e.target.value) / 100 })}
                        style={{ flex: 1, minWidth: 60 }} aria-label="沿墙位置" />
                      <input type="number" step="0.1" min="0.4" max="2.4"
                        value={(h.size * spanM).toFixed(1)}
                        onChange={e => set({ size: Math.min(0.9, Math.max(0.05, (Number(e.target.value) || 0.4) / spanM)) })}
                        style={{ width: 44, background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 5, padding: '2px 4px' }} />
                      <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>m</span>
                      <button type="button" aria-label="删除这个门窗"
                        onClick={() => { editOpenings(r.id, l => l.filter((_, j) => j !== i)); setActiveOpening(null); }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 8 }}>
            只要有一处门窗记录，3D 和渲染图就以这里的记录为准；全部删光则按规则自动开门窗。改完后点「保存」，再点「按此图生成 3D」。
          </p>
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

