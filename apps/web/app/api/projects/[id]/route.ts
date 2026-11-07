import { NextResponse } from 'next/server';
import { getProject, listResults, listTasks, deleteProject } from '@i-renovation/shared';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const [results, tasks] = await Promise.all([listResults(id), listTasks(id)]);
  return NextResponse.json({ project, results, tasks });
}

// 删除项目（业主在「我的项目」里删除）：级联清理任务/结果/订单/投标/合同
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
  const ok = await deleteProject(id);
  if (!ok) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}
