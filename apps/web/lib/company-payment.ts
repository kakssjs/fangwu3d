import { getUser, setUserVerified, setCompanyMembership, getOrCreateOnlinePayment, observeOnlinePayments, expireOnlinePayment } from '@i-renovation/shared';
import { payRequest, entitlement, basicSku, purchaseLinks } from './opcpay';

export async function refreshCompanyMembership(companyId: number) {
  const company = await getUser(companyId);
  if (!company || company.role !== 'company') throw new Error('仅企业装修队可购买会员');
  const data = await payRequest('/access', { user_id: `company-${companyId}` });
  const expires = entitlement(data);
  await setCompanyMembership(companyId, {
    membershipTier: 'basic', membershipStatus: expires ? 'active' : 'pending_payment',
    membershipExpiresAt: expires || '', monthlyLeadQuota: 30,
  });
  if (expires) {
    await observeOnlinePayments(companyId, expires);
    // 用户决定（WORKFLOW.md 决策记录 2026-11-08）：付费确认即通过资质审核，不再人工逐个审核；
    // 老板驳回过的公司（verified = -1）不会因付费被重新放行
    if (company.verified === 0) await setUserVerified(companyId, 1);
  }
  return { active: !!expires, expiresAt: expires };
}

export async function companyCheckout(companyId: number) {
  const sku = basicSku(await payRequest('/product'));
  const current = await refreshCompanyMembership(companyId);
  const payment = await getOrCreateOnlinePayment(companyId, current.expiresAt);
  const body = { user_id: `company-${companyId}`, idempotency_key: `membership-${payment.id}`,
    sku_id: sku, callback_url: 'https://39.105.92.190/contractor?payment_return=1' };
  let result;
  try {
    result = await payRequest('/purchase', body);
  } catch (error) {
    if ((error as { code?: string }).code === 'PURCHASE_ENTRY_EXPIRED') {
      await expireOnlinePayment(payment.id);
      throw new Error('原付款入口已失效，请重新点击购买');
    }
    throw error;
  }
  if (result.status !== 'READY') throw new Error('购买入口正在确认，请稍后重试；请勿重复付款');
  return { paymentId: payment.id, ...purchaseLinks(result) };
}
