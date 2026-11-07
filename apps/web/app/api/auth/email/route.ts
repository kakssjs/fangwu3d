import { NextResponse } from 'next/server';
import { emailEnabled } from '@/lib/email';

// 邮箱验证是否开启（页面据此显示邮箱验证码注册和邮箱登录）。不暴露任何发信设置。
export async function GET() {
  return NextResponse.json({ enabled: emailEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
}
