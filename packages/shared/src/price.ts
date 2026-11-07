// 报价引擎（确定性规则）：材料清单 × 价格表 → 报价 + 工期（方案 §3.2 Agent④ 的 price_it 工具）
// 价格表由 Growth Agent 采集、老板核准后替换（方案 D2/N5）；以下为杭州参考价（元）

export interface PlanRoom { name: string; area: number }
export interface QuoteItem { item: string; qty: number; unit: string; price: number; total: number }

const STYLE_FACTOR: Record<string, number> = {
  现代简约: 1.0, 北欧: 1.1, 原木: 1.15, 新中式: 1.25, 轻奢: 1.4, 工业风: 1.05,
};

// 每平米半包基价（含辅料+人工），主材按房间另计
const LABOR_PER_SQM = 800;
const MATERIAL_PER_SQM: Record<string, number> = {
  客厅: 1200, 主卧: 900, 次卧: 900, 厨房: 2200, 卫生间: 2600, 阳台: 600, 书房: 800, 餐厅: 1000,
};

export function calcQuote(plan: PlanRoom[], style: string) {
  const factor = STYLE_FACTOR[style] ?? 1.0;
  const totalArea = plan.reduce((s, r) => s + r.area, 0);
  const items: QuoteItem[] = [];

  items.push({ item: '人工+辅料（半包）', qty: Math.round(totalArea), unit: '㎡', price: Math.round(LABOR_PER_SQM * factor), total: Math.round(totalArea * LABOR_PER_SQM * factor) });

  for (const r of plan) {
    const unit = Math.round((MATERIAL_PER_SQM[r.name.split('（')[0]] ?? MATERIAL_PER_SQM['次卧']) * factor);
    items.push({ item: `${r.name}主材`, qty: Math.round(r.area), unit: '㎡', price: unit, total: Math.round(r.area * unit) });
  }

  items.push({ item: '设计服务费', qty: 1, unit: '套', price: Math.round(totalArea * 60), total: Math.round(totalArea * 60) });

  const total = items.reduce((s, i) => s + i.total, 0);
  // 工期：半包约 2㎡/天 + 湿区晾晒
  const weeks = Math.max(4, Math.ceil(totalArea / 12) + 2);
  const schedule = [
    { phase: '拆改+水电', weeks: Math.ceil(weeks * 0.25) },
    { phase: '瓦工+防水', weeks: Math.ceil(weeks * 0.3) },
    { phase: '木工+油漆', weeks: Math.ceil(weeks * 0.3) },
    { phase: '安装+验收', weeks: Math.ceil(weeks * 0.15) },
  ];

  return { items, total, weeks, schedule, currency: 'CNY', note: 'AI 生成报价，仅供参考；以签约报价单为准' };
}
