import { NextResponse } from 'next/server';
import { resumeWaitingTasks } from '@i-renovation/shared';

// 用户补充信息后恢复等待中的任务（EXCEPTION_RULES reask_user → waiting_user → pending 续跑）
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const resumed = await resumeWaitingTasks(id);
  return NextResponse.json({ ok: true, resumed });
}
