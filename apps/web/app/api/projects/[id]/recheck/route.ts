import { NextResponse } from 'next/server';
import { createTask, getProject } from '@i-renovation/shared';
import { canEditProject, forbidden, requireSession } from '@/lib/auth';

// 重新质检：老板裁决「重跑」或报价修订后触发 QA 复检（EXCEPTION_RULES 流程闭环）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireSession(req); if (s instanceof NextResponse) return s;
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await canEditProject(s, id))) return forbidden();
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const task = await createTask(id, 'orchestrator', 'qa', { projectId: id, reason: body.reason ?? '重新质检（QA recheck）' });
  return NextResponse.json({ ok: true, taskId: task.id });
}
