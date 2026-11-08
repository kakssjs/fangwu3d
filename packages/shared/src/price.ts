// 报价引擎（确定性规则）：房间面积 × 公开市场参考价 → 报价 + 工期（方案 §3.2 Agent④ 的 price_it 工具）
// 参考价来自网站公开发布的杭州装修报价，每条都带来源、发布日期和采集日期（见 PRICE_REFERENCES），
// 存进数据库 price_references 表；报价时由调用方从数据库读出传入，读不到才用下面的同一份数据。

export interface PlanRoom { name: string; area: number }
export interface QuoteItem { item: string; qty: number; unit: string; price: number; total: number; source?: string }

/** 一条公开市场参考价。low/high 为来源给出的区间；只有单个数时 low = high */
export interface PriceReference {
  id: string;
  city: string;
  category: 'package' | 'labor' | 'material' | 'fixture' | 'fee';
  item: string;
  unit: string;
  low: number;
  high: number;
  note: string;
  sourceName: string;
  sourceUrl: string;
  /** 来源页面标注的发布日期 */
  publishedAt: string;
  /** 我们打开页面核对并采集的日期 */
  retrievedAt: string;
}

const TO8TO = { sourceName: '土巴兔装修网《2026杭州装修报价一览》', sourceUrl: 'https://www.to8to.com/yezhu/z355407.html', publishedAt: '2026-10-17', retrievedAt: '2026-11-08' };
const MPZS = { sourceName: '铭品装饰《杭州2026最新装修价格公布》', sourceUrl: 'https://www.mpzs.com/information/info_3090.html', publishedAt: '2026-02-26', retrievedAt: '2026-11-08' };
const AIQICHA = { sourceName: '爱企查《2026新装修工人报价》', sourceUrl: 'https://aiqicha.baidu.com/details/ugknowledge?id=747aacec587bcc501aa771f24e7c8f71', publishedAt: '2026-10-22', retrievedAt: '2026-11-08' };

export const PRICE_REFERENCES: PriceReference[] = [
  { id: 'hz-half-package', city: '杭州', category: 'package', item: '半包（人工+辅材）', unit: '元/㎡', low: 566, high: 824, note: '80–120㎡常规户型；含基础拆除、墙面铲除和建渣外运；土巴兔杭州站 2026 年 Q1 数据（n=2863）', ...TO8TO },
  { id: 'hz-full-package', city: '杭州', category: 'package', item: '全包（含主材）', unit: '元/㎡', low: 1133, high: 1854, note: '80–120㎡常规户型；均价约 1493 元/㎡；主材占 40–50%，人工 25–35%，辅材 10–15%，设计与管理 10–15%', ...TO8TO },
  { id: 'hz-full-economy', city: '杭州', category: 'package', item: '全包·经济型', unit: '元/㎡', low: 1133, high: 1350, note: '国产一线品牌主材，柜体投影面积 ≤15㎡', ...TO8TO },
  { id: 'hz-full-quality', city: '杭州', category: 'package', item: '全包·品质型', unit: '元/㎡', low: 1351, high: 1650, note: '进口五金、岩板台面、中央空调，柜体 20–25㎡', ...TO8TO },
  { id: 'hz-full-premium', city: '杭州', category: 'package', item: '全包·高端型', unit: '元/㎡', low: 1651, high: 1854, note: '全屋智能、天然石材、艺术涂料；来源写作 1854+', ...TO8TO },
  { id: 'hz-labor-electrician-day', city: '杭州', category: 'labor', item: '电工日薪', unit: '元/天', low: 650, high: 800, note: '杭州装修人工费持续上涨', ...TO8TO },
  { id: 'hz-labor-tile-to8to', city: '杭州', category: 'labor', item: '普通瓷砖铺贴（工费）', unit: '元/㎡', low: 80, high: 80, note: '与微水泥对比时给出的单价', ...TO8TO },
  { id: 'hz-microcement', city: '杭州', category: 'labor', item: '微水泥地面施工', unit: '元/㎡', low: 280, high: 350, note: '奶油风常见做法', ...TO8TO },
  { id: 'hz-kitchen-renovation', city: '杭州', category: 'package', item: '厨房翻新（局部改造）', unit: '元/项', low: 18000, high: 32000, note: '西湖区；含橱柜拆除重装、水电局部调整，不含电器；工期 15–20 天', ...TO8TO },
  { id: 'hz-demolition-90', city: '杭州', category: 'labor', item: '90㎡二手房拆改', unit: '元/项', low: 8100, high: 13500, note: '萧山区；墙体拆除 3 处以内，不含结构加固；工期 7–10 天', ...TO8TO },
  { id: 'hz-half-basic', city: '杭州', category: 'package', item: '半包·基础档（设计+施工+辅材）', unit: '元/㎡', low: 700, high: 900, note: '', ...MPZS },
  { id: 'hz-half-mid', city: '杭州', category: 'package', item: '半包·中档（设计+施工+辅材）', unit: '元/㎡', low: 900, high: 1100, note: '', ...MPZS },
  { id: 'hz-half-high', city: '杭州', category: 'package', item: '半包·高端档（设计+施工+辅材）', unit: '元/㎡', low: 1200, high: 1500, note: '', ...MPZS },
  { id: 'hz-full-basic-mpzs', city: '杭州', category: 'package', item: '全包·基础装修', unit: '元/㎡', low: 800, high: 1000, note: '含设计、人工、辅材、主材、家具、电器', ...MPZS },
  { id: 'hz-full-mid-mpzs', city: '杭州', category: 'package', item: '全包·中档装修', unit: '元/㎡', low: 1000, high: 1500, note: '含吊顶、定制柜体、环保乳胶漆、品牌瓷砖橱柜', ...MPZS },
  { id: 'hz-full-high-mpzs', city: '杭州', category: 'package', item: '全包·高端装修', unit: '元/㎡', low: 1500, high: 2200, note: '来源写作 2200 起', ...MPZS },
  { id: 'hz-plumbing-pipe', city: '杭州', category: 'labor', item: '水路暗管（含材料）', unit: '元/米', low: 35, high: 40, note: '', ...MPZS },
  { id: 'hz-electric-wiring', city: '杭州', category: 'labor', item: '电路（含材料）', unit: '元/米', low: 60, high: 70, note: '', ...MPZS },
  { id: 'hz-latex-paint', city: '杭州', category: 'labor', item: '乳胶漆（包工包料）', unit: '元/㎡', low: 14, high: 22, note: '', ...MPZS },
  { id: 'hz-wallcloth', city: '杭州', category: 'material', item: '墙布', unit: '元/㎡', low: 100, high: 150, note: '', ...MPZS },
  { id: 'hz-tile-laying', city: '杭州', category: 'labor', item: '地砖铺设（工费）', unit: '元/㎡', low: 60, high: 100, note: '', ...MPZS },
  { id: 'hz-tile-material', city: '杭州', category: 'material', item: '瓷砖主材', unit: '元/㎡', low: 80, high: 180, note: '', ...MPZS },
  { id: 'hz-solid-wood-floor', city: '杭州', category: 'material', item: '实木地板', unit: '元/㎡', low: 300, high: 400, note: '', ...MPZS },
  { id: 'hz-laminate-floor', city: '杭州', category: 'material', item: '复合地板', unit: '元/㎡', low: 150, high: 250, note: '', ...MPZS },
  { id: 'hz-custom-cabinet', city: '杭州', category: 'material', item: '定制柜体（生态板）', unit: '元/延米', low: 1000, high: 2000, note: '', ...MPZS },
  { id: 'hz-toilet', city: '杭州', category: 'fixture', item: '马桶', unit: '元/件', low: 1000, high: 3000, note: '', ...MPZS },
  { id: 'hz-shower', city: '杭州', category: 'fixture', item: '花洒', unit: '元/件', low: 500, high: 1000, note: '', ...MPZS },
  { id: 'hz-flat-ceiling', city: '杭州', category: 'labor', item: '平面吊顶', unit: '元/㎡', low: 120, high: 120, note: '常见增项', ...MPZS },
  { id: 'hz-management-fee', city: '杭州', category: 'fee', item: '管理费', unit: '% 总价', low: 3, high: 8, note: '常见增项', ...MPZS },
  { id: 'hz-design-fee', city: '杭州', category: 'fee', item: '设计费', unit: '元/㎡', low: 80, high: 150, note: '另计', ...MPZS },
  { id: 'cn-labor-plumber-day', city: '全国', category: 'labor', item: '水电工日薪', unit: '元/天', low: 650, high: 900, note: '全国参考，非杭州专项', ...AIQICHA },
  { id: 'cn-labor-tiler-day', city: '全国', category: 'labor', item: '瓦工日薪', unit: '元/天', low: 450, high: 550, note: '全国参考，非杭州专项', ...AIQICHA },
  { id: 'cn-labor-carpenter-day', city: '全国', category: 'labor', item: '木工日薪', unit: '元/天', low: 300, high: 600, note: '全国参考，非杭州专项', ...AIQICHA },
  { id: 'cn-labor-painter-day', city: '全国', category: 'labor', item: '油漆工日薪', unit: '元/天', low: 200, high: 600, note: '全国参考，非杭州专项', ...AIQICHA },
];

// 风格系数：平台自定的经验系数，没有公开来源
const STYLE_FACTOR: Record<string, number> = {
  现代简约: 1.0, 北欧: 1.1, 原木: 1.15, 新中式: 1.25, 轻奢: 1.4, 工业风: 1.05,
};

// 主材在各房间之间的相对权重（厨卫主材更贵）：平台自定，用来把来源给出的整屋主材均价分到各房间
const ROOM_MATERIAL_WEIGHT: Record<string, number> = {
  客厅: 1.2, 主卧: 0.9, 次卧: 0.9, 厨房: 2.2, 卫生间: 2.6, 阳台: 0.6, 书房: 0.8, 餐厅: 1.0,
};

const mid = (r: PriceReference) => (r.low + r.high) / 2;
const cite = (r: PriceReference) => `${r.sourceName}（${r.publishedAt} 发布，取区间 ${r.low}–${r.high} ${r.unit} 的中值）`;

/**
 * 报价：人工+辅材按「半包」参考价，设计费按「设计费」参考价，主材 = 全包均价 − 半包 − 设计费，再按房间权重分摊。
 * 不加风格系数时，每平米总价正好等于来源的全包区间中值。refs 传数据库里的参考价；缺哪条就用 PRICE_REFERENCES 里的同一条。
 */
export function calcQuote(plan: PlanRoom[], style: string, refs: PriceReference[] = PRICE_REFERENCES) {
  const pick = (id: string) => refs.find(r => r.id === id) ?? PRICE_REFERENCES.find(r => r.id === id)!;
  const half = pick('hz-half-package');
  const full = pick('hz-full-package');
  const design = pick('hz-design-fee');
  const factor = STYLE_FACTOR[style] ?? 1.0;
  const totalArea = plan.reduce((s, r) => s + r.area, 0);
  const items: QuoteItem[] = [];

  const laborUnit = Math.round(mid(half) * factor);
  items.push({ item: '人工+辅料（半包）', qty: Math.round(totalArea), unit: '㎡', price: laborUnit, total: Math.round(totalArea * laborUnit), source: cite(half) });

  // 整屋主材均价（元/㎡），按房间权重分摊；权重按面积归一，保证整屋主材合计不变
  const materialAvg = Math.max(0, mid(full) - mid(half) - mid(design));
  const weightOf = (r: PlanRoom) => ROOM_MATERIAL_WEIGHT[r.name.split('（')[0]] ?? ROOM_MATERIAL_WEIGHT['次卧'];
  const weightedArea = plan.reduce((s, r) => s + r.area * weightOf(r), 0) || 1;
  const materialSource = `按${full.sourceName}全包中值减半包与设计费得出整屋主材均价 ${Math.round(materialAvg)} 元/㎡，再按平台房间权重分摊`;
  for (const r of plan) {
    const unit = Math.round(materialAvg * (totalArea / weightedArea) * weightOf(r) * factor);
    items.push({ item: `${r.name}主材`, qty: Math.round(r.area), unit: '㎡', price: unit, total: Math.round(r.area * unit), source: materialSource });
  }

  const designUnit = Math.round(mid(design));
  items.push({ item: '设计服务费', qty: 1, unit: '套', price: Math.round(totalArea * designUnit), total: Math.round(totalArea * designUnit), source: cite(design) });

  const total = items.reduce((s, i) => s + i.total, 0);
  // 工期：半包约 2㎡/天 + 湿区晾晒
  const weeks = Math.max(4, Math.ceil(totalArea / 12) + 2);
  const schedule = [
    { phase: '拆改+水电', weeks: Math.ceil(weeks * 0.25) },
    { phase: '瓦工+防水', weeks: Math.ceil(weeks * 0.3) },
    { phase: '木工+油漆', weeks: Math.ceil(weeks * 0.3) },
    { phase: '安装+验收', weeks: Math.ceil(weeks * 0.15) },
  ];

  const newest = [half, full, design].map(r => r.retrievedAt).sort().at(-1)!;
  // 参考价每月更新一次；超过 45 天没更新就在报价里写明，不让旧价格冒充当前价
  const ageDays = Math.floor((Date.now() - Date.parse(newest)) / 86400000);
  const stale = ageDays > 45 ? `；注意：参考价已 ${ageDays} 天未更新，可能偏离当前行情` : '';
  return {
    items, total, weeks, schedule, currency: 'CNY',
    priceBasis: { city: half.city, retrievedAt: newest, ageDays, stale: ageDays > 45, referenceIds: [half.id, full.id, design.id], styleFactor: factor },
    note: `AI 生成报价，仅供参考；以签约报价单为准。单价依据网站公开的${half.city}装修参考价（${newest} 采集），风格系数 ×${factor} 为平台经验值${stale}`,
  };
}
