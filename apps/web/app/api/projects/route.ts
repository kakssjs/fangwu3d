import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { createProject, getProjectsByHomeowner } from '@i-renovation/shared';
import { requireSession } from '@/lib/auth';

export async function GET(req: Request) {
  const s = await requireSession(req, ['homeowner', 'boss']); if (s instanceof NextResponse) return s;
  const url = new URL(req.url);
  // 业主只能看自己的项目；老板可按 homeownerId 查看
  const homeownerId = s.role === 'homeowner' ? s.uid : Number(url.searchParams.get('homeownerId'));
  if (!homeownerId) return NextResponse.json([], { status: 200 });
  const projects = await getProjectsByHomeowner(homeownerId);
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const s = await requireSession(req, ['homeowner']); if (s instanceof NextResponse) return s;
  const form = await req.formData();
  const name = String(form.get('name') ?? '').trim();
  const style = String(form.get('style') ?? '现代简约');
  const budget = String(form.get('budget') ?? '');
  const area = String(form.get('area') ?? '');
  const needs = String(form.get('needs') ?? '');
  const homeownerId = s.uid;
  const file = form.get('floorPlan') as File | null;

  if (!name) return NextResponse.json({ error: '请填写项目名称' }, { status: 400 });

  let floorPlanPath: string | undefined;
  if (file && file.size > 0) {
    const dir = path.join(process.cwd(), '..', '..', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    floorPlanPath = path.join(dir, `${Date.now()}_${file.name}`);
    fs.writeFileSync(floorPlanPath, Buffer.from(await file.arrayBuffer()));
  }

  const project = await createProject({ name, style, budget, area, needs, floorPlanPath, homeownerId });
  return NextResponse.json({ id: project.id });
}
