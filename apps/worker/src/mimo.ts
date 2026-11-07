// MiMo-V2.6-Pro client (OpenAI compatible). Uses node:https to avoid webpack fetch polyfill issues.

import https from 'node:https';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

function httpsPost(url: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'content-length': Buffer.byteLength(payload) },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
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

  const data = JSON.parse(res.body) as { choices: { message: { content: string } }[]; usage?: { total_tokens?: number } };
  return { text: data.choices[0]?.message?.content ?? '', tokensUsed: data.usage?.total_tokens ?? 0 };
}
