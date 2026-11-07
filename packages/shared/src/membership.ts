export type ContractorScale = 'small' | 'medium' | 'large' | 'enterprise';
export type MembershipTierId = 'basic' | 'professional' | 'elite';

export interface ContractorMembershipTier {
  id: MembershipTierId;
  name: string;
  subtitle: string;
  annualFeeCny: number;
  firstYearFeeCny: number;
  recommendedScales: ContractorScale[];
  monthlyLeadQuota: number;
  maxActiveBids: number;
  matchRankBoost: number;
  featuredListings: number;
  cityCampaign: boolean;
  dedicatedSupport: boolean;
  badge: string;
  benefits: string[];
}

export const CONTRACTOR_SCALES: Array<{
  id: ContractorScale;
  name: string;
  description: string;
  recommendedTier: MembershipTierId;
}> = [
  { id: 'small', name: '小型装修队', description: '1–10 人，以本地小户型、局改和软装为主', recommendedTier: 'basic' },
  { id: 'medium', name: '中型装潢公司', description: '10–50 人，具备完整设计、施工和项目管理能力', recommendedTier: 'professional' },
  { id: 'large', name: '大型装潢企业', description: '50–200 人，多城市或多项目并行交付', recommendedTier: 'elite' },
  { id: 'enterprise', name: '集团型工程企业', description: '200 人以上，品牌直营、工程总承包或连锁经营', recommendedTier: 'elite' },
];

export const CONTRACTOR_MEMBERSHIP_TIERS: ContractorMembershipTier[] = [
  {
    id: 'basic',
    name: '基础入驻版',
    subtitle: '适合本地小型装修队',
    annualFeeCny: 1980,
    firstYearFeeCny: 399,
    recommendedScales: ['small'],
    monthlyLeadQuota: 30,
    maxActiveBids: 5,
    matchRankBoost: 0,
    featuredListings: 0,
    cityCampaign: false,
    dedicatedSupport: false,
    badge: '认证施工队',
    benefits: [
      '每月 30 条基础客户资源',
      '最多同时参与 5 个项目竞价',
      '标准搜索排序与公司主页',
      '资质审核、合同与订单管理',
    ],
  },
  {
    id: 'professional',
    name: '专业增长版',
    subtitle: '适合有稳定团队的装潢公司',
    annualFeeCny: 6800,
    firstYearFeeCny: 999,
    recommendedScales: ['medium'],
    monthlyLeadQuota: 120,
    maxActiveBids: 15,
    matchRankBoost: 8,
    featuredListings: 2,
    cityCampaign: false,
    dedicatedSupport: true,
    badge: '优选装潢公司',
    benefits: [
      '每月 120 条精准客户资源',
      '优先匹配加权与优选标识',
      '每月 2 个首页精选展位',
      '同时参与 15 个项目竞价',
      '专属运营顾问',
    ],
  },
  {
    id: 'elite',
    name: '品牌旗舰版',
    subtitle: '适合大型企业与区域品牌',
    annualFeeCny: 19800,
    firstYearFeeCny: 2980,
    recommendedScales: ['large', 'enterprise'],
    monthlyLeadQuota: 500,
    maxActiveBids: 50,
    matchRankBoost: 18,
    featuredListings: 8,
    cityCampaign: true,
    dedicatedSupport: true,
    badge: '平台战略合作伙伴',
    benefits: [
      '每月 500 条高意向客户资源',
      '最高匹配优先级与品牌曝光',
      '每月 8 个首页精选展位',
      '城市专题活动与联合内容推广',
      '同时参与 50 个项目竞价',
      '一对一大客户运营支持',
    ],
  },
];

export function getMembershipTier(id?: string | null): ContractorMembershipTier {
  return CONTRACTOR_MEMBERSHIP_TIERS.find(t => t.id === id) ?? CONTRACTOR_MEMBERSHIP_TIERS[0];
}

export function getScale(id?: string | null) {
  return CONTRACTOR_SCALES.find(s => s.id === id) ?? CONTRACTOR_SCALES[0];
}

export function recommendedTierForScale(scale: ContractorScale): ContractorMembershipTier {
  return getMembershipTier(getScale(scale).recommendedTier);
}

export function canReceiveLead(state: {
  membershipStatus?: string | null;
  monthlyLeadQuota?: number | null;
  monthlyLeadsUsed?: number | null;
}) {
  const quota = Number(state.monthlyLeadQuota ?? CONTRACTOR_MEMBERSHIP_TIERS[0].monthlyLeadQuota);
  const used = Number(state.monthlyLeadsUsed ?? 0);
  return state.membershipStatus === 'active' && used < quota;
}

export function membershipFeeFor(tierId: string | undefined | null, isFirstYear: boolean) {
  const tier = getMembershipTier(tierId);
  return isFirstYear ? tier.firstYearFeeCny : tier.annualFeeCny;
}

export function membershipAccess(tierId?: string | null) {
  const tier = getMembershipTier(tierId);
  return {
    tier,
    monthlyRemainingLeads: tier.monthlyLeadQuota,
    customerResourceLevel: tier.id === 'elite' ? 'high_intent' : tier.id === 'professional' ? 'qualified' : 'standard',
    matchingPriority: tier.id === 'elite' ? 'highest' : tier.id === 'professional' ? 'priority' : 'standard',
  };
}
