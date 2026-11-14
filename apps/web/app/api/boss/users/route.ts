import { NextResponse } from 'next/server';
import { deleteUser, listAllUsers } from '@i-renovation/shared';
import { requireSession } from '@/lib/auth';

// 老板控制台 · 用户管理：查看已注册用户，注销指定用户（仅老板）
export async function GET(req: Request) {
  const s = await requireSession(req, ['boss']); if (s instanceof NextResponse) return s;
  return NextResponse.json(await listAllUsers());
}

export async function DELETE(req: Request) {
  const s = await requireSession(req, ['boss']); if (s instanceof NextResponse) return s;
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: '缺少有效的用户 id' }, { status: 400 });
  try {
    const result = await deleteUser(id);
    if (result.ok) return NextResponse.json({ ok: true });
    if (result.reason === 'not_found') return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    return NextResponse.json({ error: '该装修公司已被选为订单施工方，不能注销；请先处理相关订单' }, { status: 409 });
  } catch {
    return NextResponse.json({ error: '注销失败，请稍后重试' }, { status: 500 });
  }
}
