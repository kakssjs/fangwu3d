export const CONTRACTOR_PROFIT_COMMISSION_RATE = 0.1;

export interface CommissionQuote {
  revenueCny: number;
  estimatedCostCny: number;
  profitCny: number;
  commissionRate: number;
  platformCommissionCny: number;
  contractorNetProfitCny: number;
  basis: 'actual_profit' | 'estimated_cost' | 'gross_revenue';
  note: string;
}

export function wanToCny(wan: number | string): number {
  return Math.round((Number(String(wan).replace(/[^\d.]/g, '')) || 0) * 10000);
}

export function cnyToWan(cny: number): number {
  return Math.round((cny / 10000) * 100) / 100;
}

export function calculateContractorCommission(input: {
  amount: number | string;
  estimatedCost?: number | string | null;
  amountInWan?: boolean;
}): CommissionQuote {
  const revenueCny = input.amountInWan === false ? Math.round(Number(input.amount) || 0) : wanToCny(input.amount);
  const hasCost = input.estimatedCost !== undefined && input.estimatedCost !== null && String(input.estimatedCost).trim() !== '';
  const estimatedCostCny = hasCost
    ? (input.amountInWan === false ? Math.round(Number(input.estimatedCost) || 0) : wanToCny(input.estimatedCost!))
    : 0;
  const profitCny = hasCost ? Math.max(0, revenueCny - estimatedCostCny) : revenueCny;
  const platformCommissionCny = Math.round(profitCny * CONTRACTOR_PROFIT_COMMISSION_RATE);
  return {
    revenueCny,
    estimatedCostCny,
    profitCny,
    commissionRate: CONTRACTOR_PROFIT_COMMISSION_RATE,
    platformCommissionCny,
    contractorNetProfitCny: Math.max(0, profitCny - platformCommissionCny),
    basis: hasCost ? 'estimated_cost' : 'gross_revenue',
    note: hasCost
      ? '平台按装修队预计利润的 10% 收取服务费；项目结算时可按实际成本与利润复核。'
      : '未填写预计成本，暂按成交金额估算利润并收取 10% 平台服务费。',
  };
}

export function commissionLabel(quote: CommissionQuote) {
  return `利润 ¥${quote.profitCny.toLocaleString()} · 平台 10% ¥${quote.platformCommissionCny.toLocaleString()} · 装修队净利 ¥${quote.contractorNetProfitCny.toLocaleString()}`;
}
