// MiMo-V2.6-Pro 客户端（OpenAI 兼容）。使用 curl 子进程绕过 webpack fetch polyfill 问题。
// JSON body 通过 stdin 传递，避免 Windows 命令行编码问题。

const { spawn } = eval('require')('node:child_process');

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

function httpsPost(url: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headerArgs = Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]);
    const args = ['-s', '-w', '\n%{http_code}', '-X', 'POST', ...headerArgs, '--data-binary', '@-', url];

    const child = spawn('curl', args, { timeout: 65000 });
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

export async function callMimo(messages: ChatMessage[], opts?: { imageBase64?: string; mime?: string }): Promise<{ text: string; tokensUsed: number }> {
  const base = process.env.MIMO_BASE_URL;
  const key = process.env.MIMO_API_KEY;
  if (!base || !key) throw new Error('MIMO_BASE_URL / MIMO_API_KEY not configured');

  let content: unknown = messages[messages.length - 1].content;
  if (opts?.imageBase64) {
    content = [
      { type: 'text', text: messages[messages.length - 1].content },
      { type: 'image_url', image_url: { url: `data:${opts.mime ?? 'image/png'};base64,${opts.imageBase64}` } },
    ];
  }

  const body = {
    model: 'mimo-v2.6-pro',
    messages: [...messages.slice(0, -1), { role: 'user', content }],
    max_tokens: 2000,
  };

  const res = await httpsPost(`${base}/chat/completions`, body, {
    'content-type': 'application/json',
    authorization: `Bearer ${key}`,
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`MiMo API ${res.status}: ${res.body.slice(0, 200)}`);

  const data = JSON.parse(res.body) as { choices: { message: { content: string; reasoning_content?: string } }[]; usage?: { total_tokens?: number } };
  const text = data.choices[0]?.message?.content ?? data.choices[0]?.message?.reasoning_content ?? '';
  return { text, tokensUsed: data.usage?.total_tokens ?? 0 };
}
