import { NextResponse } from 'next/server';
import { recognizeFloorPlan } from '@/lib/mimo';
import { requireSession } from '@/lib/auth';

// 户型图视觉识别：图片 → 房间矩形 + 墙上的门窗（归一化 0~1 坐标）
// body: { image: dataURI | rawBase64 }
// 返回 { rooms: [{ name, x, y, w, d, openings: [{ type, side, pos, size }] }], runs }，供 planFromRects 生成 3D 几何
// 模型只回答门窗在图上的位置（外框）；归到哪个房间的哪面墙由 assignOpeningsToRooms 计算，
// 比让模型直接答「在房间哪条边上」准得多（实测 86% 对 66%）。
// 同一张图识别 RUNS 次并行进行，只保留多数次一致的结果（见 lib/recognition.ts）：单次回答会漏门窗、也会凭空多出门窗。
const DEFAULT_RUNS = 3;

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['homeowner', 'boss']); if (s instanceof NextResponse) return s;
    const body = (await req.json()) as { image?: string; runs?: number };
    const RUNS = Math.min(5, Math.max(1, Math.round(Number(body.runs)) || DEFAULT_RUNS));
    const image = body.image ?? '';
    if (!image) return NextResponse.json({ error: '缺少 image' }, { status: 400 });

    const m = /^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/.exec(image);
    const mime = m ? m[1] : 'image/png';
    const b64 = m ? m[2] : image;

    const result = await recognizeFloorPlan(b64, mime, RUNS);
    if ('error' in result) return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
    // runs：实际用来取一致的识别次数。只有 1 次时没法互相印证，调用方应提示「未经核对」。
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
