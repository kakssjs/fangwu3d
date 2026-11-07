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

/**
 * 从户型图识别出的门窗提示。side 是房间的哪条边（图上 N=上 E=右 S=下 W=左）；
 * pos 是洞口中心沿该边的位置 0~1（N/S 边自左向右，E/W 边自上向下）；
 * size 是洞口宽度占该边长度的比例。与尺寸无关，房间缩放后仍然有效。
 */
export interface OpeningHint {
  type: OpeningType;
  side: 'N' | 'E' | 'S' | 'W';
  pos: number;
  size: number;
  /** 识别的把握 0~1：几次识别里有几次都看到了它。1 或没有这个字段表示可信（多次一致，或用户已确认）。 */
  conf?: number;
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

// ---------- 按识别出的门窗开洞 ----------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 把一个识别出的门窗放到对应的墙上；放不下或没有对应的墙时返回告警文字。 */
function placeHint(walls: Wall[], room: RoomGeom, h: OpeningHint): string | null {
  const horizontal = h.side === 'N' || h.side === 'S';
  const line = h.side === 'N' ? room.y : h.side === 'S' ? room.y + room.d : h.side === 'W' ? room.x : room.x + room.w;
  const span = horizontal ? room.w : room.d;
  const center = (horizontal ? room.x : room.y) + clamp(h.pos, 0, 1) * span;

  // 这条边上最近的、盖住洞口中心的墙
  let best: Wall | null = null;
  let bestDist = 0.35;
  for (const w of walls) {
    if (horizontal ? !eq(w.y1, w.y2) : !eq(w.x1, w.x2)) continue;
    const a = horizontal ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2);
    const b = horizontal ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2);
    if (center < a - EPS || center > b + EPS) continue;
    const dist = Math.abs((horizontal ? w.y1 : w.x1) - line);
    if (dist <= bestDist) { best = w; bestDist = dist; }
  }
  const label = `「${room.name}」${h.type === 'window' ? '窗' : '门'}`;
  if (!best) return `${label}找不到对应的墙，已忽略`;

  if (h.type === 'window' && !best.exterior) return `${label}落在内墙上，已忽略`;
  const len = Math.hypot(best.x2 - best.x1, best.y2 - best.y1);
  const width = h.type === 'window' ? clamp(h.size * span, 0.6, 2.4) : clamp(h.size * span, 0.7, 1.2);
  if (len < width + 0.1) return `${label}比墙还宽，已忽略`;
  const start = horizontal ? Math.min(best.x1, best.x2) : Math.min(best.y1, best.y2);
  const offset = clamp(center - start, width / 2 + 0.05, len - width / 2 - 0.05);
  // 相邻房间共用的门两边都会识别到，重叠的只开一次；同一面墙上 1.5 米内的两扇门按一扇处理（识别常把一扇门认成两扇）
  if (overlapsAny(offset, width, best.openings)) return null;
  if (h.type === 'door' && best.openings.some(o => o.type === 'door' && Math.abs(o.offset - offset) < 1.5)) return null;
  best.openings.push(h.type === 'window'
    ? { type: 'window', offset, width, height: 1.4, sill: 0.9 }
    : { type: 'door', offset, width, height: 2.1, sill: 0 });
  return null;
}

// ---------- 主入口：户型几何生成 ----------

/** SplitFloor → ForgeFloor：由房间矩形反推墙体/门窗并校验（布局与手绘两条入口共用） */
function buildStructure(
  roomsOut: RoomGeom[], width: number, depth: number, wallHeight: number,
  hints?: (OpeningHint[] | undefined)[],
): PlanGeometry {
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

  // 有从户型图识别出的门窗时，以它们为准（和图纸一致）；没有（比如手绘框房间）才按规则自动开洞
  const hintWarnings: string[] = [];
  if (hints?.some(h => h && h.length > 0)) {
    for (const wl of walls) wl.openings = [];
    roomsOut.forEach((room, i) => {
      for (const h of hints[i] ?? []) {
        const problem = placeHint(walls, room, h);
        if (problem) hintWarnings.push(problem);
      }
    });
  } else {
    // 入户门：最长的底部外墙中心开 1.0m 门
    const bottomWalls = walls.filter(w2 => w2.exterior && eq(w2.y1, depth) && eq(w2.y2, depth));
    const entrance = bottomWalls.sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1))[0];
    if (entrance) {
      const offset = (entrance.x2 - entrance.x1) / 2;
      if (!overlapsAny(offset, 1.0, entrance.openings)) {
        entrance.openings.push({ type: 'door', offset, width: 1.0, height: 2.2, sill: 0 });
      }
    }
  }

  const plan: PlanGeometry = { unit: 'm', width, depth, wallHeight, walls, rooms: roomsOut, warnings: [] };
  plan.warnings = [...validate(plan), ...hintWarnings];
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
  openings?: OpeningHint[]; // 从户型图识别出的门窗；没有则自动开洞
}

/**
 * 把相邻房间几乎重合的边吸附到同一条线上。
 * 识别或手绘出来的房间边总有偏差，不吸附会出现两面平行的墙，
 * 同一扇门被开两次、共用墙上的门窗对不上。同一个房间自己的两条边不会被吸到一起。
 * 容差随户型大小变化（识别误差是图上的比例，不是固定米数）：至少 0.25 米，约为户型长边的 3.5%。
 */
function snapEdges(rects: RoomRect[]): RoomRect[] {
  const extent = Math.max(
    Math.max(...rects.map(r => r.x + r.w)) - Math.min(...rects.map(r => r.x)),
    Math.max(...rects.map(r => r.y + r.d)) - Math.min(...rects.map(r => r.y)),
  );
  const tol = Math.max(0.25, 0.035 * extent);
  const snapAxis = (axis: 'x' | 'y') => {
    const lo = rects.map(r => (axis === 'x' ? r.x : r.y));
    const hi = rects.map(r => (axis === 'x' ? r.x + r.w : r.y + r.d));
    const edges: { room: number; hi: boolean; v: number }[] = [];
    rects.forEach((_, i) => edges.push({ room: i, hi: false, v: lo[i] }, { room: i, hi: true, v: hi[i] }));
    edges.sort((a, b) => a.v - b.v);
    let cluster: typeof edges = [];
    const flush = () => {
      if (cluster.length > 1) {
        const mean = cluster.reduce((sum, e) => sum + e.v, 0) / cluster.length;
        for (const e of cluster) (e.hi ? hi : lo)[e.room] = mean;
      }
      cluster = [];
    };
    for (const e of edges) {
      const last = cluster[cluster.length - 1];
      if (last && (e.v - last.v > tol || cluster.some(c => c.room === e.room))) flush();
      cluster.push(e);
    }
    flush();
    return { lo, hi };
  };
  const xs = snapAxis('x'), ys = snapAxis('y');
  return rects.map((r, i) => {
    const w = xs.hi[i] - xs.lo[i], d = ys.hi[i] - ys.lo[i];
    // 吸附后太窄就保持原样
    return w > 0.3 && d > 0.3 ? { ...r, x: xs.lo[i], y: ys.lo[i], w, d } : r;
  });
}

export function planFromRects(rects: RoomRect[], opts: { wallHeight?: number } = {}): PlanGeometry {
  const usable = snapEdges(rects.filter(r => r.name && r.w > 0.3 && r.d > 0.3));
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
  // 外框和房间一样保留到毫米：太粗的取整会让最右、最下的墙和外框对不上，被当成内墙（窗和入户门都开不出来）
  const width = Math.round(Math.max(...roomsOut.map(r => r.x + r.w)) * 1000) / 1000;
  const depth = Math.round(Math.max(...roomsOut.map(r => r.y + r.d)) * 1000) / 1000;

  return buildStructure(roomsOut, width, depth, opts.wallHeight ?? 2.8, usable.map(r => r.openings));
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

// ---------- 房间版面描述（效果图提示词） ----------

type Side = 'N' | 'E' | 'S' | 'W';

/** 相机朝向某面墙时，各面墙相对相机的位置，以及沿墙「左→右」「近→远」是否与坐标增大同向（+1）或反向（-1） */
const FACING: Record<Side, { far: Side; near: Side; left: Side; right: Side; lr: 1 | -1; nf: 1 | -1 }> = {
  N: { far: 'N', near: 'S', left: 'W', right: 'E', lr: 1, nf: -1 },
  E: { far: 'E', near: 'W', left: 'N', right: 'S', lr: 1, nf: 1 },
  S: { far: 'S', near: 'N', left: 'E', right: 'W', lr: -1, nf: 1 },
  W: { far: 'W', near: 'E', left: 'S', right: 'N', lr: -1, nf: -1 },
};

interface RoomOpening {
  type: OpeningType;
  width: number;
  frac: number;      // 沿墙位置 0~1（按坐标增大方向）
  exterior: boolean;
  to?: string;       // 门通向的相邻房间
}

/**
 * 用文字描述一个房间的版面：尺寸、各面墙上的门窗位置、门通向哪里。
 * 数据来自 plan 几何（与二维图、3D 同一份），让 AI 效果图的门窗与图纸一致。
 * 视角：相机站在窗最宽那面墙的对面，朝向该墙。找不到房间时返回空字符串。
 */
export function describeRoomLayout(plan: PlanGeometry, roomIndex: number): string {
  return analyzeRoomLayout(plan, roomIndex)?.text ?? '';
}

/** 渲染图里应当能数出来的窗和门（相机身后那面墙拍不到，不计）。 */
export interface ExpectedWalls {
  far: { windows: number; doors: number };
  left: { windows: number; doors: number };
  right: { windows: number; doors: number };
}

/** 同 describeRoomLayout，另外给出每面墙上窗、门的数量，用来核对生成的效果图是否和户型一致。 */
export function analyzeRoomLayout(plan: PlanGeometry, roomIndex: number): { text: string; expected: ExpectedWalls } | null {
  const room = plan.rooms[roomIndex];
  if (!room) return null;
  const TOL = 0.35; // 墙中心线离房间边的最大距离（米）
  const found: Record<Side, RoomOpening[]> = { N: [], E: [], S: [], W: [] };

  for (const wall of plan.walls) {
    const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (len < EPS) continue;
    const horiz = Math.abs(wall.y1 - wall.y2) < EPS;
    const vert = Math.abs(wall.x1 - wall.x2) < EPS;
    if (!horiz && !vert) continue;

    // 这面墙属于房间的哪条边（取最近的一条，且在容差内、沿墙方向有重叠）
    let side: Side | null = null;
    let lo: number, hi: number; // 房间这条边沿墙方向的范围
    if (horiz) {
      lo = room.x; hi = room.x + room.w;
      if (Math.max(wall.x1, wall.x2) <= lo + EPS || Math.min(wall.x1, wall.x2) >= hi - EPS) continue;
      const dN = Math.abs(wall.y1 - room.y), dS = Math.abs(wall.y1 - (room.y + room.d));
      if (Math.min(dN, dS) <= TOL) side = dN <= dS ? 'N' : 'S';
    } else {
      lo = room.y; hi = room.y + room.d;
      if (Math.max(wall.y1, wall.y2) <= lo + EPS || Math.min(wall.y1, wall.y2) >= hi - EPS) continue;
      const dW = Math.abs(wall.x1 - room.x), dE = Math.abs(wall.x1 - (room.x + room.w));
      if (Math.min(dW, dE) <= TOL) side = dW <= dE ? 'W' : 'E';
    }
    if (!side) continue;

    for (const o of wall.openings) {
      const t = o.offset / len;
      const px = wall.x1 + (wall.x2 - wall.x1) * t;
      const py = wall.y1 + (wall.y2 - wall.y1) * t;
      const along = horiz ? px : py;
      if (along < lo - EPS || along > hi + EPS) continue; // 洞口不在本房间这条边上
      // 门向外 0.5 米处落在哪个房间，就是通向哪里
      const out = { N: [0, -0.5], S: [0, 0.5], W: [-0.5, 0], E: [0.5, 0] }[side];
      const qx = px + out[0], qy = py + out[1];
      const other = plan.rooms.find((r, i) => i !== roomIndex && qx >= r.x && qx <= r.x + r.w && qy >= r.y && qy <= r.y + r.d);
      found[side].push({
        type: o.type, width: o.width, frac: Math.min(1, Math.max(0, (along - lo) / (hi - lo))),
        exterior: wall.exterior, to: o.type === 'door' ? other?.name : undefined,
      });
    }
  }

  // 相机朝向：窗最宽的一面；没有窗就朝较长的一面
  const windowWidth = (s: Side) => found[s].filter(o => o.type === 'window').reduce((a, o) => a + o.width, 0);
  const sides: Side[] = ['N', 'E', 'S', 'W'];
  let facing: Side = room.w >= room.d ? 'N' : 'E';
  const widest = sides.reduce((best, s) => (windowWidth(s) > windowWidth(best) ? s : best), 'N' as Side);
  if (windowWidth(widest) > 0) facing = widest;
  const f = FACING[facing];

  const place = (s: Side, frac: number): string => {
    if (s === f.far) {
      const p = f.lr === 1 ? frac : 1 - frac;
      return p < 0.3 ? 'toward the left' : p > 0.7 ? 'toward the right' : 'in the middle';
    }
    if (s === f.near) return '';
    const p = f.nf === 1 ? frac : 1 - frac; // 0 = 靠近相机
    return p < 0.33 ? 'near the camera' : p > 0.67 ? 'toward the far end' : 'midway';
  };
  const describe = (s: Side): string => {
    const list = found[s];
    if (list.length === 0) return 'solid wall, no openings';
    return list.map(o => {
      const where = place(s, o.frac);
      const what = o.type === 'window'
        ? `a ${o.width.toFixed(1)} m wide window`
        : o.to ? `a doorway to the ${o.to}` : o.exterior ? 'the entrance door' : 'a door';
      return where ? `${what} ${where}` : what;
    }).join(', ');
  };

  const w = Math.round(room.w * 10) / 10, d = Math.round(room.d * 10) / 10;
  const count = (side: Side) => ({
    windows: found[side].filter(o => o.type === 'window').length,
    doors: found[side].filter(o => o.type === 'door').length,
  });
  const text = [
    `Layout taken from the floor plan, follow it exactly: the room is a ${w} m x ${d} m rectangle.`,
    `The camera stands at the wall opposite the far wall and looks at the far wall.`,
    `Far wall: ${describe(f.far)}.`,
    `Left wall: ${describe(f.left)}.`,
    `Right wall: ${describe(f.right)}.`,
    `Wall behind the camera: ${describe(f.near)}.`,
    `Do not add windows or doors that are not listed.`,
  ].join(' ');
  return { text, expected: { far: count(f.far), left: count(f.left), right: count(f.right) } };
}

// ---------- 把图上识别出的门窗分给房间 ----------

/** 识别出的一扇门或窗在图上的外框（相对整图的归一化坐标，x 向右、y 向下）。 */
export interface OpeningBox {
  type: OpeningType;
  x: number; y: number; w: number; d: number;
  conf?: number;
}

/**
 * 把门窗外框分给房间：每个门窗归到离它最近的房间边，共用墙两侧的房间都会得到它。
 * 返回与 rooms 同序的 OpeningHint 列表，可直接交给 planFromRects。
 * 让识别模型只回答它擅长的「门窗在图上的哪里」，哪个房间哪面墙由这里算，比让它直接答「在房间哪条边上」准得多。
 */
export function assignOpeningsToRooms(
  rooms: { x: number; y: number; w: number; d: number }[],
  boxes: OpeningBox[],
  tol = 0.06,
): OpeningHint[][] {
  const out: OpeningHint[][] = rooms.map(() => []);
  const margin = 0.02;
  for (const b of boxes) {
    const cx = b.x + b.w / 2, cy = b.y + b.d / 2;
    rooms.forEach((r, i) => {
      // 四条边：到洞口中心的距离、洞口沿边的位置、边的起点和长度、洞口沿边的宽度
      const edges: { side: OpeningHint['side']; dist: number; along: number; start: number; span: number; len: number }[] = [
        { side: 'N', dist: Math.abs(cy - r.y), along: cx, start: r.x, span: r.w, len: b.w },
        { side: 'S', dist: Math.abs(cy - (r.y + r.d)), along: cx, start: r.x, span: r.w, len: b.w },
        { side: 'W', dist: Math.abs(cx - r.x), along: cy, start: r.y, span: r.d, len: b.d },
        { side: 'E', dist: Math.abs(cx - (r.x + r.w)), along: cy, start: r.y, span: r.d, len: b.d },
      ];
      const best = edges
        .filter(e => e.span > 0 && e.along >= e.start - margin && e.along <= e.start + e.span + margin)
        .sort((p, q) => p.dist - q.dist)[0];
      if (!best || best.dist > tol) return;
      out[i].push({
        type: b.type,
        side: best.side,
        pos: Math.min(1, Math.max(0, (best.along - best.start) / best.span)),
        size: Math.min(0.6, Math.max(0.1, best.len / best.span)),
        ...(b.conf !== undefined ? { conf: b.conf } : {}),
      });
    });
  }
  return out;
}
