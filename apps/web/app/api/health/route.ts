import { NextResponse } from 'next/server';
import { getDb } from '@i-renovation/shared';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    await (await getDb()).execute(sql`select 1`);
    return NextResponse.json({ ok: true, service: 'i-renovation-web', database: 'ready' });
  } catch {
    return NextResponse.json({ ok: false, database: 'unavailable' }, { status: 503 });
  }
}
