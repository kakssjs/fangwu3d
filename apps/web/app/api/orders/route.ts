import { NextResponse } from 'next/server';
import { createOrder, listOrdersByHomeowner, listOrdersByCompany, listOpenOrders } from '@i-renovation/shared';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { projectId?: number; homeownerId?: number };
    const projectId = Number(body.projectId);
    const homeownerId = Number(body.homeownerId);
    if (!Number.isFinite(projectId)) return NextResponse.json({ error: '缺少有效的 projectId' }, { status: 400 });
    if (!Number.isFinite(homeownerId)) return NextResponse.json({ error: '缺少有效的 homeownerId' }, { status: 400 });

    const order = await createOrder({ projectId, homeownerId, status: 'open' });
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: '创建订单失败' }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const id = Number(searchParams.get('id'));
    const status = searchParams.get('status');

    if (role === 'homeowner') {
      if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id 参数' }, { status: 400 });
      return NextResponse.json(await listOrdersByHomeowner(id));
    }
    if (role === 'company') {
      if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id 参数' }, { status: 400 });
      return NextResponse.json(await listOrdersByCompany(id));
    }
    if (status === 'open') {
      return NextResponse.json(await listOpenOrders());
    }
    return NextResponse.json({ error: '请指定 role=homeowner|company 或 status=open' }, { status: 400 });
  } catch (e: any) {
    console.error('orders GET error:', e?.message || e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
