import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, service: 'i-renovation-web', time: new Date().toISOString() });
}
