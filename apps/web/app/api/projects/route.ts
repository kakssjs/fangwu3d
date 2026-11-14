import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: '请使用项目表单提交' }, { status: 400 }); }
  const name = String(form.get('name') ?? '').trim();
  const style = String(form.get('style') ?? '现代简约');
  const budget = String(form.get('budget') ?? '');
  const area = String(form.get('area') ?? '');
  const needs = String(form.get('needs') ?? '');
  const homeownerId = s.uid;
  const file = form.get('floorPlan') as File | null;

  const requestKey = String(form.get('requestKey') ?? '');
  if (!name || name.length > 120 || style.length > 80 || budget.length > 64 || needs.length > 5000 || requestKey.length > 80 || (area && (!Number.isFinite(Number(area)) || Number(area) <= 0 || Number(area) > 10000))) return NextResponse.json({ error: '请检查项目名称、面积和说明长度' }, { status: 400 });

  let floorPlanPath: string | undefined;
  try {
  if (file && file.size > 0) {
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: '户型图不得超过 10MB' }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg' : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
    if (!ext) return NextResponse.json({ error: '请上传有效的 PNG、JPEG 或 WebP 户型图' }, { status: 400 });
    const dir = process.env.IRENO_UPLOAD_DIR || path.join(process.cwd(), '..', '..', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    floorPlanPath = path.join(dir, `${randomUUID()}.${ext}`);
    fs.writeFileSync(floorPlanPath, bytes);
  }

  // 房屋位置（可选）：文本截断长度，经纬度只接受中国范围内的数字
  const text = (key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max) || undefined;
  const coord = (key: string, min: number, max: number) => {
    const v = Number(form.get(key));
    return form.get(key) && Number.isFinite(v) && v >= min && v <= max ? v.toFixed(6) : undefined;
  };
  const location = {
    province: text('province', 40), city: text('city', 40), district: text('district', 40),
    community: text('community', 80), address: text('address', 200),
    lng: coord('lng', 73, 136), lat: coord('lat', 3, 54),
  };

  const project = await createProject({ name, style, budget, area, needs, floorPlanPath, homeownerId, requestKey: requestKey || undefined, ...location });
  if (floorPlanPath && project.floorPlanPath !== floorPlanPath) fs.unlinkSync(floorPlanPath);
  return NextResponse.json({ id: project.id });
  } catch {
    if (floorPlanPath) { try { fs.unlinkSync(floorPlanPath); } catch {} }
    return NextResponse.json({ error: '项目保存失败，请稍后重试；不会重复创建同一请求' }, { status: 503 });
  }
}
