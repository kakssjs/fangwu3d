import { NextResponse } from 'next/server';
import { getProject, listResults, listTasks, deleteProject } from '@i-renovation/shared';
import { canEditProject, canViewProject, forbidden, requireSession } from '@/lib/auth';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireSession(req); if (s instanceof NextResponse) return s;
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
  if (!(await canViewProject(s, id))) return forbidden();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const [results, tasks] = await Promise.all([listResults(id), listTasks(id)]);
  // 装修公司只看到省/市/区（脱敏）；小区、详细地址和坐标只给业主本人和老板
  if (s.role === 'company') {
    const { community: _c, address: _a, lng: _x, lat: _y, ...visible } = project;
    return NextResponse.json({ project: visible, results, tasks });
  }
  return NextResponse.json({ project, results, tasks });
}

// 删除项目（业主在「我的项目」里删除）：级联清理任务/结果/订单/投标/合同
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireSession(req); if (s instanceof NextResponse) return s;
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
  if (!(await canEditProject(s, id))) return forbidden();
  const ok = await deleteProject(id);
  if (!ok) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}
