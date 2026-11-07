// Agnes AI 图像生成客户端（官方文档端点：https://apihub.agnes-ai.com/v1/images/generations）
const AGNES_BASE = process.env.AGNES_BASE_URL ?? 'https://apihub.agnes-ai.com';
const AGNES_KEY = process.env.AGNES_API_KEY ?? '';

export interface AgnesImageResult {
  url?: string;
  b64_json?: string;
  revised_prompt?: string | null;
}

export async function generateImage(opts: {
  prompt: string;
  size?: string;       // '1K' | '2K' | '3K' | '4K'
  ratio?: string;      // '1:1' | '16:9' | '3:4' | '4:3' | '9:16' | '21:9'
  image?: string | string[];  // 图生图输入（URL 或 base64 Data URI）
  returnBase64?: boolean;
}): Promise<AgnesImageResult> {
  const body: Record<string, unknown> = {
    model: 'agnes-image-2.5-flash',
    prompt: opts.prompt,
    size: opts.size ?? '2K',
    extra_body: {
      response_format: opts.returnBase64 ? 'b64_json' : 'url',
    },
  };
  if (opts.ratio) body.ratio = opts.ratio;
  // 图生图：`image` 必须放顶层（images/reference_image 等字段会 400 走到文生图队列）
  if (opts.image) {
    body.image = Array.isArray(opts.image) ? opts.image : [opts.image];
  }
  if (opts.returnBase64) body.return_base64 = true;

  const res = await fetch(`${AGNES_BASE}/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AGNES_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Agnes API ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json?.data?.[0] ?? {};
}
