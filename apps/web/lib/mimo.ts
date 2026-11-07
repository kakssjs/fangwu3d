// MiMo-V2.6-Pro 客户端（OpenAI 兼容）。使用 curl 子进程绕过 webpack fetch polyfill 问题。
// JSON body 通过 stdin 传递，避免 Windows 命令行编码问题。
// MiMo 为主、DeepSeek 为备：DEEPSEEK_API_KEY 配置后，MiMo 报错/返回空时自动改用 DeepSeek 兜底，
// 看图任务走支持图像输入的 deepseek-flash，全部调用点无需感知切换。

const { spawn } = eval('require')('node:child_process');

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

function httpsPost(url: string, body: Record<string, unknown>, headers: Record<string, string>, timeoutMs = 65000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headerArgs = Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]);
    const args = ['-s', '-w', '\n%{http_code}', '-X', 'POST', ...headerArgs, '--data-binary', '@-', url];

    const child = spawn('curl', args, { timeout: timeoutMs });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });
    child.on('error', (err: Error) => reject(new Error(`curl spawn failed: ${err.message}`)));
    child.on('close', (code: number | null) => {
      if (code !== 0) { reject(new Error(`curl exit ${code}: ${stderr}`)); return; }
      const lastNewline = stdout.lastIndexOf('\n');
      const bodyStr = lastNewline > 0 ? stdout.slice(0, lastNewline) : stdout;
      const statusStr = lastNewline > 0 ? stdout.slice(lastNewline + 1).trim() : '0';
      resolve({ status: parseInt(statusStr, 10) || 0, body: bodyStr });
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

// —— 主备两个供应商：MiMo（赛题发放额度）优先，DeepSeek 兜底 ——
interface Provider {
  name: string;
  base: string;
  key: string;
  model: string;
  kind: 'mimo' | 'deepseek'; // 答案解析（MiMo 思考答案在 reasoning_content）与超时（DeepSeek 直连慢，放宽）按此区分
}

// DeepSeek 里支持图像输入的模型；看图调用必须落在其中之一
const DS_VISION_MODELS = ['deepseek-flash'];

function deepseekFor(withImage: boolean): Provider | null {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const textModel = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  // 用户用 DEEPSEEK_MODEL 换成纯文本模型时，看图调用仍固定走支持图像的模型，避免请求被拒
  const model = withImage && !DS_VISION_MODELS.includes(textModel) ? 'deepseek-flash' : textModel;
  return {
    name: 'DeepSeek',
    base: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    key,
    model,
    kind: 'deepseek',
  };
}

async function requestChat(p: Provider, messages: ChatMessage[], opts?: { imageBase64?: string; mime?: string; maxTokens?: number; noThinking?: boolean }): Promise<{ text: string; tokensUsed: number }> {
  let content: unknown = messages[messages.length - 1].content;
  if (opts?.imageBase64) {
    content = [
      { type: 'text', text: messages[messages.length - 1].content },
      { type: 'image_url', image_url: { url: `data:${opts.mime ?? 'image/png'};base64,${opts.imageBase64}` } },
    ];
  }

  const body = {
    model: p.model,
    messages: [...messages.slice(0, -1), { role: 'user', content }],
    max_tokens: opts?.maxTokens ?? 2000,
    // 看图识别这类任务不需要长时间思考：关掉思考，约快 4 倍，且不会因思考耗尽回答长度而返回空内容。
    // MiMo 和 DeepSeek V4 用同一个 thinking 开关（实测 deepseek-flash 关掉后 reasoning_tokens 为 0）。
    ...(opts?.noThinking ? { thinking: { type: 'disabled' } } : {}),
  };

  // DeepSeek 直连（不走代理）实测有 10 秒以上的波动，65 秒上限会误杀正常回答；MiMo 保持原有 65 秒
  const res = await httpsPost(`${p.base}/chat/completions`, body, {
    'content-type': 'application/json',
    authorization: `Bearer ${p.key}`,
  }, p.kind === 'deepseek' ? 120_000 : 65_000);
  if (res.status < 200 || res.status >= 300) throw new Error(`${p.name} API ${res.status}: ${res.body.slice(0, 200)}`);

  const data = JSON.parse(res.body) as { choices: { message: { content: string | null; reasoning_content?: string } }[]; usage?: { total_tokens?: number } };
  const msg = data.choices[0]?.message;
  // MiMo 思考模式下答案会放进 reasoning_content；DeepSeek 的 reasoning_content 是思考过程，不能当答案用
  const text = msg?.content ?? (p.kind === 'mimo' ? (msg?.reasoning_content ?? '') : '');
  if (!text.trim()) throw new Error(`${p.name} API 返回空内容`); // 空回答按失败处理，好让备用模型接手
  return { text, tokensUsed: data.usage?.total_tokens ?? 0 };
}

export async function callMimo(messages: ChatMessage[], opts?: { imageBase64?: string; mime?: string; maxTokens?: number; noThinking?: boolean }): Promise<{ text: string; tokensUsed: number }> {
  const providers: Provider[] = [];
  const base = process.env.MIMO_BASE_URL;
  const key = process.env.MIMO_API_KEY;
  if (base && key) providers.push({ name: 'MiMo', base, key, model: 'mimo-v2.6-pro', kind: 'mimo' });
  const ds = deepseekFor(!!opts?.imageBase64);
  if (ds) providers.push(ds);
  if (providers.length === 0) throw new Error('MIMO_BASE_URL / MIMO_API_KEY / DEEPSEEK_API_KEY not configured');

  let firstError: Error | null = null;
  for (let i = 0; i < providers.length; i++) {
    try {
      return await requestChat(providers[i], messages, opts);
    } catch (e) {
      const err = e as Error;
      // 都失败时抛主模型的错误：runner 的异常分类（超时重试/降级规则引擎）是按它的报错写的
      if (!firstError) firstError = err;
      console.warn(`[mimo] ${providers[i].name} 调用失败${i + 1 < providers.length ? '，改用备用' : ''}：`, err.message);
    }
  }
  throw firstError!;
}
