import { NextResponse } from 'next/server';
import { getUser } from '@i-renovation/shared';
import { requireSession } from '@/lib/auth';

// 当前登录用户（来自签名 Cookie，不接受页面传来的 id）
export async function GET(req: Request) {
  try {
    const s = await requireSession(req);
    if (s instanceof NextResponse) return s;
    if (s.role === 'boss') return NextResponse.json({ id: 0, role: 'boss', name: '平台老板' });

    const user = await getUser(s.uid);
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    const { passwordHash: _passwordHash, ...safe } = user;
    return NextResponse.json(safe);
  } catch {
    return NextResponse.json({ error: '查询失败' }, { status: 400 });
  }
}
