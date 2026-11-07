import { NextResponse } from 'next/server';
import { createOrder, getProject, listOrdersByHomeowner, listOrdersByCompany, listOpenOrders } from '@i-renovation/shared';
import { forbidden, requireSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['homeowner']); if (s instanceof NextResponse) return s;
    const body = (await req.json()) as { projectId?: number };
    const projectId = Number(body.projectId);
    if (!Number.isFinite(projectId)) return NextResponse.json({ error: '缺少有效的 projectId' }, { status: 400 });
    // 只能为自己的项目发布订单
    const project = await getProject(projectId);
    if (!project || project.homeownerId !== s.uid) return forbidden();
    const homeownerId = s.uid;

    const order = await createOrder({ projectId, homeownerId, status: 'open' });
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: '创建订单失败' }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const s = await requireSession(req); if (s instanceof NextResponse) return s;
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    // 只返回当前登录者自己的订单（老板可按 id 查看）
    const id = s.role === 'boss' ? Number(searchParams.get('id')) : s.uid;

    if (role === 'homeowner') {
      if (s.role === 'company') return forbidden();
      if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id 参数' }, { status: 400 });
      return NextResponse.json(await listOrdersByHomeowner(id));
    }
    if (role === 'company') {
      if (s.role === 'homeowner') return forbidden();
      if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id 参数' }, { status: 400 });
      return NextResponse.json(await listOrdersByCompany(id));
    }
    if (status === 'open') {
      if (s.role === 'homeowner') return forbidden();
      return NextResponse.json(await listOpenOrders());
    }
    return NextResponse.json({ error: '请指定 role=homeowner|company 或 status=open' }, { status: 400 });
  } catch (e: any) {
    console.error('orders GET error:', e?.message || e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
