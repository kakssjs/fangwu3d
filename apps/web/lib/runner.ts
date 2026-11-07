// Agent Runner（开发模式内嵌于 Next 服务进程；生产拆分为 apps/worker + BullMQ）
// 按 CORE_CHAIN 流转：floor_plan → designer → quote → qa；
// matcher 不入链——等「业主确认发布 + 装修公司发布数据（投标）」后单独触发
// 异常处理按 EXCEPTION_RULES 分派：retry（重试≤N）/ degrade（降级交付）/ escalate_boss（升级老板裁决）/ reask_user（反问用户补充）
import fs from 'node:fs';
import path from 'node:path';
import {
  claimNextTask, createTask, finishTask, failTask, escalateTask, waitingTask, upsertResult, getProject, getResult, listTasks,
  calcQuote, generatePlanGeometry, planFromRects, planToSvg, listCompanies, getOrderByProject, listBidsByOrder, CORE_CHAIN, EXCEPTION_RULES,
  classifyException, exceptionInfo, buildSceneModel, validateSceneModel, describeMaterialPreset,
  type PlanRoom, type PlanGeometry, type QuoteItem,
} from '@i-renovation/shared';
import { callMimo } from './mimo';
import { generateImage } from './agnes';

function heuristicPlan(area?: string): PlanRoom[] {
  const total = Number(area) || 89;
  const ratio: [string, number][] = [
    ['客厅', 0.28], ['主卧', 0.18], ['次卧', 0.13], ['厨房', 0.09], ['卫生间', 0.07], ['阳台', 0.06],
  ];
  return ratio.map(([name, r]) => ({ name, area: Math.round(total * r * 10) / 10 }));
}

// —— 匹配智能体：按注册装修队真实资质打分匹配 ——
// ★ 红线：verified 仅由老板人工审核（users/[id]/verify），Agent 只读取展示，不代为认证
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x.trim());
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

interface CompanyRow {
  id: number; name: string; companyName?: string | null; license?: string | null;
  qualifications?: unknown; districts?: unknown; serviceTypes?: unknown; specialties?: unknown;
  verified: number;
}

function scoreCompany(c: CompanyRow, style: string) {
  const districts = asArray(c.districts);
  const types = asArray(c.serviceTypes);
  const specialties = asArray(c.specialties);
  let score = 0;
  const reasons: string[] = [];
  if (c.verified === 1) { score += 30; reasons.push('资质已通过人工审核'); }
  else { score += 6; reasons.push('资质已提交，待人工审核'); }
  if (specialties.some(s => s.includes(style) || style.includes(s))) { score += 25; reasons.push(`${style} 风格专长`); }
  if (types.length) { score += 15; reasons.push(`承接 ${types.slice(0, 3).join(' / ')}`); }
  if (districts.length) { score += 15; reasons.push(`服务 ${districts.slice(0, 3).join(' / ')}`); }
  if (c.license) { score += 10; reasons.push('营业执照已备案'); }
  if (asArray(c.qualifications).length) { score += 5; reasons.push('持专业资质证书'); }
  return { score: Math.min(100, score), reason: reasons.join('，') };
}

interface BidRow {
  id: number; orderId: number; companyId: number; companyName: string;
  amount: string; weeks: string; note?: string | null;
}

/** 投标匹配打分：资质档案（人工审核状态等）×0.65 + 报价/工期贴合度（真实投标数据） */
function scoreBid(c: CompanyRow | undefined, b: BidRow, style: string, quoteTotal: number) {
  const reasons: string[] = [];
  let score = 0;
  if (c) {
    const s = scoreCompany(c, style);
    score += Math.round(s.score * 0.65);
    reasons.push(s.reason);
  } else {
    score += 8;
    reasons.push('投标公司资质档案未登记');
  }
  const amount = Number(String(b.amount).replace(/[^\d.]/g, '')) || 0;
  const weeks = Number(b.weeks) || 0;
  if (quoteTotal > 0 && amount > 0) {
    const drift = Math.abs(amount - quoteTotal) / quoteTotal;
    if (drift <= 0.15) { score += 20; reasons.push('报价与平台测算接近'); }
    else if (drift <= 0.35) { score += 12; reasons.push('报价基本合理'); }
    else if (amount > quoteTotal) { score += 2; reasons.push('报价明显高于平台测算'); }
    else { score += 8; reasons.push('报价低于平台测算'); }
  }
  if (weeks > 0 && weeks <= 12) { score += 15; reasons.push(`工期 ${weeks} 周较优`); }
  else if (weeks > 0 && weeks <= 20) { score += 8; reasons.push(`工期 ${weeks} 周`); }
  return { score: Math.min(100, score), reason: reasons.join('，') };
}

interface MatchedContractor {
  id: number; bidId: number; name: string; verified: boolean; score: number;
  amount: string; weeks: string; districts: string[]; types: string[]; reason: string;
}

// —— 匹配智能体数据源：装修公司真实投标（发布数据）+ 公司资质档案；无投标不出匹配 ——
async function matchBids(projectId: number, style: string) {
  const order = await getOrderByProject(projectId);
  const bids = (order ? await listBidsByOrder(order.id) : []) as BidRow[];
  const empty: MatchedContractor[] = [];
  if (!order || bids.length === 0) return { order, bids, contractors: empty };
  const quoteRow = await getResult(projectId, 'quote');
  const quoteTotal = Number((quoteRow?.content as { total?: number } | undefined)?.total) || 0;
  const companies = (await listCompanies()) as CompanyRow[];
  const byId = new Map(companies.map(c => [c.id, c]));
  const contractors: MatchedContractor[] = bids
    .map(b => {
      const c = byId.get(b.companyId);
      const s = scoreBid(c, b, style, quoteTotal);
      return {
        id: b.companyId, bidId: b.id, name: b.companyName,
        verified: c?.verified === 1,
        score: s.score,
        amount: b.amount, weeks: b.weeks,
        districts: asArray(c?.districts), types: asArray(c?.serviceTypes),
        reason: s.reason,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return { order, bids, contractors };
}

async function tryMimo(prompt: string, image?: { b64: string; mime: string }): Promise<string | null> {
  try {
    const r = await callMimo([{ role: 'user', content: prompt }], image ? { imageBase64: image.b64, mime: image.mime } : undefined);
        return r.text || null;
  } catch (e) {
    // 超时/网络类错误向上抛（EXCEPTION_RULES mimo_timeout → 重试）；其他错误降级规则引擎
    const msg = String((e as Error).message ?? e).toLowerCase();
    if (/timeout|timed out|etimedout|econnreset|econnrefused|fetch failed|network|socket hang up|429|502|503|abort/.test(msg)) throw e;
    console.warn('[mimo] 调用失败，降级规则引擎：', (e as Error).message, (e as Error).stack?.slice(0,200));
    return null;
  }
}

interface AgentOut {
  content: unknown; tokens: number;
  /** 触发的 EXCEPTION_RULES 规则键（如 low_confidence_floorplan）；有值时 tick 按规则动作分派 */
  exception?: string;
  /** 异常细节说明 */
  note?: string;
}

async function runAgent(task: { id: number; projectId: number; toAgent: string; input: never; output?: { resumed?: boolean } | null }): Promise<AgentOut> {
  const project = await getProject(task.projectId);
  if (!project) throw new Error('project not found');
  const resumed = !!task.output?.resumed; // 用户已确认补充（不再重复反问）

  switch (task.toAgent) {
    case 'floor_plan': {
      // ① 用户工作台房间优先（识别出来 / 画出来的）：有几个房间生成几个渲染图，几何保留原始位置
      const fpRow = await getResult(task.projectId, 'floorplan');
      const fpRects = ((fpRow?.content as { rects?: { name?: string; x?: number; y?: number; w?: number; d?: number }[] } | undefined)?.rects ?? [])
        .filter((r): r is { name: string; x: number; y: number; w: number; d: number } =>
          !!r && typeof r.name === 'string' && !!r.name.trim() && Number(r.w) > 0 && Number(r.d) > 0);
      if (fpRects.length > 0) {
        // 像素 → 米：优先按申报总面积校准，否则 80px≈1m（与画板「按此图生成 3D」同一换算）
        const pxArea = fpRects.reduce((s, r) => s + r.w * r.d, 0);
        const areaDeclared = Number(project.area) || 0;
        const mPerPx = areaDeclared > 10 && pxArea > 0 ? Math.sqrt(areaDeclared / pxArea) : 0.0125;
        const roomRects = fpRects.map(r => ({ name: r.name.trim(), x: r.x * mPerPx, y: r.y * mPerPx, w: r.w * mPerPx, d: r.d * mPerPx }));
        const plan: PlanRoom[] = roomRects.map(r => ({ name: r.name, area: Math.round(r.w * r.d * 10) / 10 }));
        const geometry = planFromRects(roomRects);
        const content = {
          rooms: plan,
          geometry,
          source: 'user_studio',
          confidence: 'high',
          note: `按你在画板上识别/手绘的 ${plan.length} 间房建模（保留房间位置），尺寸以现场量房为准`,
          warnings: geometry.warnings,
        };
        await upsertResult(task.projectId, 'plan', content);
        const sceneModel = buildSceneModel(geometry, plan, project.style, { source: 'floor_plan' });
        await upsertResult(task.projectId, 'scene_model', sceneModel);
        return { content, tokens: 0 };
      }
      // ② 上传户型图 → MiMo 识别（无工作台房间时）
      let image: { b64: string; mime: string } | undefined;
      if (project.floorPlanPath && fs.existsSync(project.floorPlanPath)) {
        image = { b64: fs.readFileSync(project.floorPlanPath).toString('base64'), mime: 'image/png' };
      }
      // 不给总面积锚：让识别按图独立输出面积，与用户声明面积的偏差判定才有意义
      const ai = await tryMimo(
        `识别这张户型图：输出 JSON 数组 [{"name":"房间名","area":平方米}]`, image,
      );
      let rooms: PlanRoom[] | null = null;
      if (ai) { try { rooms = JSON.parse(ai.replace(/```json|```/g, '').trim()); } catch { /* 降级 */ } }
      // —— 置信度判定：有户型图时识别失败/结果不合理 → low_confidence_floorplan（反问用户补充） ——
      const sumArea = rooms?.reduce((s, r) => s + (Number(r.area) || 0), 0) ?? 0;
      const declaredArea = Number(project.area) || 89;
      const valid = !!rooms && rooms.length >= 2 && rooms.every(r => r && typeof r.name === 'string' && Number(r.area) > 0);
      const areaOk = sumArea > 0 && Math.abs(sumArea - declaredArea) / declaredArea <= 0.4;
      const lowConfidence = !!image && (!valid || !areaOk) && !resumed;
      const plan = (valid ? rooms : null) ?? heuristicPlan(project.area ?? undefined);
      // 2D→3D 重建管线：房间 → 平面几何（墙/门/窗），供 2D 施工图与 3D 拉伸共用
      const totalArea = Number(project.area) || plan.reduce((s, r) => s + r.area, 0);
      const geometry = generatePlanGeometry(plan, { totalArea });
      const content = {
        rooms: plan,
        geometry,
        source: valid ? 'mimo' : 'rule_engine',
        confidence: lowConfidence ? 'low' : 'high',
        note: lowConfidence
          ? '户型图识别置信度低，已按规则引擎降级出图；请补充更清晰的户型图或在画板标注房间'
          : (!valid && resumed ? '用户已确认接受当前识别结果（规则引擎出图），可随时在画板修改' : 'AI 生成，尺寸以现场量房为准'),
        warnings: geometry.warnings,
      };
      await upsertResult(task.projectId, 'plan', content);
      const sceneModel = buildSceneModel(geometry, plan, project.style, { source: valid ? 'floor_plan' : 'agent_fallback' });
      await upsertResult(task.projectId, 'scene_model', sceneModel);
      return lowConfidence
        ? { content, tokens: 0, exception: 'low_confidence_floorplan', note: `识别结果：${valid ? `面积偏差 ${Math.round(Math.abs(sumArea - declaredArea) / declaredArea * 100)}%` : '房间数据不完整'}；已降级出图，等待用户补充` }
        : { content, tokens: 0 };
    }
    case 'designer': {
      const planRow = await getResult(task.projectId, 'plan');
      const planContent = planRow?.content as { rooms?: PlanRoom[]; geometry?: PlanGeometry } | undefined;
      const rooms = planContent?.rooms ?? heuristicPlan(project.area ?? undefined);
      const geometry = planContent?.geometry ?? generatePlanGeometry(rooms, { totalArea: Number(project.area) || undefined });
      const svg = planToSvg(geometry, project.style, project.name);
      const sceneModel = buildSceneModel(geometry, rooms, project.style, {
        source: planContent?.geometry ? 'floor_plan' : 'agent_fallback',
      });
      const content = {
        svg, rooms, geometry, style: project.style, needs: project.needs,
        sceneModelId: sceneModel.schema, materialPresetId: sceneModel.materialPresetId,
        note: 'AI 生成二维布局方案（施工参考）· 2D、3D、材质与导出共用同一套场景模型',
      };
      await upsertResult(task.projectId, 'design', content);
      await upsertResult(task.projectId, 'scene_model', sceneModel);

      // Agnes 生成各房间装饰效果图：房间有几个生成几个（用户识别/手绘房间优先，Agent 房间兜底），3 张并发
      const decorations: { room: string; prompt: string; url?: string; b64?: string }[] = new Array(rooms.length);
      let failedImages = 0;
      let nextIdx = 0;
      const workers = Array.from({ length: Math.min(3, rooms.length) }, async () => {
        while (nextIdx < rooms.length) {
          const i = nextIdx++;
          const room = rooms[i];
          const materialPrompt = describeMaterialPreset(sceneModel.materialPreset);
          const prompt = `Interior decoration design photo of a ${room.name}, ${room.area} square meters, ${project.style} style, fully furnished and decorated, warm lighting, realistic, high quality, architectural visualization. ${materialPrompt}`;
          try {
            const img = await generateImage({ prompt, size: '1K', ratio: '16:9' });
            decorations[i] = { room: room.name, prompt, url: img.url, b64: img.b64_json };
          } catch (e) {
            decorations[i] = { room: room.name, prompt, url: undefined };
            failedImages += 1;
            console.warn(`[agnes] 装饰图生成失败 ${room.name}:`, (e as Error).message);
          }
        }
      });
      await Promise.all(workers);
      await upsertResult(task.projectId, 'decorations', {
        images: decorations, style: project.style,
        degraded: failedImages > 0 ? 'render_failed' : undefined,
        note: failedImages > 0
          ? `AI 生成装饰效果图（${decorations.length - failedImages}/${decorations.length} 张成功，缺失部分已降级跳过，可对话补生成）`
          : `AI 生成装饰效果图（共 ${decorations.length} 间），可在工作台对话修改`,
      });
      return { content, tokens: 0 };
    }
    case 'quote': {
      const planRow = await getResult(task.projectId, 'plan');
      const rooms = (planRow?.content as { rooms?: PlanRoom[] })?.rooms ?? heuristicPlan(project.area ?? undefined);
      const quote = calcQuote(rooms, project.style);
      await upsertResult(task.projectId, 'quote', quote);
      return { content: quote, tokens: 0 };
    }
    case 'matcher': {
      // —— 匹配智能体：等「业主确认发布 + 装修公司发布数据（投标）」后触发，基于真实投标数据匹配 ——
      const { order, bids, contractors } = await matchBids(task.projectId, project.style);
      const topScore = contractors.length ? Math.max(...contractors.map(c => c.score)) : 0;
      if (contractors.length === 0 || topScore < 20) {
        // 不写 match 结果（避免展示空匹配）；等待更多投标 / 业主调整
        return {
          content: { contractors: [], source: 'bids', bidCount: bids.length, pushedAt: new Date().toISOString() },
          tokens: 0, exception: 'no_match',
          note: !order
            ? '项目尚未发布到接单市场'
            : bids.length === 0
              ? '订单已发布，尚未收到装修公司投标数据'
              : `投标最高匹配度 ${topScore} 分，暂无合适装修队`,
        };
      }
      const match = {
        contractors, source: 'bids', bidCount: bids.length,
        pushedAt: new Date().toISOString(),
        note: '基于装修公司真实投标数据（报价/工期）+ 资质档案匹配（审核状态为老板人工审核结果）；仅展示脱敏信息，最终选定由业主决定',
      };
      await upsertResult(task.projectId, 'match', match);
      return { content: match, tokens: 0 };
    }
    case 'qa': {
      // —— QA 质检：布局规则 + 报价核对 + 图片完整性（匹配质检移出核心链，由匹配智能体在投标后单独把关） ——
      const [planRow, quoteRow, decorRow] = await Promise.all([
        getResult(task.projectId, 'plan'), getResult(task.projectId, 'quote'),
        getResult(task.projectId, 'decorations'),
      ]);
      const planContent = planRow?.content as { rooms?: PlanRoom[]; geometry?: PlanGeometry; warnings?: string[] } | undefined;
      const quote = quoteRow?.content as { items?: QuoteItem[]; total?: number } | undefined;
      const decor = decorRow?.content as { images?: { url?: string; b64?: string }[] } | undefined;
      const sceneRow = await getResult(task.projectId, 'scene_model');
      const sceneModel = sceneRow?.content as Parameters<typeof validateSceneModel>[0] | undefined;

      interface Check { check: string; ok: boolean; rule?: string; level: 'critical' | 'warn'; detail: string }
      const checks: Check[] = [];

      // 1. 几何/布局规则校验（墙≥4、门洞、ForgeFloor 告警）
      const geo = planContent?.geometry;
      const wallCount = geo?.walls?.length ?? 0;
      const doorCount = geo?.walls?.reduce((s, w) => s + w.openings.filter(o => o.type === 'door').length, 0) ?? 0;
      checks.push({ check: '户型几何完整（墙体≥4 段）', ok: wallCount >= 4, rule: 'low_confidence_floorplan', level: 'critical', detail: `墙 ${wallCount} 段` });
      checks.push({ check: '门洞/动线连通', ok: doorCount >= 1, rule: 'low_confidence_floorplan', level: 'critical', detail: `门洞 ${doorCount} 个` });
      const geoWarnings = geo?.warnings ?? planContent?.warnings ?? [];
      checks.push({ check: '布局规则告警（重叠/门洞缺失等）', ok: geoWarnings.length === 0, rule: 'low_confidence_floorplan', level: 'warn', detail: geoWarnings.length ? geoWarnings.join('；') : '无告警' });

      // 2. 报价核对（明细合计=总价；与确定性基准偏离≤30%）
      const itemSum = (quote?.items ?? []).reduce((s, i) => s + (Number(i.total) || 0), 0);
      const quoteTotal = Number(quote?.total) || 0;
      checks.push({ check: '报价明细合计 = 总价', ok: quoteTotal > 0 && Math.abs(itemSum - quoteTotal) <= 1, rule: 'quote_mismatch', level: 'critical', detail: `明细合计 ¥${itemSum} vs 总价 ¥${quoteTotal}` });
      const baseline = calcQuote(planContent?.rooms ?? heuristicPlan(project.area ?? undefined), project.style);
      const drift = quoteTotal > 0 ? Math.abs(baseline.total - quoteTotal) / quoteTotal : 1;
      checks.push({ check: '报价与基准偏离 ≤ 30%', ok: drift <= 0.3, rule: 'quote_mismatch', level: 'critical', detail: `偏离 ${(drift * 100).toFixed(1)}%（基准 ¥${baseline.total}）` });

      // 3. 3D 场景模型完整性（几何、材质库、房间家具标签）
      const sceneCheck = sceneModel ? validateSceneModel(sceneModel) : { ok: false, errors: ['缺少 scene_model'] };
      checks.push({ check: '3D 场景模型完整性', ok: sceneCheck.ok, rule: 'render_failed', level: 'warn', detail: sceneCheck.ok ? '几何、材质库和房间模型均可用' : sceneCheck.errors.join('；') });

      // 4. 图片完整性（缺失 → render_failed 降级，不阻塞）
      const imgs = decor?.images ?? [];
      const okImgs = imgs.filter(i => i && (i.url || i.b64)).length;
      const imgOk = imgs.length === 0 || okImgs / imgs.length >= 0.5;
      checks.push({ check: '装饰图完整性（成功≥50%）', ok: imgOk, rule: 'render_failed', level: 'warn', detail: `${okImgs}/${imgs.length} 张可用` });

      const content: Record<string, unknown> = { checks, checkedAt: new Date().toISOString() };
      const criticalFail = checks.find(c => !c.ok && c.level === 'critical');
      const warnOnly = checks.some(c => !c.ok && c.level === 'warn');

      let out: AgentOut;
      if (criticalFail?.rule === 'quote_mismatch') {
        // ★ 红线：报价数字不符必须老板裁决，Agent 不得自行改价
        Object.assign(content, { passed: false, note: `报价核对未通过：${criticalFail.detail}；按红线升级老板裁决` });
        out = { content, tokens: 0, exception: 'quote_mismatch', note: criticalFail.detail };
      } else if (criticalFail?.rule === 'low_confidence_floorplan') {
        // 回退 designer 修正（≤2 轮），超限升级老板
        const allTasks = await listTasks(task.projectId);
        const rounds = allTasks.filter(t => t.fromAgent === 'qa' && t.toAgent === 'designer').length;
        if (rounds < 2) {
          Object.assign(content, { passed: false, fallback: 'designer', round: rounds + 1, note: `几何校验未通过（${criticalFail.detail}），回退设计智能体修正（第 ${rounds + 1}/2 轮）` });
          out = { content, tokens: 0 };
        } else {
          Object.assign(content, { passed: false, note: `几何校验回退 2 轮仍未通过（${criticalFail.detail}），升级老板裁决` });
          out = { content, tokens: 0, exception: 'qa_fallback_exhausted', note: criticalFail.detail };
        }
      } else {
        Object.assign(content, {
          passed: true,
          degraded: warnOnly ? 'render_failed' : undefined,
          note: warnOnly ? 'QA 通过（部分检查降级：图片/告警项）；项目进入「发布/匹配」阶段' : 'QA 通过；项目进入「发布/匹配」阶段',
        });
        out = { content, tokens: 0 };
      }
      await upsertResult(task.projectId, 'qa', content);
      return out;
    }
    default:
      throw new Error(`unknown agent: ${task.toAgent}`);
  }
}

/** 链式交接：按 CORE_CHAIN 建下一任务；qa 完成 → 项目进入发布/匹配阶段（stage 3） */
async function advanceChain(task: { projectId: number; toAgent: string }) {
  const idx = CORE_CHAIN.indexOf(task.toAgent as (typeof CORE_CHAIN)[number]);
  if (idx >= 0 && idx < CORE_CHAIN.length - 1) {
    await createTask(task.projectId, task.toAgent, CORE_CHAIN[idx + 1], { projectId: task.projectId });
  } else if (idx === CORE_CHAIN.length - 1) {
    const { getDb, projects } = await import('@i-renovation/shared');
    const db = await getDb();
    const { eq } = await import('drizzle-orm');
    await db.update(projects).set({ stage: 3 }).where(eq(projects.id, task.projectId));
  }
}

async function tick() {
  try {
    const task = await claimNextTask();
    if (!task) return;
    console.log(`[runner] claimed task ${task.id} → ${task.toAgent}`);
    try {
      const out = await runAgent(task as never);

      // —— 异常分派（EXCEPTION_RULES）：escalate_boss / reask_user 断链等待；其余照常交接 ——
      if (out.exception) {
        const rule = EXCEPTION_RULES[out.exception];
        const exc = exceptionInfo(out.exception, out.note ?? '');
        const output = { ...(out.content as object), exception: exc, tokens: out.tokens };
        console.warn(`[runner] task ${task.id} exception ${out.exception} (${rule?.action}): ${out.note}`);
        if (rule?.action === 'escalate_boss') {
          await escalateTask(task.id, output);
          return;
        }
        if (rule?.action === 'reask_user') {
          await waitingTask(task.id, {
            ...output,
            ask: out.exception === 'low_confidence_floorplan'
              ? '请补充更清晰的户型图，或在画板手绘标注房间'
              : '等待装修公司发布投标数据（投标到达后自动匹配），或调整装修需求/预算后重新发布',
          });
          return;
        }
        // retry/degrade 信号：降级产物仍有效，done + 交接继续（retry 由 catch 路径处理）
      }

      const content = out.exception
        ? { ...(out.content as object), exception: exceptionInfo(out.exception, out.note ?? '') }
        : out.content;
      await finishTask(task.id, content, out.tokens);

      // QA 回退：质检未通过 → 回退设计智能体修正（≤2 轮，超限走 qa_fallback_exhausted 升级）
      const qaOut = out.content as { fallback?: string; note?: string };
      if (task.toAgent === 'qa' && qaOut?.fallback === 'designer') {
        await createTask(task.projectId, 'qa', 'designer', { projectId: task.projectId, reason: qaOut.note ?? 'QA 质检未通过，回退设计智能体修正' });
        console.warn(`[runner] qa → designer fallback: ${qaOut.note}`);
        return;
      }

      await advanceChain(task);
    } catch (e) {
      console.error(`[runner] task ${task.id} failed:`, (e as Error).message);
      // —— 异常分类 → 按 EXCEPTION_RULES 动作分派 ——
      const { key, rule } = classifyException(e, task.toAgent);
      const detail = (e as Error).message ?? String(e);
      if (rule.action === 'retry' && task.retry < rule.maxRetries) {
        await failTask(task.id, task.retry + 1); // 回 pending 重试（mimo_timeout ≤3 次）
        console.warn(`[runner] task ${task.id} retry ${task.retry + 1}/${rule.maxRetries} (${key})`);
      } else if (rule.action === 'retry') {
        await escalateTask(task.id, { exception: exceptionInfo(key, `重试 ${rule.maxRetries} 次仍失败：${detail}`) });
      } else if (rule.action === 'degrade') {
        // 降级交付：产物降级但流水线不断（render_failed）
        await finishTask(task.id, { degraded: true, exception: exceptionInfo(key, detail), note: '生成失败已降级交付，不影响后续流程；可对话重新生成' }, 0);
        await advanceChain(task);
      } else if (rule.action === 'escalate_boss') {
        await escalateTask(task.id, { exception: exceptionInfo(key, detail) });
      } else {
        // reask_user：等待业主补充（low_confidence_floorplan / no_match）
        await waitingTask(task.id, {
          exception: exceptionInfo(key, detail),
          ask: key === 'low_confidence_floorplan' ? '请补充更清晰的户型图，或在画板手绘标注房间' : '等待装修公司发布投标数据（投标到达后自动匹配），或调整装修需求/预算后重新发布',
        });
      }
    }
  } catch (e) {
    console.error('[runner] tick error:', (e as Error).message);
  }
}

let started = false;
export function startRunner() {
  if (started) return;
  started = true;
  console.log('[runner] agent runner started (poll 1.5s)');
  setInterval(() => { void tick(); }, 1500);
}
