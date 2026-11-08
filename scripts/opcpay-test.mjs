import assert from 'node:assert/strict';
import { basicSku, entitlement, purchaseLinks, payRequest } from '../apps/web/lib/opcpay.ts';
const option = { sku_id: 'S0806000213862097', billing_mode: 'ONE_TIME_DURATION', duration_period: 'MONTH', currency: 'CNY', price: '39.00' };
assert.equal(basicSku({ capability_status: 'ENABLED', charging_options: [option] }), option.sku_id);
for (const changed of [{ price: '165.00' }, { duration_period: 'YEAR' }, { sku_id: 'other' }]) {
  assert.throws(() => basicSku({ capability_status: 'ENABLED', charging_options: [{ ...option, ...changed }] }));
}
assert.equal(entitlement({ decision: 'PURCHASE_REQUIRED', access_granted: false }), null);
assert.equal(entitlement({ decision: 'ALLOW', access_granted: true, valid_until: '2099-01-01 08:00:00' }), '2099-01-01T00:00:00.000Z');
assert.throws(() => entitlement({ decision: 'ALLOW', access_granted: true }));
assert.throws(() => entitlement({ status: 'READY' }));
assert.throws(() => purchaseLinks({ purchase_url: 'javascript:alert(1)' }));
assert.throws(() => purchaseLinks({ purchase_url: 'https://alipay.com.evil.example/' }));
assert.ok(purchaseLinks({ purchase_url: 'alipays://platformapi/startapp?appId=test' }));
process.env.YIRENFU_API_KEY = 'test-only';
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(options.headers.Authorization, 'Bearer test-only');
  assert.equal(options.redirect, 'error');
  return new Response(JSON.stringify({ decision: 'DENY', access_granted: false }));
};
assert.equal((await payRequest('/access', { user_id: 'company-1' })).decision, 'DENY');
globalThis.fetch = async () => new Response('{}', { status: 503 });
await assert.rejects(payRequest('/product'));
globalThis.fetch = original;
console.log('PASS: only 39 CNY/month, fail-closed entitlements, China timezone, safe payment links and provider failures');
