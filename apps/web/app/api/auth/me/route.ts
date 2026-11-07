import { NextResponse } from 'next/server';
import { getUser } from '@i-renovation/shared';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get('id');
    const id = Number(idParam);
    if (!idParam || Number.isNaN(id)) {
      return NextResponse.json({ error: '缺少有效的 id 参数' }, { status: 400 });
    }

    const user = await getUser(id);
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const { passwordHash: _passwordHash, ...safe } = user;
    return NextResponse.json(safe);
  } catch {
    return NextResponse.json({ error: '查询失败' }, { status: 400 });
  }
}
