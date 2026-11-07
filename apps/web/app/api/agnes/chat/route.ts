import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { generateChecked, parseExpected } from '@/lib/render-check';

// POST /api/agnes/chat — 对话修改装饰图
// body: { message, imageUrl?, style?, room?, layout? }（layout：该房间的门窗版面，来自户型几何）
// 用 Agnes img2img 或 text2img 生成修改后的图
export async function POST(req: NextRequest) {
  try {
    const s = await requireSession(req, ['homeowner', 'boss']); if (s instanceof NextResponse) return s;
    const { message, imageUrl, style, room, layout, expected, materialPrompt } = await req.json();
    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

    const prompt = `Interior decoration design photo of ${room ?? 'a room'}, ${style ?? 'modern'} style. ${message}.${typeof layout === 'string' && layout ? ' ' + layout : ''}${typeof materialPrompt === 'string' && materialPrompt ? ' ' + materialPrompt : ''} Realistic, high quality, warm lighting, architectural visualization.`;

    const opts: Parameters<typeof generateChecked>[0] = {
      prompt,
      size: '1K',
      ratio: '16:9',
    };
    if (imageUrl) opts.image = [imageUrl];

    // 有户型约束（expected）时，改出来的图也要核对门窗数量，不一致就带纠正重新生成
    const { result, check } = await generateChecked(opts, parseExpected(expected));
    return NextResponse.json({ url: result.url, b64_json: result.b64_json, revised_prompt: result.revised_prompt, check });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
