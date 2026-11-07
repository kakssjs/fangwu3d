import { NextResponse } from 'next/server';
import { getUserByPhone } from '@i-renovation/shared';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { phone?: string; password?: string };
    const phone = (body.phone ?? '').trim();
    if (!phone) return NextResponse.json({ error: '请填写手机号' }, { status: 400 });

    const user = await getUserByPhone(phone);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    // 演示模式：不做真实密码校验
    return NextResponse.json({
      id: user.id,
      role: user.role,
      name: user.name,
      companyName: user.companyName ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: '登录失败' }, { status: 400 });
  }
}
