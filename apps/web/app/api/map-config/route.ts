import { NextResponse } from 'next/server';

// 高德地图配置：只返回公开的 Web(JS API) Key；安全密钥 AMAP_SECURITY_CODE 只留在服务器，由 /amap-service 代理附加
export function GET() {
  const key = process.env.AMAP_KEY ?? '';
  if (!key) return NextResponse.json({ amap: null });
  return NextResponse.json({ amap: { key, searchReady: Boolean(process.env.AMAP_SECURITY_CODE), serviceHost: '/amap-service' } });
}
