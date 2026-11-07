import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { generateChecked, parseExpected } from '@/lib/render-check';

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession(req, ['homeowner', 'boss']); if (s instanceof NextResponse) return s;
    // expected：户型图应有的窗和门数量（见 analyzeRoomLayout）。给了就核对，不一致会带纠正重新生成，返回里的 check 如实记录结果
    const { prompt, size, ratio, image, returnBase64, expected, materialPrompt } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    const finalPrompt = typeof materialPrompt === 'string' && materialPrompt ? `${prompt}. ${materialPrompt}` : prompt;
    const { result, check } = await generateChecked({
      prompt: finalPrompt,
      size: size ?? '2K',
      ratio: ratio ?? '16:9',
      image: typeof image === 'string' && image ? image : Array.isArray(image) && image.length ? image : undefined,
      returnBase64: !!returnBase64,
    }, parseExpected(expected));
    return NextResponse.json({ ...result, check });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
