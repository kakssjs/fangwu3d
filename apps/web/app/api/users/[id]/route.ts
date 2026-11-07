import { NextResponse } from 'next/server';
import { getUser, updateCompanyProfile } from '@i-renovation/shared';
import { forbidden, requireSession } from '@/lib/auth';

// 装修队补充/更新资质材料（更新后重置为待审核，由老板人工审核）
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req, ['company']); if (s instanceof NextResponse) return s;
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
    if (id !== s.uid) return forbidden();

    const user = await getUser(id);
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    if (user.role !== 'company') return NextResponse.json({ error: '仅装潢公司可提交资质' }, { status: 403 });

    const body = (await req.json()) as {
      companyName?: string; license?: string;
      qualifications?: string[]; districts?: string[];
      serviceTypes?: string[]; specialties?: string[];
    };
    const patch: Record<string, unknown> = {};
    if (body.companyName?.trim()) patch.companyName = body.companyName.trim();
    if (body.license !== undefined) patch.license = body.license.trim();
    if (Array.isArray(body.qualifications)) patch.qualifications = body.qualifications;
    if (Array.isArray(body.districts)) patch.districts = body.districts;
    if (Array.isArray(body.serviceTypes)) patch.serviceTypes = body.serviceTypes;
    if (Array.isArray(body.specialties)) patch.specialties = body.specialties;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '没有可更新的资质字段' }, { status: 400 });
    }

    await updateCompanyProfile(id, patch);
    const updated = await getUser(id);
    return NextResponse.json({ id: updated?.id, verified: updated?.verified, license: updated?.license });
  } catch {
    return NextResponse.json({ error: '资质提交失败' }, { status: 400 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req); if (s instanceof NextResponse) return s;
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
    if (s.role !== 'boss' && id !== s.uid) return forbidden();
    const user = await getUser(id);
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    const { passwordHash: _ph, ...safe } = user;
    return NextResponse.json(safe);
  } catch {
    return NextResponse.json({ error: '查询失败' }, { status: 400 });
  }
}
