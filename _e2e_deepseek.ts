// 端到端验证 DeepSeek 备用链（真实调用 apps/web/lib/mimo.ts 的 callMimo）：
//   跑法：npx tsx _e2e_deepseek.ts   （在 i-renovation 目录下）
//   1. MiMo 主链正常时仍由 MiMo 回答（主备顺序不变）
//   2. 模拟 MiMo 故障（指向不可达地址），文本调用由 DeepSeek 接管
//   3. 模拟 MiMo 故障，看图调用由 DeepSeek（deepseek-flash）接管
import { callMimo } from './apps/web/lib/mimo';
import { readFileSync } from 'node:fs';

process.loadEnvFile('apps/web/.env.local');

const IMG_PATH = 'C:/Users/kakssjs/Desktop/d444516177abdfd096e3380f2ec202a8.png';

const warns: string[] = [];
const origWarn = console.warn;
console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(' ')); origWarn(...a); };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (cond) pass++; else fail++;
}

async function main() {
  // —— 1. MiMo 主链优先：正常配置下不应出现「改用备用」——
  try {
    const r = await callMimo([{ role: 'user', content: '只回复两个字：正常' }], { maxTokens: 100, noThinking: true });
    const switched = warns.some(w => w.includes('改用备用'));
    ok('主链 MiMo 优先', /正常/.test(r.text) && !switched, `回答：${r.text.slice(0, 40)}${switched ? '（注意：发生了切换）' : ''}`);
  } catch (e) {
    ok('主链 MiMo 优先', false, `抛错：${(e as Error).message.slice(0, 160)}`);
  }

  // —— 2/3. 模拟 MiMo 报错：主链指向不可达端口，DeepSeek 必须接管 ——
  process.env.MIMO_BASE_URL = 'http://127.0.0.1:9/v1';
  const mark = warns.length;

  try {
    const r = await callMimo([{ role: 'user', content: 'Reply with exactly this text and nothing else: DEEPSEEK_OK' }], { maxTokens: 300, noThinking: true });
    ok('文本备用 DeepSeek', /DEEPSEEK_OK/.test(r.text) && warns.slice(mark).some(w => w.includes('改用备用')), `回答：${r.text.slice(0, 60)}`);
  } catch (e) {
    ok('文本备用 DeepSeek', false, `抛错：${(e as Error).message.slice(0, 160)}`);
  }

  try {
    const b64 = readFileSync(IMG_PATH).toString('base64');
    const r = await callMimo(
      [{ role: 'user', content: '这张图是什么内容？用不超过15个字概括。' }],
      { imageBase64: b64, mime: 'image/png', maxTokens: 300, noThinking: true },
    );
    ok('看图备用 DeepSeek', r.text.trim().length > 0, `回答：${r.text.trim().slice(0, 60)}`);
  } catch (e) {
    ok('看图备用 DeepSeek', false, `抛错：${(e as Error).message.slice(0, 200)}`);
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

void main();
