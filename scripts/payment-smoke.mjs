import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3201';
const suffix = Date.now().toString().slice(-8);
async function call(path, body, cookie) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], data: await r.json() };
}
const owner = await call('/api/auth/register', { role: 'homeowner', name: 'Free-owner-test', phone: '191' + suffix, password: 'Smoke-' + suffix });
assert.equal(owner.status, 200);
assert.equal((await call('/api/projects', null, owner.cookie)).status, 200);
assert.equal((await call('/api/company/membership/access', null, owner.cookie)).status, 403);
assert.equal((await call('/api/company/membership/apply', { tierId: 'basic', billingCycle: 'monthly' }, owner.cookie)).status, 403);
const company = await call('/api/auth/register', { role: 'company', name: 'Gateway smoke', companyName: 'Gateway smoke',
  phone: '192' + suffix, password: 'Smoke-' + suffix, membershipTier: 'basic', billingCycle: 'monthly' });
assert.equal(company.status, 200);
assert.ok(company.data.id >= 1000000000, 'Only run against the isolated test database');
assert.equal((await call('/api/company/membership/apply', { tierId: 'elite', billingCycle: 'monthly' }, company.cookie)).status, 400);
assert.equal((await call('/api/company/membership/apply', { tierId: 'basic', billingCycle: 'annual' }, company.cookie)).status, 400);
assert.equal((await call('/api/company/membership/apply', { tierId: 'basic', billingCycle: 'monthly' })).status, 401);
const access = await call('/api/company/membership/access', null, company.cookie);
assert.equal(access.status, 200);
assert.equal(access.data.active, false);
const first = await call('/api/company/membership/apply', { tierId: 'basic', billingCycle: 'monthly', companyId: 1, user_id: 'someone-else' }, company.cookie);
assert.equal(first.status, 200, JSON.stringify(first.data));
assert.ok(first.data.purchaseUrl || first.data.qrCode);
const second = await call('/api/company/membership/apply', { tierId: 'basic', billingCycle: 'monthly' }, company.cookie);
assert.equal(second.status, 200, JSON.stringify(second.data));
assert.equal(second.data.paymentId, first.data.paymentId);
const records = await call('/api/company/membership/apply', null, company.cookie);
assert.equal(records.data.length, 1);
assert.equal(records.data[0].companyId, company.data.id);
assert.equal(records.data[0].amountCny, 39);
assert.equal(records.data[0].status, 'pending');
const profile = await call('/api/auth/me', null, company.cookie);
assert.notEqual(profile.data.membershipStatus, 'active');
console.log('PASS: homeowner free and excluded from payments; company-only 39/month; other plans rejected; provider checkout ready; retry reuses record; no entitlement granted merely for creating checkout');
