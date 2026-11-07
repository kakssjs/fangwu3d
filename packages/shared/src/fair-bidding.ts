export interface FairBidPolicy {
  minQuoteRatio: number;
  maxQuoteRatio: number;
  minMarginPct: number;
  blindBidding: true;
  oneBidPerCompany: true;
  winnerRule: 'quality_fit_not_lowest_price';
}

export const FAIR_BID_POLICY: FairBidPolicy = {
  minQuoteRatio: 0.78,
  maxQuoteRatio: 1.45,
  minMarginPct: 8,
  blindBidding: true,
  oneBidPerCompany: true,
  winnerRule: 'quality_fit_not_lowest_price',
};

export type BidRiskLevel = 'fair' | 'low_ball' | 'high_ball' | 'invalid' | 'unknown';

export interface BidRisk {
  level: BidRiskLevel;
  score: number;
  reason: string;
  acceptable: boolean;
  recommendedMinCny: number;
  recommendedMaxCny: number;
}

export function evaluateBidRisk(bidCny: number, platformQuoteCny: number, estimatedCostCny = 0): BidRisk {
  if (!Number.isFinite(bidCny) || bidCny <= 0) {
    return { level: 'invalid', score: 0, reason: '报价必须大于 0', acceptable: false, recommendedMinCny: 0, recommendedMaxCny: 0 };
  }
  if (!Number.isFinite(platformQuoteCny) || platformQuoteCny <= 0) {
    return { level: 'unknown', score: 70, reason: '平台暂无基准报价，按资质、工期和交付能力评估', acceptable: true, recommendedMinCny: 0, recommendedMaxCny: 0 };
  }
  const min = Math.round(platformQuoteCny * FAIR_BID_POLICY.minQuoteRatio);
  const max = Math.round(platformQuoteCny * FAIR_BID_POLICY.maxQuoteRatio);
  const ratio = bidCny / platformQuoteCny;

  if (estimatedCostCny > 0 && bidCny < estimatedCostCny * (1 + FAIR_BID_POLICY.minMarginPct / 100)) {
    return {
      level: 'low_ball',
      score: 12,
      reason: '报价低于预计成本加最低合理利润，存在低价恶性竞争或交付风险',
      acceptable: false,
      recommendedMinCny: min,
      recommendedMaxCny: max,
    };
  }
  if (bidCny < min) {
    return {
      level: 'low_ball',
      score: 20,
      reason: '报价明显低于平台合理区间，可能无法保证材料、工期与售后质量',
      acceptable: false,
      recommendedMinCny: min,
      recommendedMaxCny: max,
    };
  }
  if (bidCny > max) {
    return {
      level: 'high_ball',
      score: 35,
      reason: '报价高于平台合理区间，将在匹配中降低优先级',
      acceptable: true,
      recommendedMinCny: min,
      recommendedMaxCny: max,
    };
  }
  const closeness = 1 - Math.min(1, Math.abs(bidCny - platformQuoteCny) / platformQuoteCny);
  return {
    level: 'fair',
    score: Math.round(65 + closeness * 35),
    reason: '报价位于平台合理区间，将以资质、工期、风格与交付能力综合匹配',
    acceptable: true,
    recommendedMinCny: min,
    recommendedMaxCny: max,
  };
}

export function bidRiskLabel(risk: BidRisk) {
  if (risk.level === 'low_ball') return '低价风险';
  if (risk.level === 'high_ball') return '高价偏离';
  if (risk.level === 'invalid') return '无效报价';
  if (risk.level === 'unknown') return '待评估';
  return '合理报价';
}

export function explainFairBidding() {
  return [
    '报价对其他装修队保密，不公开展示竞争对手金额。',
    '同一装修队每个项目只能提交一份有效报价。',
    '平台不以最低价作为唯一中标依据。',
    '明显低于成本或合理区间的报价会被拦截或降权。',
    '最终匹配综合考虑资质、报价、工期、风格专长与服务能力。',
  ];
}
