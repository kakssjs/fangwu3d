// Only the server calls this API; identities always come from the signed company session.
export async function payRequest(path: string, body?: Record<string, unknown>) {
  const key = process.env.YIRENFU_API_KEY;
  if (!key) throw new Error('支付宝收款暂未配置');
  const response = await fetch('https://ai6666.com/opcpay/api/pay/v1' + path, {
    method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(`支付服务暂不可用（${response.status}），请稍后使用原记录重试`);
    Object.assign(error, { code: data.error_code });
    throw error;
  }
  return data;
}

export function basicSku(product: any): string {
  const option = product.charging_options?.find((p: any) => p.sku_id === 'S0806000213862097' &&
    p.billing_mode === 'ONE_TIME_DURATION' && p.duration_period === 'MONTH' &&
    p.currency === 'CNY' && p.price === '39.00');
  if (product.capability_status !== 'ENABLED' || !option) throw new Error('39 元基础月会员暂不可购买');
  return option.sku_id;
}

export function entitlement(data: any) {
  if (!['ALLOW', 'DENY', 'PURCHASE_REQUIRED'].includes(data.decision) || typeof data.access_granted !== 'boolean') {
    throw new Error('权益结果尚未确认，请稍后刷新');
  }
  if (data.decision !== 'ALLOW' || data.access_granted !== true) return null;
  const value = data.valid_until;
  if (typeof value !== 'string') throw new Error('会员有效期尚未确认');
  const expires = new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + '+08:00' : value);
  if (!Number.isFinite(expires.getTime())) throw new Error('会员有效期无效');
  return expires.getTime() > Date.now() ? expires.toISOString() : null;
}

export function purchaseLinks(data: any) {
  const link = (value: unknown) => {
    if (typeof value !== 'string') return undefined;
    const url = new URL(value);
    const alipay = url.hostname === 'alipay.com' || url.hostname.endsWith('.alipay.com');
    if (url.protocol === 'alipays:' || (url.protocol === 'https:' && alipay)) return value;
    throw new Error('支付服务返回了无效的付款地址');
  };
  const purchaseUrl = link(data.purchase_url);
  const qrCode = link(data.purchase_qr_code);
  if (!purchaseUrl && !qrCode) throw new Error('尚未获得付款地址，请稍后重试');
  return { purchaseUrl, qrCode };
}
