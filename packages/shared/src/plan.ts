// 2D→3D 重建管线（参考 Blueprint3D：SplitFloor 认墙门窗 / SemaFloor 认房间 / ForgeFloor 清洗 / Extruder 拉伸）
// 本模块是纯函数的 TypeScript 重写：plan JSON（墙体/门/窗/房间矩形）是唯一事实源，
// 2D 装修图（planToSvg）与 3D 模型（Scene3D 拉伸）都从同一份几何生成，保证 2D/3D 一致。
import type { PlanRoom } from './price';

export type { PlanRoom } from './price';

export type OpeningType = 'door' | 'window';

/** 墙上的洞口：offset 为洞口中心距墙起点（x1,y1）的距离（米） */
export interface WallOpening {
  type: OpeningType;
  offset: number;
  width: number;   // 洞口宽（米）
  height: number;  // 洞口高（米）
  sill: number;    // 窗台高（门为 0）
}

export interface Wall {
  x1: number; y1: number; x2: number; y2: number; // 墙中心线两端（米，平面坐标 y 向下）
  thickness: number;  // 墙厚（米）
  height: number;     // 墙高（米）
  exterior: boolean;
  openings: WallOpening[];
}

export interface RoomGeom {
  name: string;
  area: number;       // 申报面积（㎡）
  x: number; y: number; w: number; d: number; // 外接矩形（米）
}

export interface PlanGeometry {
  unit: 'm';
  width: number;      // 开间（米）
  depth: number;      // 进深（米）
  wallHeight: number;
  walls: Wall[];
  rooms: RoomGeom[];
  warnings: string[]; // ForgeFloor 清洗告警
}

const EPS = 1e-3;
const eq = (a: number, b: number) => Math.abs(a - b) < EPS;

// ---------- SemaFloor：房间布局（slice & dice 矩形分割） ----------

interface Rect { x: number; y: number; w: number; d: number }

function sliceLayout(items: PlanRoom[], rect: Rect, out: RoomGeom[]) {
  if (items.length === 0) return;
  if (items.length === 1) {
    const r = items[0];
    out.push({ name: r.name, area: r.area, x: rect.x, y: rect.y, w: rect.w, d: rect.d });
    return;
  }
  const totalA = items.reduce((s, r) => s + r.area, 0);
  let acc = 0;
  let cut = 1;
  for (; cut < items.length; cut++) {
    if (acc + items[cut - 1].area >= totalA / 2) break;
    acc += items[cut - 1].area;
  }
  const g1 = items.slice(0, cut);
  const g2 = items.slice(cut);
  const f = g1.reduce((s, r) => s + r.area, 0) / totalA;
  if (rect.w >= rect.d) {
    const w1 = Math.round(rect.w * f * 1000) / 1000;
    sliceLayout(g1, { x: rect.x, y: rect.y, w: w1, d: rect.d }, out);
    sliceLayout(g2, { x: rect.x + w1, y: rect.y, w: rect.w - w1, d: rect.d }, out);
  } else {
    const d1 = Math.round(rect.d * f * 1000) / 1000;
    sliceLayout(g1, { x: rect.x, y: rect.y, w: rect.w, d: d1 }, out);
    sliceLayout(g2, { x: rect.x, y: rect.y + d1, w: rect.w, d: rect.d - d1 }, out);
  }
}

// ---------- SplitFloor：由房间矩形反推墙（合并共线边） ----------

interface EdgeRun {
  line: number;            // 水平墙的 y / 垂直墙的 x
  a: number; b: number;    // 线段区间 [a,b]
  horizontal: boolean;
  intervalsBelow: [number, number][]; // 墙上方/左侧房间的投影区间
  intervalsAbove: [number, number][]; // 墙下方/右侧房间的投影区间
}

function collectRuns(rooms: RoomGeom[], horizontal: boolean, extent: number): EdgeRun[] {
  const map = new Map<number, EdgeRun>();
  const key = (v: number) => Math.round(v * 1000) / 1000;
  for (const r of rooms) {
    const line = horizontal ? r.y : r.x;
    const line2 = horizontal ? r.y + r.d : r.x + r.w;
    const a = horizontal ? r.x : r.y;
    const b = horizontal ? r.x + r.w : r.y + r.d;
    for (const [ln, side] of [[line, 'below'], [line2, 'above']] as const) {
      const k = key(ln);
      let run = map.get(k);
      if (!run) { run = { line: k, a, b, horizontal, intervalsBelow: [], intervalsAbove: [] }; map.set(k, run); }
      run.a = Math.min(run.a, a); run.b = Math.max(run.b, b);
      (side === 'below' ? run.intervalsBelow : run.intervalsAbove).push([a, b]);
    }
  }
  return [...map.values()].sort((p, q) => p.line - q.line || p.a - q.a);
}

function overlapIntervals(xs: [number, number][], ys: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a1, b1] of xs) for (const [a2, b2] of ys) {
    const a = Math.max(a1, a2), b = Math.min(b1, b2);
    if (b - a > 0.2) out.push([a, b]);
  }
  return out.sort((p, q) => p[0] - q[0]);
}

function mergeIntervals(xs: [number, number][]): [number, number][] {
  const sorted = [...xs].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + EPS) last[1] = Math.max(last[1], iv[1]);
    else out.push([...iv] as [number, number]);
  }
  return out;
}

function overlapsAny(offset: number, width: number, list: WallOpening[]): boolean {
  return list.some(o => Math.abs(o.offset - offset) < (o.width + width) / 2 + 0.1);
}

// ---------- ForgeFloor：清洗与校验 ----------

function validate(plan: PlanGeometry): string[] {
  const w: string[] = [];
  const sumArea = plan.rooms.reduce((s, r) => s + r.w * r.d, 0);
  const declared = plan.rooms.reduce((s, r) => s + r.area, 0);
  if (declared > 0 && Math.abs(sumArea - declared) / declared > 0.08) {
    w.push(`房间矩形面积合计 ${sumArea.toFixed(1)}㎡ 与申报 ${declared.toFixed(1)}㎡ 相差较大，按申报面积比例校准`);
  }
  for (const r of plan.rooms) {
    if (r.w < 0.9 || r.d < 0.9) w.push(`房间「${r.name}」过窄（${r.w.toFixed(1)}×${r.d.toFixed(1)}m），尺寸以现场量房为准`);
    if (r.x < -EPS || r.y < -EPS || r.x + r.w > plan.width + EPS || r.y + r.d > plan.depth + EPS) {
      w.push(`房间「${r.name}」超出户型边界，已裁剪`);
    }
  }
  const doorCount = plan.walls.reduce((s, wl) => s + wl.openings.filter(o => o.type === 'door').length, 0);
  if (doorCount < plan.rooms.length - 1) w.push('部分房间未生成门洞，请人工复核动线');
  return w;
}

// ---------- 主入口：户型几何生成 ----------

/** SplitFloor → ForgeFloor：由房间矩形反推墙体/门窗并校验（布局与手绘两条入口共用） */
function buildStructure(roomsOut: RoomGeom[], width: number, depth: number, wallHeight: number): PlanGeometry {
  // SplitFloor：收集墙线
  const walls: Wall[] = [];
  for (const horizontal of [true, false]) {
    for (const run of collectRuns(roomsOut, horizontal, horizontal ? width : depth)) {
      const exterior = eq(run.line, 0) || eq(run.line, horizontal ? depth : width);
      const thickness = exterior ? 0.24 : 0.12;
      const wall: Wall = {
        x1: horizontal ? run.a : run.line, y1: horizontal ? run.line : run.a,
        x2: horizontal ? run.b : run.line, y2: horizontal ? run.line : run.b,
        thickness, height: wallHeight, exterior, openings: [],
      };

      if (!exterior) {
        // 内墙：两侧房间投影重叠处开门
        for (const [a, b] of overlapIntervals(run.intervalsBelow, run.intervalsAbove)) {
          const len = b - a;
          const width2 = Math.min(0.9, Math.max(0.75, len - 0.3));
          const offset = (a + b) / 2 - run.a;
          if (!overlapsAny(offset, width2, wall.openings)) {
            wall.openings.push({ type: 'door', offset, width: width2, height: 2.1, sill: 0 });
          }
        }
      } else {
        // 外墙：按房间投影开窗；最长外墙开一扇入户门
        for (const [a, b] of mergeIntervals([...run.intervalsBelow, ...run.intervalsAbove])) {
          const len = b - a;
          if (len >= 2.2) {
            const offset = (a + b) / 2 - run.a;
            const width2 = Math.min(1.5, len * 0.5);
            if (!overlapsAny(offset, width2, wall.openings)) {
              wall.openings.push({ type: 'window', offset, width: width2, height: 1.4, sill: 0.9 });
            }
          }
        }
      }
      walls.push(wall);
    }
  }

  // 入户门：最长的底部外墙中心开 1.0m 门
  const bottomWalls = walls.filter(w2 => w2.exterior && eq(w2.y1, depth) && eq(w2.y2, depth));
  const entrance = bottomWalls.sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1))[0];
  if (entrance) {
    const offset = (entrance.x2 - entrance.x1) / 2;
    if (!overlapsAny(offset, 1.0, entrance.openings)) {
      entrance.openings.push({ type: 'door', offset, width: 1.0, height: 2.2, sill: 0 });
    }
  }

  const plan: PlanGeometry = { unit: 'm', width, depth, wallHeight, walls, rooms: roomsOut, warnings: [] };
  plan.warnings = validate(plan);
  return plan;
}

export function generatePlanGeometry(rooms: PlanRoom[], opts: { totalArea?: number } = {}): PlanGeometry {
  const usable = rooms.filter(r => r.name && r.area > 0);
  const declared = usable.reduce((s, r) => s + r.area, 0);
  const total = opts.totalArea && opts.totalArea > 10 ? opts.totalArea : (declared || 89);

  // 开间:进深 ≈ 1.55（常见板楼）
  const width = Math.round(Math.sqrt(total * 1.55) * 10) / 10;
  const depth = Math.round((total / width) * 10) / 10;

  // 按面积从大到小排布（大房间优先切分，布局更稳）
  const sorted = [...usable].sort((a, b) => b.area - a.area);
  const roomsOut: RoomGeom[] = [];
  sliceLayout(sorted, { x: 0, y: 0, w: width, d: depth }, roomsOut);

  return buildStructure(roomsOut, width, depth, 2.8);
}

// ---------- 主入口 B：手绘/识别矩形 → 几何（保留用户给定的房间位置） ----------

/** 用户手绘或视觉识别得到的房间矩形（米；也可用任意单位，整体比例不变） */
export interface RoomRect {
  name: string;
  x: number; y: number; w: number; d: number;
  area?: number; // 申报面积（㎡），缺省用 w*d
}

export function planFromRects(rects: RoomRect[], opts: { wallHeight?: number } = {}): PlanGeometry {
  const usable = rects.filter(r => r.name && r.w > 0.3 && r.d > 0.3);
  if (usable.length === 0) throw new Error('缺少有效房间矩形');

  // 归一到左上角为原点，保留相对位置
  const minX = Math.min(...usable.map(r => r.x));
  const minY = Math.min(...usable.map(r => r.y));
  const roomsOut: RoomGeom[] = usable.map(r => {
    const w = Math.round(r.w * 1000) / 1000;
    const d = Math.round(r.d * 1000) / 1000;
    return {
      name: r.name,
      area: r.area && r.area > 0 ? r.area : Math.round(w * d * 10) / 10,
      x: r.x - minX, y: r.y - minY, w, d,
    };
  });
  const width = Math.round(Math.max(...roomsOut.map(r => r.x + r.w)) * 10) / 10;
  const depth = Math.round(Math.max(...roomsOut.map(r => r.y + r.d)) * 10) / 10;

  return buildStructure(roomsOut, width, depth, opts.wallHeight ?? 2.8);
}

// ---------- 2D 装修图（施工参考 SVG） ----------

const ROOM_FILL = ['#e8f4f2', '#fdeee3', '#eef0fa', '#f6eef8', '#eaf3e2', '#fbf3e0', '#e6f0fb', '#f9efe9'];

export function planToSvg(plan: PlanGeometry, style: string, projectName?: string): string {
  const s = Math.min(640 / plan.width, 460 / plan.depth); // px / 米
  const M = 56;
  const W = Math.round(plan.width * s + M * 2);
  const H = Math.round(plan.depth * s + M * 2);
  const px = (m: number) => m * s;
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#faf7f2">`);
  parts.push(`<text x="${M}" y="30" font-size="15" font-weight="700" fill="#3a2e25">AI 生成 · ${style} 二维装修图（施工参考）${projectName ? ' — ' + projectName : ''}</text>`);

  // 房间填充 + 标注
  plan.rooms.forEach((r, i) => {
    const x = M + px(r.x), y = M + px(r.y), w = px(r.w), d = px(r.d);
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${d.toFixed(1)}" fill="${ROOM_FILL[i % ROOM_FILL.length]}" stroke="none"/>`);
    const cx = x + w / 2, cy = y + d / 2;
    parts.push(`<text x="${cx.toFixed(1)}" y="${(cy - 4).toFixed(1)}" font-size="14" font-weight="600" fill="#4a3b2e" text-anchor="middle">${r.name}</text>`);
    parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + 14).toFixed(1)}" font-size="11" fill="#8a7460" text-anchor="middle">${r.area.toFixed(1)}㎡ · ${r.w.toFixed(1)}×${r.d.toFixed(1)}m</text>`);
  });

  // 墙体：有洞口处断开
  for (const wl of plan.walls) {
    const len = Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1);
    const sw = px(wl.thickness);
    const cuts: [number, number][] = [...wl.openings]
      .sort((a, b) => a.offset - b.offset)
      .map(o => [Math.max(0, o.offset - o.width / 2), Math.min(len, o.offset + o.width / 2)]);
    let cursor = 0;
    const segs: [number, number][] = [];
    for (const [a, b] of cuts) { if (a > cursor) segs.push([cursor, a]); cursor = Math.max(cursor, b); }
    if (cursor < len) segs.push([cursor, len]);
    for (const [a, b] of segs) {
      const t = a / len, u = b / len;
      parts.push(`<line x1="${(M + px(wl.x1 + (wl.x2 - wl.x1) * t)).toFixed(1)}" y1="${(M + px(wl.y1 + (wl.y2 - wl.y1) * t)).toFixed(1)}" x2="${(M + px(wl.x1 + (wl.x2 - wl.x1) * u)).toFixed(1)}" y2="${(M + px(wl.y1 + (wl.y2 - wl.y1) * u)).toFixed(1)}" stroke="#3a2e25" stroke-width="${sw.toFixed(1)}"/>`);
    }
    // 门窗画法
    for (const o of wl.openings) {
      const a = o.offset - o.width / 2, b = o.offset + o.width / 2;
      const pt = (t: number) => [M + px(wl.x1 + (wl.x2 - wl.x1) * (t / len)), M + px(wl.y1 + (wl.y2 - wl.y1) * (t / len))];
      const [ax, ay] = pt(a), [bx, by] = pt(b);
      if (o.type === 'window') {
        parts.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#7fa8c9" stroke-width="${(sw * 0.55).toFixed(1)}"/>`);
      } else {
        // 门：开启弧线
        const horiz = eq(wl.y1, wl.y2);
        const r = px(o.width);
        const sweep = horiz ? 1 : 0;
        parts.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${(ay + r).toFixed(1)}" stroke="#b98a5e" stroke-width="2"/>`);
        parts.push(`<path d="M ${ax.toFixed(1)} ${(ay + r).toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${sweep} ${bx.toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="#d8b892" stroke-width="1.5" stroke-dasharray="4 3"/>`);
      }
    }
  }

  // 外轮廓尺寸
  parts.push(`<text x="${(M + px(plan.width) / 2).toFixed(1)}" y="${(M + px(plan.depth) + 26).toFixed(1)}" font-size="11" fill="#8a7460" text-anchor="middle">开间 ${plan.width.toFixed(1)} m</text>`);
  parts.push(`<text x="22" y="${(M + px(plan.depth) / 2).toFixed(1)}" font-size="11" fill="#8a7460" text-anchor="middle" transform="rotate(-90 22 ${(M + px(plan.depth) / 2).toFixed(1)})">进深 ${plan.depth.toFixed(1)} m</text>`);
  parts.push(`<text x="${W - M}" y="${H - 14}" font-size="10" fill="#a89a88" text-anchor="end">AI 生成 · 尺寸为示意，以现场量房为准</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}
