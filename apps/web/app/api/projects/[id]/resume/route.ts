import { NextResponse } from 'next/server';
import { resumeWaitingTasks } from '@i-renovation/shared';
import { canEditProject, forbidden, requireSession } from '@/lib/auth';

// 用户补充信息后恢复等待中的任务（EXCEPTION_RULES reask_user → waiting_user → pending 续跑）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireSession(req); if (s instanceof NextResponse) return s;
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  if (!(await canEditProject(s, id))) return forbidden();
  const resumed = await resumeWaitingTasks(id);
  return NextResponse.json({ ok: true, resumed });
}
