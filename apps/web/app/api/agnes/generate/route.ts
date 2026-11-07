import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/agnes';

export async function POST(req: NextRequest) {
  try {
    const { prompt, size, ratio, image, returnBase64 } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    const result = await generateImage({
      prompt,
      size: size ?? '2K',
      ratio: ratio ?? '16:9',
      image: typeof image === 'string' && image ? image : Array.isArray(image) && image.length ? image : undefined,
      returnBase64: !!returnBase64,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
