import { NextResponse } from 'next/server';
import { callMimo } from '@/lib/mimo';

// 户型图视觉识别：图片 → 房间矩形（归一化 0~1 坐标）
// body: { image: dataURI | rawBase64 }
// 返回 { rooms: [{ name, x, y, w, d }] }，供 planFromRects 生成 3D 几何
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { image?: string };
    const image = body.image ?? '';
    if (!image) return NextResponse.json({ error: '缺少 image' }, { status: 400 });

    const m = /^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/.exec(image);
    const mime = m ? m[1] : 'image/png';
    const b64 = m ? m[2] : image;

    const prompt = [
      '这是一张户型平面图（可能是手绘草图或标准制图）。请识别图中所有房间。',
      '只返回严格 JSON，不要 markdown 代码块、不要解释：',
      '[{"name":"客厅","x":0.1,"y":0.2,"w":0.35,"d":0.4}]',
      'x/y/w/d 为相对整图的归一化坐标（0~1），x 向右、y 向下，w/d 为宽高。',
      '忽略尺寸标注和文字注释，只输出房间矩形。房间名用中文（客厅/主卧/次卧/厨房/卫生间/阳台/书房/餐厅等）。',
    ].join('\n');

    const { text, tokensUsed } = await callMimo(
      [{ role: 'user', content: prompt }],
      { imageBase64: b64, mime },
    );

    // 宽容解析：提取首个 [...] 块
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return NextResponse.json({ error: '识别结果无 JSON', raw: text.slice(0, 200) }, { status: 422 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return NextResponse.json({ error: '识别结果 JSON 解析失败', raw: text.slice(0, 200) }, { status: 422 });
    }

    const rooms = (Array.isArray(parsed) ? parsed : [])
      .map((r) => {
        const o = r as Record<string, unknown>;
        const num = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : NaN;
        };
        return {
          name: typeof o.name === 'string' ? o.name : '',
          x: num(o.x), y: num(o.y), w: num(o.w), d: num(o.d),
        };
      })
      .filter((r) => r.name && r.w > 0.02 && r.d > 0.02);

    if (rooms.length === 0) {
      return NextResponse.json({ error: '未能识别出房间', raw: text.slice(0, 200) }, { status: 422 });
    }
    return NextResponse.json({ rooms, tokensUsed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
