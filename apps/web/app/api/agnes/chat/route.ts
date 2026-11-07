import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/agnes';

// POST /api/agnes/chat — 对话修改装饰图
// body: { message, imageUrl?, style? }
// 用 Agnes img2img 或 text2img 生成修改后的图
export async function POST(req: NextRequest) {
  try {
    const { message, imageUrl, style, room } = await req.json();
    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

    const prompt = `Interior decoration design photo of ${room ?? 'a room'}, ${style ?? 'modern'} style. ${message}. Realistic, high quality, warm lighting, architectural visualization.`;

    const opts: Parameters<typeof generateImage>[0] = {
      prompt,
      size: '1K',
      ratio: '16:9',
    };
    if (imageUrl) opts.image = [imageUrl];

    const result = await generateImage(opts);
    return NextResponse.json({ url: result.url, b64_json: result.b64_json, revised_prompt: result.revised_prompt });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
