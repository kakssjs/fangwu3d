import { NextResponse } from 'next/server';
import { createTask, getProject } from '@i-renovation/shared';
import { canEditProject, forbidden, requireSession } from '@/lib/auth';

// 按用户户型图（识别/手绘房间）重新生成：重建 floor_plan 任务，整条 CORE_CHAIN 重跑
// （施工图 / 各房间渲染图 / 报价 / 匹配全部按新房间重算）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireSession(req); if (s instanceof NextResponse) return s;
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await canEditProject(s, id))) return forbidden();
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const task = await createTask(id, 'orchestrator', 'floor_plan', {
    projectId: id,
    reason: body.reason ?? '按用户识别/手绘的房间重新生成设计包',
  });
  return NextResponse.json({ ok: true, taskId: task.id });
}
