// 效果图核对：生成之后让视觉模型数一数每面墙上的窗和门，和户型图应有的数量对一遍，
// 对不上就带着具体的纠正意见重新生成（最多 maxTries 次），最后保留最接近的一张，并如实记录有没有通过。
// 图像模型只能「大致」照着文字画，会凭空多出门窗；不核对，这些错的图就会被当成「根据户型图生成」存起来。
import type { ExpectedWalls } from '@i-renovation/shared/plan';
import { callMimo } from './mimo';
import { generateImage, type AgnesImageResult } from './agnes';

export interface RenderCheck {
  ok: boolean;       // 窗和门的数量在三面墙上都和户型图一致
  tries: number;     // 一共生成了几次
  issues: string[];  // 没通过时，最接近的那张图还差什么
}

const WALLS = ['far', 'left', 'right'] as const;
const WALL_ZH = { far: '正对的墙', left: '左墙', right: '右墙' } as const;
const WALL_EN = { far: 'far wall', left: 'left wall', right: 'right wall' } as const;

const COUNT_PROMPT = [
  '这是一张室内装修效果图（照片）。相机正对着最远的那面墙。',
  '请数一数：正对的「远墙」、画面左侧的「左墙」、画面右侧的「右墙」，每面墙上各有几扇窗、几扇门（门洞、敞开的门也算门；通向别的房间的开口算门）。',
  '只数这三面墙上能看到的，看不到就写 0，不要猜。只返回严格 JSON，不要解释：',
  '{"far":{"windows":1,"doors":0},"left":{"windows":0,"doors":1},"right":{"windows":0,"doors":0}}',
].join('\n');

/** 取图并缩到 1024px 以内的 JPEG：效果图有 1MB 以上，缩小后识别更快，门窗照样看得清。sharp 随 Next 安装；没有就原图发送。 */
async function loadImage(result: AgnesImageResult): Promise<{ b64: string; mime: string } | null> {
  let bytes: Buffer;
  let mime = 'image/png';
  if (result.b64_json) {
    bytes = Buffer.from(result.b64_json, 'base64');
  } else if (result.url) {
    const res = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    bytes = Buffer.from(await res.arrayBuffer());
    mime = res.headers.get('content-type')?.split(';')[0] || mime;
  } else {
    return null;
  }
  try {
    const sharp = (await import('sharp')).default;
    const small = await sharp(bytes).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return { b64: small.toString('base64'), mime: 'image/jpeg' };
  } catch {
    return { b64: bytes.toString('base64'), mime };
  }
}

/** 让视觉模型数出效果图里每面墙的窗和门；数不出来（出错或格式不对）返回 null。 */
export async function countOpenings(result: AgnesImageResult): Promise<ExpectedWalls | null> {
  try {
    const img = await loadImage(result);
    if (!img) return null;
    const { text } = await callMimo([{ role: 'user', content: COUNT_PROMPT }], { imageBase64: img.b64, mime: img.mime, maxTokens: 400, noThinking: true });
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '') as Record<string, { windows?: unknown; doors?: unknown }>;
    const n = (v: unknown) => Math.min(9, Math.max(0, Math.round(Number(v)) || 0));
    return Object.fromEntries(WALLS.map(w => [w, { windows: n(j[w]?.windows), doors: n(j[w]?.doors) }])) as unknown as ExpectedWalls;
  } catch {
    return null;
  }
}

/** 应有的和实际数出来的差多少。issues 是给人看的中文，fix 是给图像模型的英文纠正。 */
export function compareOpenings(expected: ExpectedWalls, seen: ExpectedWalls): { mismatch: number; issues: string[]; fix: string[] } {
  let mismatch = 0;
  const issues: string[] = [];
  const fix: string[] = [];
  for (const w of WALLS) {
    for (const [kind, zh, en] of [['windows', '窗', 'window'], ['doors', '门', 'door']] as const) {
      const diff = seen[w][kind] - expected[w][kind];
      if (diff === 0) continue;
      mismatch += Math.abs(diff);
      issues.push(`${WALL_ZH[w]}${diff > 0 ? '多了' : '少了'} ${Math.abs(diff)} 扇${zh}`);
      fix.push(`the ${WALL_EN[w]} must have exactly ${expected[w][kind]} ${en}${expected[w][kind] === 1 ? '' : 's'} (the previous picture had ${seen[w][kind]})`);
    }
  }
  return { mismatch, issues, fix };
}

/**
 * 生成一张图；给了 expected 就核对，不一致则带纠正重新生成。
 * 核对本身失败（模型没答出来）时不假装通过：返回未核对（check 为 undefined）。
 */
export async function generateChecked(
  opts: Parameters<typeof generateImage>[0],
  expected?: ExpectedWalls,
  maxTries = 3,
): Promise<{ result: AgnesImageResult; check?: RenderCheck }> {
  let prompt = opts.prompt;
  let best: { result: AgnesImageResult; mismatch: number; issues: string[] } | null = null;
  for (let tries = 1; tries <= maxTries; tries++) {
    const result = await generateImage({ ...opts, prompt });
    if (!expected) return { result };
    const seen = await countOpenings(result);
    if (!seen) return { result: best?.result ?? result, check: undefined };
    const { mismatch, issues, fix } = compareOpenings(expected, seen);
    if (!best || mismatch < best.mismatch) best = { result, mismatch, issues };
    if (mismatch === 0) return { result, check: { ok: true, tries, issues: [] } };
    prompt = `${opts.prompt} Correction, the previous attempt was wrong: ${fix.join('; ')}. Count the openings carefully.`;
  }
  return { result: best!.result, check: { ok: false, tries: maxTries, issues: best!.issues } };
}

/** 请求里带来的 expected 只信格式正确的数字。 */
export function parseExpected(v: unknown): ExpectedWalls | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, { windows?: unknown; doors?: unknown } | undefined>;
  const n = (x: unknown) => Math.min(9, Math.max(0, Math.round(Number(x)) || 0));
  if (!WALLS.every(w => o[w] && typeof o[w] === 'object')) return undefined;
  return Object.fromEntries(WALLS.map(w => [w, { windows: n(o[w]!.windows), doors: n(o[w]!.doors) }])) as unknown as ExpectedWalls;
}
