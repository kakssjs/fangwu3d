import { NextResponse } from 'next/server';

// 高德安全密钥代理（高德推荐的 serviceHost 方式）：浏览器的搜索/逆地理请求经这里转发，
// 服务器附加 jscode。只转发 restapi.amap.com 的只读 /v3、/v4 接口，且必须带本站 Key，不是开放代理。
const UPSTREAM = 'https://restapi.amap.com';
const PER_MINUTE = 240;
const hits = new Map<string, { count: number; reset: number }>();

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const key = process.env.AMAP_KEY;
  const code = process.env.AMAP_SECURITY_CODE;
  if (!key || !code) return NextResponse.json({ message: '地图搜索未配置' }, { status: 503 });
  const { path } = await ctx.params;
  const target = new URL('/' + path.map(encodeURIComponent).join('/'), UPSTREAM);
  target.search = new URL(req.url).search;
  if (target.origin !== UPSTREAM || !/^\/v[34]\//.test(target.pathname) || target.searchParams.get('key') !== key) {
    return NextResponse.json({ message: 'Not allowed' }, { status: 403 });
  }
  const who = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const seen = hits.get(who);
  if (!seen || seen.reset < now) hits.set(who, { count: 1, reset: now + 60_000 });
  else if (++seen.count > PER_MINUTE) return NextResponse.json({ message: '地图请求过于频繁' }, { status: 429 });
  target.searchParams.set('jscode', code);
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ message: '地图服务无响应' }, { status: 502 });
  }
}
