// 户型图识别结果的解析与「多次识别取一致」。
// 视觉模型每次回答都不完全一样（会漏门窗、凭空多出门窗）。只信一次回答，错的就会被存下来当成事实。
// 这里把同一张图识别多次，只保留多数次都识别到的房间、门和窗，取它们的位置中位数。

export interface RawRoom { name: string; x: number; y: number; w: number; d: number }
export interface RawBox { x: number; y: number; w: number; d: number }
export interface RawRun { rooms: RawRoom[]; windows: RawBox[]; doors: RawBox[] }
/** 合并后的门窗外框，votes 是有几次识别都看到了它 */
export interface VotedBox extends RawBox { votes: number }
export interface MergedRun { rooms: RawRoom[]; windows: VotedBox[]; doors: VotedBox[] }

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : NaN;
};

/** 宽容解析一次识别的回答：新格式是 {rooms, windows, doors}；兼容只返回房间数组的旧格式。解析不出房间返回 null。 */
export function parseRecognition(text: string): RawRun | null {
  const match = (/"rooms"/.test(text) ? text.match(/\{[\s\S]*\}/) : null) ?? text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(match[0]); } catch { return null; }
  const obj = (Array.isArray(parsed) ? { rooms: parsed } : parsed) as { rooms?: unknown; windows?: unknown; doors?: unknown };

  const rooms = (Array.isArray(obj.rooms) ? obj.rooms : []).flatMap((r) => {
    const o = r as Record<string, unknown>;
    const room = { name: typeof o.name === 'string' ? o.name : '', x: num(o.x), y: num(o.y), w: num(o.w), d: num(o.d) };
    return room.name && [room.x, room.y, room.w, room.d].every(Number.isFinite) && room.w > 0.02 && room.d > 0.02 ? [room] : [];
  });
  if (rooms.length === 0) return null;

  const boxesOf = (list: unknown): RawBox[] => (Array.isArray(list) ? list : []).flatMap((v: unknown) => {
    const q = v as Record<string, unknown>;
    const box = { x: num(q.x), y: num(q.y), w: num(q.w), d: num(q.d) };
    return [box.x, box.y, box.w, box.d].every(Number.isFinite) && (box.w > 0 || box.d > 0) ? [box] : [];
  });
  return { rooms, windows: boxesOf(obj.windows), doors: boxesOf(obj.doors) };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function iou(a: RawBox, b: RawBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const d = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  if (w <= 0 || d <= 0) return 0;
  const inter = w * d;
  return inter / (a.w * a.d + b.w * b.d - inter);
}

/**
 * 把一组项目按「同一个东西」聚成簇：每次识别最多给一个簇贡献一项，
 * 只保留至少 need 次识别都出现的簇，位置取中位数。same 判断两项是不是同一个。
 */
function consensus<T extends RawBox>(
  runs: T[][], need: number, same: (a: T, b: T) => boolean, pick: (members: T[]) => T,
): { item: T; votes: number }[] {
  const clusters: { members: T[]; runs: Set<number> }[] = [];
  runs.forEach((items, runIdx) => {
    for (const item of items) {
      const c = clusters.find(cl => !cl.runs.has(runIdx) && same(pick(cl.members), item));
      if (c) { c.members.push(item); c.runs.add(runIdx); } else clusters.push({ members: [item], runs: new Set([runIdx]) });
    }
  });
  return clusters.filter(c => c.runs.size >= need).map(c => ({ item: pick(c.members), votes: c.runs.size }));
}

const mid = <T extends RawBox>(members: T[]): T => ({
  ...members[0],
  x: median(members.map(m => m.x)), y: median(members.map(m => m.y)),
  w: median(members.map(m => m.w)), d: median(members.map(m => m.d)),
});

/**
 * 合并多次识别：房间按重叠度（IoU ≥ 0.4）、门窗按中心距离（≤ 0.08）判断是不是同一个，
 * （模型对同一扇门窗每次给的位置会差 5% 到 8%，容差比这小，真的门窗就会因为「对不上自己」被投票淘汰）
 * 至少过半数的识别都出现才保留。runs 只有 1 次时原样返回（没法投票，调用方应当提示未经核对）。
 */
export function mergeRuns(runs: RawRun[]): { run: MergedRun; runs: number } {
  const n = runs.length;
  if (n === 1) {
    const only = runs[0];
    return { run: { rooms: only.rooms, windows: only.windows.map(b => ({ ...b, votes: 1 })), doors: only.doors.map(b => ({ ...b, votes: 1 })) }, runs: 1 };
  }
  const need = Math.floor(n / 2) + 1;
  const centre = (b: RawBox) => [b.x + b.w / 2, b.y + b.d / 2];
  const sameSpot = (a: RawBox, b: RawBox) => {
    const [ax, ay] = centre(a), [bx, by] = centre(b);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 0.08;
  };
  const rooms = consensus<RawRoom>(runs.map(r => r.rooms), need, (a, b) => iou(a, b) >= 0.4, mid)
    .map(c => c.item)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  // 房间名：同一个房间多数次识别给的名字
  const named = rooms.map(room => {
    const names = runs.flatMap(r => r.rooms.filter(q => iou(q, room) >= 0.4).map(q => q.name));
    const count = new Map<string, number>();
    for (const nm of names) count.set(nm, (count.get(nm) ?? 0) + 1);
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    return { ...room, name: best ? best[0] : room.name };
  });
  const voted = (lists: RawBox[][]): VotedBox[] => consensus<RawBox>(lists, need, sameSpot, mid).map(c => ({ ...c.item, votes: c.votes }));
  const windows = voted(runs.map(r => r.windows));
  const doors = voted(runs.map(r => r.doors));
  return { run: { rooms: named, windows, doors }, runs: n };
}
