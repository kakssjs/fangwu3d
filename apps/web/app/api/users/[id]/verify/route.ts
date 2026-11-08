import { NextResponse } from 'next/server';
import { getUser, setUserVerified } from '@i-renovation/shared';
import { requireSession } from '@/lib/auth';

// 资质审核：企业付费会员确认后自动通过（lib/company-payment.ts）；老板仍可在这里人工通过或驳回
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req, ['boss']); if (s instanceof NextResponse) return s;
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });

    const user = await getUser(id);
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    if (user.role !== 'company') return NextResponse.json({ error: '仅装潢公司有资质状态' }, { status: 403 });

    const body = (await req.json()) as { action?: string };
    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json({ error: 'action 必须为 approve 或 reject' }, { status: 400 });
    }

    await setUserVerified(id, body.action === 'approve' ? 1 : -1);
    return NextResponse.json({ id, verified: body.action === 'approve' ? 1 : -1 });
  } catch {
    return NextResponse.json({ error: '审核操作失败' }, { status: 400 });
  }
}
