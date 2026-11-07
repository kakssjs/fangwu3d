// 路由级端到端：MiMo 故障时 /api/mimo/recognize 仍能用 DeepSeek 完成户型识别。
// 前置：npx next build 后，用 MIMO_BASE_URL=http://127.0.0.1:9/v1 npx next start -p 3100 启动（模拟 MiMo 报错）。
// 跑法：npx tsx _e2e_recognize.ts   （在 i-renovation 目录下）
// 图形：脚本自绘 4 房 6 窗 3 门户型图（SVG→PNG，sharp 随 Next 安装），与文档 §4 的测试图同一构造思路。
import { readFileSync } from 'node:fs';

process.loadEnvFile('apps/web/.env.local');

const BASE = 'http://127.0.0.1:3100';

function planSvg(): string {
  const wall = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="10"/>`;
  const window = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2b7fff" stroke-width="4"/>` +
    `<line x1="${x1}" y1="${y1 + 4}" x2="${x2}" y2="${y2 + 4}" stroke="#2b7fff" stroke-width="4"/>`;
  // 门：墙上的缺口 + 橙色弧线
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="800" height="600" fill="#fff"/>`);
  // 外墙
  parts.push(wall(0, 0, 800, 0), wall(0, 600, 800, 600), wall(0, 0, 0, 600), wall(800, 0, 800, 600));
  // 内墙（竖：x=400 留两个门洞；横：y=350 留一个门洞）
  parts.push(wall(400, 0, 400, 120), wall(400, 220, 400, 420), wall(400, 520, 400, 600));
  parts.push(wall(0, 350, 140, 350), wall(240, 350, 800, 350));
  // 6 扇窗（蓝双线）：上 2、下 2、左 1、右 1
  parts.push(window(80, 5, 200, 5), window(520, 5, 640, 5));
  parts.push(window(80, 595, 200, 595), window(520, 595, 640, 595));
  parts.push(`<line x1="5" y1="120" x2="5" y2="240" stroke="#2b7fff" stroke-width="4"/><line x1="9" y1="120" x2="9" y2="240" stroke="#2b7fff" stroke-width="4"/>`);
  parts.push(`<line x1="795" y1="120" x2="795" y2="240" stroke="#2b7fff" stroke-width="4"/><line x1="791" y1="120" x2="791" y2="240" stroke="#2b7fff" stroke-width="4"/>`);
  // 3 扇门（橙弧）
  parts.push(`<path d="M 400 120 A 100 100 0 0 1 500 220" fill="none" stroke="#e07b00" stroke-width="5"/>`);   // 客厅-主卧
  parts.push(`<path d="M 400 520 A 100 100 0 0 0 300 420" fill="none" stroke="#e07b00" stroke-width="5"/>`);   // 次卧-厨房
  parts.push(`<path d="M 140 350 A 100 100 0 0 1 240 450" fill="none" stroke="#e07b00" stroke-width="5"/>`);   // 客厅-次卧
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">${parts.join('')}</svg>`;
}

async function main() {
  // 1. 自绘户型图 → PNG dataURI
  const sharp = (await import('sharp')).default;
  const png = await sharp(Buffer.from(planSvg())).png().toBuffer();
  const image = `data:image/png;base64,${png.toString('base64')}`;
  console.log(`户型图已生成：${png.length} bytes`);

  // 2. boss 登录拿会话 cookie
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: process.env.BOSS_PHONE, password: process.env.BOSS_PASSWORD }),
  });
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  if (!login.ok || !cookie) { console.log(`FAIL 登录：HTTP ${login.status}`); process.exitCode = 1; return; }
  console.log('登录 OK');

  // 3. 识别：MiMo 已指向不可达地址（服务端启动时设置），DeepSeek 必须接管
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/mimo/recognize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ image }),
  });
  const j = await res.json() as { rooms?: { name: string; openings?: unknown[] }[]; runs?: number; error?: string };
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const rooms = j.rooms ?? [];
  const openings = rooms.reduce((s, r) => s + (r.openings?.length ?? 0), 0);
  const pass = res.ok && rooms.length >= 3 && openings >= 5;
  console.log(`${pass ? 'PASS' : 'FAIL'} 识别路由 — HTTP ${res.status}，${secs}s，rooms=${rooms.length}（${rooms.map(r => r.name).join('/')}），openings=${openings}，runs=${j.runs}${j.error ? `，error=${j.error}` : ''}`);
  if (!pass) process.exitCode = 1;
}

void main();
