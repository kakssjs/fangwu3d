import { NextResponse } from 'next/server';
import { callMimo } from '@/lib/mimo';
import { requireSession } from '@/lib/auth';
import { mergeRuns, parseRecognition, type RawRun } from '@/lib/recognition';
import { assignOpeningsToRooms } from '@i-renovation/shared/plan';

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

    const prompt = [
      '这是一张户型平面图（可能是手绘草图或标准制图）。请识别图中所有房间，以及墙上所有的门和窗。',
      '只返回严格 JSON，不要 markdown 代码块、不要解释：',
      '{"rooms":[{"name":"客厅","x":0.1,"y":0.2,"w":0.35,"d":0.4}],"windows":[{"x":0.2,"y":0.19,"w":0.1,"d":0.02}],"doors":[{"x":0.44,"y":0.5,"w":0.02,"d":0.08}]}',
      '所有坐标都是相对整图的归一化坐标（0~1），x 向右、y 向下，w/d 为宽高。',
      'rooms 是房间矩形，忽略尺寸标注和文字注释，房间名用中文（客厅/主卧/次卧/厨房/卫生间/阳台/书房/餐厅等）。',
      'windows 是每一扇窗在图上的外框（窗通常画成墙上的蓝色双线或细线）。doors 是每一扇门在图上的外框（门画成墙上的一个缺口，常带一段弧线）。',
      '一扇门或窗只写一次，即使它被两个房间共用。只写图上真的画出来的，不要猜。没有就写 []。',
    ].join('\n');

    const settled = await Promise.allSettled(Array.from({ length: RUNS }, () =>
      callMimo([{ role: 'user', content: prompt }], { imageBase64: b64, mime, maxTokens: 4000, noThinking: true })));

    const runs: RawRun[] = [];
    let tokensUsed = 0;
    let lastRaw = '';
    let lastError = '';
    for (const r of settled) {
      if (r.status === 'rejected') { lastError = (r.reason as Error).message; continue; }
      tokensUsed += r.value.tokensUsed;
      lastRaw = r.value.text;
      const run = parseRecognition(r.value.text);
      if (run) runs.push(run);
    }
    if (runs.length === 0) {
      return NextResponse.json({ error: lastError || '识别结果无法解析', raw: lastRaw.slice(0, 200) }, { status: lastError ? 502 : 422 });
    }

    const merged = mergeRuns(runs);
    const { rooms, windows, doors } = merged.run;
    if (rooms.length === 0) {
      return NextResponse.json({ error: '多次识别没有一致的房间，请换一张更清晰的户型图', raw: lastRaw.slice(0, 200) }, { status: 422 });
    }
    const hints = assignOpeningsToRooms(rooms, [
      ...windows.map(({ votes, ...b }) => ({ type: 'window' as const, ...b, conf: votes / merged.runs })),
      ...doors.map(({ votes, ...b }) => ({ type: 'door' as const, ...b, conf: votes / merged.runs })),
    ]);

    // runs：实际用来取一致的识别次数。只有 1 次时没法互相印证，调用方应提示「未经核对」。
    return NextResponse.json({ rooms: rooms.map((r, i) => ({ ...r, openings: hints[i] })), runs: merged.runs, tokensUsed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
