import { NextResponse } from 'next/server';
import { saveResult, upsertResult, listResults, getResult } from '@i-renovation/shared';
import { canEditProject, canViewProject, forbidden, requireSession } from '@/lib/auth';
import { validateSceneModel, type SceneModel } from '@i-renovation/shared/scene3d';

// 保存项目产物（户型输入、标准平面图等）；upsert=true 时同 kind 覆盖为最新
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req); if (s instanceof NextResponse) return s;
    const projectId = Number((await ctx.params).id);
    if (!Number.isFinite(projectId)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
    if (!(await canEditProject(s, projectId))) return forbidden();

    const body = (await req.json()) as { kind?: string; content?: unknown; upsert?: boolean };
    const kind = (body.kind ?? '').trim();
    if (!['floorplan', 'decorations', 'decision', 'scene_model'].includes(kind) && s.role !== 'boss') return NextResponse.json({ error: '该产物只能由服务端生成' }, { status: 403 });
    if (!kind) return NextResponse.json({ error: '缺少 kind' }, { status: 400 });
    if (body.content === undefined || body.content === null) {
      return NextResponse.json({ error: '缺少 content' }, { status: 400 });
    }

    if (kind === 'scene_model' && !validateSceneModel(body.content as SceneModel).ok) return NextResponse.json({ error: '3D 场景数据无效' }, { status: 400 });
    if (kind === 'decision') {
      const quote = (await getResult(projectId, 'quote'))?.content as { total?: number } | undefined;
      const decision = body.content as { adjustPct?: number };
      const adjust = Number(decision.adjustPct ?? 0);
      if (!quote?.total || !Number.isFinite(adjust) || Math.abs(adjust) > 50) return NextResponse.json({ error: '请先完成有效报价，调整幅度应在正负 50% 内' }, { status: 400 });
      body.content = { finalTotal: Math.round(quote.total * (1 + adjust / 100)), adjustPct: adjust, confirmedAt: new Date().toISOString() };
    }
    if (body.upsert) await upsertResult(projectId, kind, body.content);
    else await saveResult(projectId, kind, body.content);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 400 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const projectId = Number((await ctx.params).id);
    if (!Number.isFinite(projectId)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
    const s = await requireSession(req); if (s instanceof NextResponse) return s;
    if (!(await canViewProject(s, projectId))) return forbidden();
    return NextResponse.json(await listResults(projectId));
  } catch {
    return NextResponse.json({ error: '查询失败' }, { status: 400 });
  }
}
