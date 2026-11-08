import { NextResponse } from 'next/server';
import { listPriceReferences } from '@i-renovation/shared';

// 公开市场参考价（只读）：每条带来源链接、发布日期和采集日期。?city=杭州 时同时返回「全国」参考
export async function GET(req: Request) {
  const city = new URL(req.url).searchParams.get('city')?.trim() || undefined;
  if (city && city.length > 20) return NextResponse.json({ error: 'city 无效' }, { status: 400 });
  return NextResponse.json({ referenceOnly: true, items: await listPriceReferences(city) });
}
