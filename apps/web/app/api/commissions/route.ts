import { NextResponse } from 'next/server';
import { getCommissionSettlementByOrder, getDb, commissionSettlements, setCommissionSettlementStatus } from '@i-renovation/shared';
import { requireSession } from '@/lib/auth';
import { asc } from 'drizzle-orm';

export async function GET(req: Request) {
  try {
    const s = await requireSession(req, ['boss']);
    if (s instanceof NextResponse) return s;
    const db = await getDb();
    const rows = await db.select().from(commissionSettlements).orderBy(asc(commissionSettlements.id));
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: '利润分成记录查询失败' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ['boss']);
    if (s instanceof NextResponse) return s;
    const body = await req.json() as { settlementId?: number; orderId?: number; action?: 'settle' | 'cancel' };
    let id = Number(body.settlementId);
    if (!Number.isFinite(id) && Number.isFinite(body.orderId)) {
      const row = await getCommissionSettlementByOrder(Number(body.orderId));
      id = Number(row?.id);
    }
    if (!Number.isFinite(id) || !['settle', 'cancel'].includes(body.action ?? '')) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }
    const row = await setCommissionSettlementStatus(id, body.action === 'settle' ? 'settled' : 'cancelled');
    if (!row) return NextResponse.json({ error: '分成记录不存在' }, { status: 404 });
    return NextResponse.json({ ok: true, settlement: row });
  } catch {
    return NextResponse.json({ error: '利润分成确认失败' }, { status: 400 });
  }
}
