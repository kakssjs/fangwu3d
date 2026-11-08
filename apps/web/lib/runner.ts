// Agent Runner（开发模式内嵌于 Next 服务进程；生产拆分为 apps/worker + BullMQ）
// 按 CORE_CHAIN 流转：floor_plan → designer → quote → qa；
// matcher 不入链——等「业主确认发布 + 装修公司发布数据（投标）」后单独触发
// 异常处理按 EXCEPTION_RULES 分派：retry（重试≤N）/ degrade（降级交付）/ escalate_boss（升级老板裁决）/ reask_user（反问用户补充）
import fs from 'node:fs';
import {
  recoverRunningTasks, claimNextTask, createTask, finishTask, failTask, escalateTask, waitingTask, upsertResult, getProject, getResult, listTasks,
  calcQuote, listPriceReferences, generatePlanGeometry, planFromRects, planToSvg, listCompanies, getOrderByProject, listBidsByOrder, CORE_CHAIN, EXCEPTION_RULES,
  classifyException, exceptionInfo, buildSceneModel, validateSceneModel, describeMaterialPreset,
  getMembershipTier, evaluateBidRisk, explainFairBidding,
  type PlanRoom, type PlanGeometry, type QuoteItem,
} from '@i-renovation/shared';
import { callMimo, recognizeFloorPlan } from './mimo';
import { XIAOMI_SMART_HOME_PRODUCTS, getMarketplaceProduct } from '@i-renovation/shared/marketplace';
import type { OpeningHint } from '@i-renovation/shared/plan';
import { generateImage } from './agnes';



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
  membershipExpiresAt?: string | null; verified: number; companyScale?: string | null; membershipTier?: string | null; membershipStatus?: string | null;
  monthlyLeadQuota?: number | null; monthlyLeadsUsed?: number | null;
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
  const tier = getMembershipTier(c.membershipTier);
  score += tier.matchRankBoost;
  if (tier.matchRankBoost > 0) reasons.push(`${tier.name}匹配套餐加权 +${tier.matchRankBoost}`);
  return { score: Math.min(100, score), reason: reasons.join('，') };
}

interface BidRow {
  id: number; orderId: number; companyId: number; companyName: string;
  amount: string; weeks: string; note?: string | null; estimatedCostCny?: number | null;
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
  const amountCny = amount * 10000;
  const risk = evaluateBidRisk(amountCny, quoteTotal, Number(b.estimatedCostCny ?? 0));
  if (risk.level === 'low_ball') { score -= 25; reasons.push('低价风险，降低匹配优先级'); }
  else if (risk.level === 'high_ball') { score -= 8; reasons.push('报价偏高，降低匹配优先级'); }
  else if (risk.level === 'fair') { score += 8; reasons.push('报价处于合理区间'); }
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
  membershipTier: string; customerResourceLevel: string;
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
  const eligibleBids = bids.filter(b => {
    const c = byId.get(b.companyId);
    return c && c.verified === 1 && c.membershipStatus === 'active' && !!c.membershipExpiresAt && Date.parse(c.membershipExpiresAt) > Date.now();
  });
  const contractors: MatchedContractor[] = eligibleBids
    .map(b => {
      const c = byId.get(b.companyId)!;
      const s = scoreBid(c, b, style, quoteTotal);
      return {
        id: b.companyId, bidId: b.id, name: b.companyName,
        verified: c?.verified === 1,
        score: s.score,
        amount: b.amount, weeks: b.weeks,
        districts: asArray(c?.districts), types: asArray(c?.serviceTypes),
        reason: s.reason,
        membershipTier: c.membershipTier ?? 'basic',
        customerResourceLevel: getMembershipTier(c.membershipTier).id === 'elite' ? 'high_intent' : getMembershipTier(c.membershipTier).id === 'professional' ? 'qualified' : 'standard',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return { order, bids, contractors, eligibleBidCount: eligibleBids.length, excludedUnpaidBids: bids.length - eligibleBids.length };
}

/**
 * 第二智能体「小桥」= MiMo：读业主需求、户型、报价和每份真实投标，给装修队排序并写出理由，
 * 再从家具商城目录里为各房间挑选相关产品。硬条件（已审核、有效会员）仍由代码先筛，
 * MiMo 只能在这批真实投标和真实商品里选，返回的 id 不在名单里就丢弃。MiMo 不可用时返回 null，由规则分兜底。
 */
async function mimoMatch(
  project: { name: string; style: string; area?: string | null; budget: string; needs?: string | null },
  rooms: PlanRoom[], quoteTotal: number, bids: BidRow[], contractors: MatchedContractor[],
) {
  const bidById = new Map(bids.map(b => [b.id, b]));
  const catalog = XIAOMI_SMART_HOME_PRODUCTS.map(p => ({ id: p.id, name: p.name, category: p.category, rooms: p.roomTags }));
  const prompt = [
    '你是装修平台的匹配智能体「小桥」。根据业主的装修需求，给下面这些已通过审核的装修队投标排序，并为各房间挑选相关的智能家居产品。',
    '只返回严格 JSON，不要 markdown、不要解释：',
    '{"ranking":[{"bidId":1,"score":0-100,"reason":"一句中文理由，引用需求、风格、报价、工期或公司特长中的具体事实"}],"products":[{"id":"商品id","room":"房间名","reason":"一句中文理由"}],"summary":"一两句中文，说明推荐的依据"}',
    '规则：ranking 必须包含且只包含下面列出的每个 bidId；不要编造公司、价格或资质；报价明显低于测算（低价风险）要降分；products 最多 8 个，只能用目录里的 id，选与业主需求和房间相关的；reason 和 summary 里用公司名称称呼装修队，不要写 bidId 或编号。',
    '',
    `项目：${project.name}；风格：${project.style}；面积：${project.area || '未填'}㎡；预算：${project.budget || '未填'}万元`,
    `业主需求：${(project.needs || '未填写').slice(0, 800)}`,
    `房间：${rooms.map(r => `${r.name} ${r.area}㎡`).join('、')}`,
    `平台按公开参考价测算的报价：¥${quoteTotal}`,
    '投标：',
    ...contractors.map(c => {
      const b = bidById.get(c.bidId);
      return JSON.stringify({ bidId: c.bidId, company: c.name, amountWan: c.amount, weeks: c.weeks, note: (b?.note ?? '').slice(0, 300),
        districts: c.districts, serviceTypes: c.types, ruleScore: c.score, ruleFacts: c.reason });
    }),
    '家具商城目录：',
    JSON.stringify(catalog),
  ].join('\n');
  try {
    const { text, tokensUsed } = await callMimo([{ role: 'user', content: prompt }], { maxTokens: 2500, noThinking: true });
    const json = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      ranking?: { bidId?: number; score?: number; reason?: string }[];
      products?: { id?: string; room?: string; reason?: string }[]; summary?: string;
    };
    const valid = new Set(contractors.map(c => c.bidId));
    const ranking = new Map((json.ranking ?? [])
      .filter(r => valid.has(Number(r.bidId)) && Number.isFinite(Number(r.score)) && typeof r.reason === 'string' && r.reason.trim())
      .map(r => [Number(r.bidId), { score: Math.max(0, Math.min(100, Math.round(Number(r.score)))), reason: r.reason!.trim().slice(0, 200) }]));
    if (ranking.size !== valid.size) return null; // 没给全部投标排序：不采用，避免漏掉公司
    const roomNames = new Set(rooms.map(r => r.name));
    const seen = new Set<string>();
    const products = (json.products ?? [])
      .filter(p => typeof p.id === 'string' && getMarketplaceProduct(p.id) && !seen.has(p.id) && seen.add(p.id))
      .slice(0, 8)
      .map(p => {
        const item = getMarketplaceProduct(p.id!)!;
        return { id: item.id, name: item.name, category: item.category, imageUrl: item.imageUrl, officialUrl: item.officialUrl,
          room: typeof p.room === 'string' && roomNames.has(p.room) ? p.room : '全屋', reason: String(p.reason ?? '').slice(0, 120) };
      });
    return { ranking, products, summary: String(json.summary ?? '').slice(0, 300), tokensUsed };
  } catch (e) {
    console.warn('[matcher] MiMo 匹配失败，改用规则分：', (e as Error).message);
    return null;
  }
}

/** 读取 PNG / JPEG / WebP 的像素宽高（只看文件头）；认不出返回 null */
function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) }; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
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

  switch (task.toAgent) {
    case 'floor_plan': {
      // ① 用户工作台房间优先（识别出来 / 画出来的）；② 没有时识别上传的户型图。两条路都得到房间矩形（像素），
      // 再用同一套换算建模：有几个房间生成几个渲染图，几何保留原图位置，门窗按记录开洞
      type Rect = { name: string; x: number; y: number; w: number; d: number; openings?: OpeningHint[] };
      const fpRow = await getResult(task.projectId, 'floorplan');
      let rects: Rect[] = ((fpRow?.content as { rects?: Partial<Rect>[] } | undefined)?.rects ?? [])
        .filter((r): r is Rect => !!r && typeof r.name === 'string' && !!r.name.trim() && Number(r.w) > 0 && Number(r.d) > 0);
      let source = 'user_studio';
      let tokens = 0;
      let recognizedRuns = 0;
      if (rects.length === 0) {
        if (!project.floorPlanPath || !fs.existsSync(project.floorPlanPath)) {
          return { content: { rooms: [], confidence: 'unavailable' }, tokens: 0, exception: 'low_confidence_floorplan', note: '请上传户型图或在画板标注真实房间后继续' };
        }
        const bytes = fs.readFileSync(project.floorPlanPath);
        const mime = project.floorPlanPath.endsWith('.jpg') ? 'image/jpeg' : project.floorPlanPath.endsWith('.webp') ? 'image/webp' : 'image/png';
        const result = await recognizeFloorPlan(bytes.toString('base64'), mime);
        tokens = result.tokensUsed;
        if ('error' in result || result.rooms.length < 2) {
          return { content: { rooms: [], confidence: 'low' }, tokens, exception: 'low_confidence_floorplan',
            note: 'error' in result ? result.error : '只识别出一个房间，请在画板标注或换用清晰户型图' };
        }
        // 归一化坐标 → 按原图宽高换成像素，保持房间比例（拿不到尺寸时按 4:3）
        const size = imageSize(bytes) ?? { width: 1200, height: 900 };
        rects = result.rooms.map(r => ({ name: r.name, x: r.x * size.width, y: r.y * size.height, w: r.w * size.width, d: r.d * size.height, openings: r.openings }));
        source = 'mimo';
        recognizedRuns = result.runs;
      }
      // 像素 → 米：优先按申报总面积校准，否则 80px≈1m（与画板「按此图生成 3D」同一换算）
      const pxArea = rects.reduce((s, r) => s + r.w * r.d, 0);
      const areaDeclared = Number(project.area) || 0;
      const mPerPx = areaDeclared > 10 && pxArea > 0 ? Math.sqrt(areaDeclared / pxArea) : 0.0125;
      const roomRects = rects.map(r => ({ name: r.name.trim(), x: r.x * mPerPx, y: r.y * mPerPx, w: r.w * mPerPx, d: r.d * mPerPx, openings: r.openings }));
      const plan: PlanRoom[] = roomRects.map(r => ({ name: r.name, area: Math.round(r.w * r.d * 10) / 10 }));
      const geometry = planFromRects(roomRects);
      const content = {
        rooms: plan,
        geometry,
        source,
        confidence: source === 'mimo' && recognizedRuns < 2 ? 'unverified' : 'high',
        note: source === 'mimo'
          ? `按上传户型图识别出的 ${plan.length} 间房建模（${recognizedRuns > 1 ? `${recognizedRuns} 次识别取多数一致` : '仅 1 次识别，未经互相印证'}，保留房间位置），尺寸按申报面积换算，以现场量房为准`
          : `按你在画板上识别/手绘的 ${plan.length} 间房建模（保留房间位置），尺寸以现场量房为准`,
        warnings: geometry.warnings,
      };
      await upsertResult(task.projectId, 'plan', content);
      const sceneModel = buildSceneModel(geometry, plan, project.style, { source: 'floor_plan' });
      await upsertResult(task.projectId, 'scene_model', sceneModel);
      return { content, tokens };
    }
    case 'designer': {
      const planRow = await getResult(task.projectId, 'plan');
      const planContent = planRow?.content as { rooms?: PlanRoom[]; geometry?: PlanGeometry } | undefined;
      if (!planContent?.rooms?.length || !planContent.geometry) throw new Error('缺少已确认的户型，请先完成户型输入');
      const rooms = planContent.rooms;
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
      const rooms = (planRow?.content as { rooms?: PlanRoom[] })?.rooms;
      if (!rooms?.length) throw new Error('缺少已确认的户型');
      // 单价取数据库里的公开市场参考价（price_references）；目前只收录了杭州
      const quote = calcQuote(rooms, project.style, await listPriceReferences('杭州'));
      await upsertResult(task.projectId, 'quote', quote);
      return { content: quote, tokens: 0 };
    }
    case 'matcher': {
      // —— 匹配智能体：等「业主确认发布 + 装修公司发布数据（投标）」后触发，基于真实投标数据匹配 ——
      const { order, bids, contractors: ruleRanked } = await matchBids(task.projectId, project.style);
      // 第二智能体：MiMo 在规则筛出的真实投标里排序并写理由，同时挑选相关商品；失败时沿用规则分
      const planRow = await getResult(task.projectId, 'plan');
      const rooms = (planRow?.content as { rooms?: PlanRoom[] } | undefined)?.rooms ?? [];
      const quoteTotal = Number(((await getResult(task.projectId, 'quote'))?.content as { total?: number } | undefined)?.total) || 0;
      const ai = ruleRanked.length ? await mimoMatch(project, rooms, quoteTotal, bids as BidRow[], ruleRanked) : null;
      const contractors = ai
        ? ruleRanked.map(c => ({ ...c, ruleScore: c.score, score: ai.ranking.get(c.bidId)!.score, reason: ai.ranking.get(c.bidId)!.reason, ruleReason: c.reason }))
            .sort((x, y) => y.score - x.score)
        : ruleRanked;
      const topScore = contractors.length ? Math.max(...contractors.map(c => c.score)) : 0;
      if (contractors.length === 0 || topScore < 20) {
        // 不写 match 结果（避免展示空匹配）；等待更多投标 / 业主调整
        return {
          content: { contractors: [], source: 'bids', bidCount: bids.length, pushedAt: new Date().toISOString() },
          tokens: ai?.tokensUsed ?? 0, exception: 'no_match',
          note: !order
            ? '项目尚未发布到接单市场'
            : bids.length === 0
              ? '订单已发布，尚未收到装修公司投标数据'
              : `投标最高匹配度 ${topScore} 分，暂无合适装修队`,
        };
      }
      const match = {
        contractors, source: 'bids', bidCount: bids.length,
        matchedBy: ai ? 'mimo' : 'rules',
        summary: ai?.summary || (ai ? '' : 'MiMo 暂不可用，本次按规则评分匹配'),
        products: ai?.products ?? [],
        pushedAt: new Date().toISOString(),
        note: '采用密封竞价和综合匹配：不公开竞争对手报价，不以最低价为唯一标准；综合资质、合理报价、工期、风格与服务能力，规避低价恶性竞争。',
        fairBidding: explainFairBidding(),
      };
      await upsertResult(task.projectId, 'match', match);
      return { content: match, tokens: ai?.tokensUsed ?? 0 };
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
      if (!planContent?.rooms?.length) throw new Error('缺少已确认的户型');
      const baseline = calcQuote(planContent.rooms, project.style, await listPriceReferences('杭州'));
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
async function advanceChain(task: { id: number; projectId: number; toAgent: string }, output: unknown, tokens = 0) {
  const idx = CORE_CHAIN.indexOf(task.toAgent as (typeof CORE_CHAIN)[number]);
  await finishTask(task.id, output, tokens, idx >= 0 && idx < CORE_CHAIN.length - 1
    ? { nextAgent: CORE_CHAIN[idx + 1] } : idx === CORE_CHAIN.length - 1 ? { stage: 3 } : undefined);
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

      // QA 回退：质检未通过 → 回退设计智能体修正（≤2 轮，超限走 qa_fallback_exhausted 升级）
      const qaOut = out.content as { fallback?: string; note?: string };
      if (task.toAgent === 'qa' && qaOut?.fallback === 'designer') {
        await finishTask(task.id, content, out.tokens, { nextAgent: 'designer' });
        console.warn(`[runner] qa → designer fallback: ${qaOut.note}`);
        return;
      }

      await advanceChain(task, content, out.tokens);
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
        await advanceChain(task, { degraded: true, exception: exceptionInfo(key, detail), note: '图像生成失败，缺失部分未交付，可重试生成' });
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

const runnerState = globalThis as typeof globalThis & { __runnerStarted?: boolean };
export function startRunner() {
  if (runnerState.__runnerStarted || process.env.RUNNER_ENABLED === 'false') return;
  runnerState.__runnerStarted = true;
  let busy = false;
  void recoverRunningTasks().then(() => {
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await tick(); } finally { busy = false; }
    }, 1500);
    timer.unref();
    console.log('[runner] started; interrupted tasks recovered');
  }).catch(error => {
    runnerState.__runnerStarted = false;
    console.error('[runner] initialization failed:', error);
  });
}
