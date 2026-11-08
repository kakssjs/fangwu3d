import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { refreshCompanyMembership } from '@/lib/company-payment';

export async function GET(req: Request) {
  const s = await requireSession(req, ['company']);
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(await refreshCompanyMembership(s.uid), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '权益查询失败' }, { status: 503 });
  }
}
