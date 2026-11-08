import { NextResponse } from 'next/server';
import { upsertResult, getResult } from '@i-renovation/shared';
import { canEditProject, forbidden, requireSession } from '@/lib/auth';
import { applyPascalEdit, type PascalEditAction } from '@/lib/pascal-bridge';
import type { SceneModel } from '@i-renovation/shared/scene3d';
import { validateSceneModel } from '@i-renovation/shared/scene3d';

export async function POST(req: Request) {
  try {
    const s = await requireSession(req);
    if (s instanceof NextResponse) return s;
    const projectId = Number((await req.clone().json() as { projectId?: number }).projectId);
    if (!Number.isFinite(projectId)) return NextResponse.json({ error: '缺少有效项目 id' }, { status: 400 });
    if (!(await canEditProject(s, projectId))) return forbidden();

    const body = await req.json() as { sceneModel?: SceneModel; action?: PascalEditAction };
    const current = body.sceneModel ?? (await getResult(projectId, 'scene_model'))?.content as SceneModel | undefined;
    if (!current || current.schema !== 'i-renovation-scene3d@1') {
      return NextResponse.json({ error: '缺少有效 scene_model' }, { status: 400 });
    }
    if (!body.action?.type || !['set_camera', 'set_material_preset', 'replace_geometry', 'place_furniture'].includes(body.action.type)) return NextResponse.json({ error: '编辑 action 无效' }, { status: 400 });

    const next = applyPascalEdit(current, body.action);
    if (!validateSceneModel(next).ok) return NextResponse.json({ error: '编辑后的场景无效' }, { status: 400 });
    await upsertResult(projectId, 'scene_model', next);
    return NextResponse.json({ ok: true, sceneModel: next });
  } catch {
    return NextResponse.json({ error: 'Pascal 场景编辑失败' }, { status: 400 });
  }
}
