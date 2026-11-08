import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = 'http://127.0.0.1:3400';
const previous = process.argv.includes('--resume') ? JSON.parse(fs.readFileSync('/opt/irenovation-remediation/test-state.json', 'utf8')) : null;
const run = previous?.run || Date.now().toString().slice(-8);
const statePath = '/opt/irenovation-remediation/test-state.json';
const checks = [];
function pass(name) { checks.push(name); console.log('PASS', name); }
async function call(path, body, cookie, method = body ? 'POST' : 'GET') {
  const form = body instanceof FormData;
  const res = await fetch(base + path, { method, headers: { ...(form ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: form ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180000) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
async function register(role, suffix) {
  const phone = '194' + run.slice(0, 7) + suffix;
  const password = 'Acceptance-' + run;
  const r = await call('/api/auth/register', { role, name: 'Acceptance ' + suffix, phone, password,
    ...(role === 'company' ? { companyName: 'Acceptance company', membershipTier: 'basic', billingCycle: 'monthly' } : {}) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { ...r.data, cookie: r.cookie, phone, password };
}
const owner = previous?.owner || await register('homeowner', '1');
const stranger = previous?.stranger || await register('homeowner', '2');
const company = previous?.company || await register('company', '3');
assert.equal((await call('/api/auth/login', { phone: owner.phone, password: 'wrong' })).status, 401);
assert.equal((await call('/api/auth/login', { phone: owner.phone, password: owner.password })).status, 200);
assert.equal((await call('/api/company/membership/apply', { tierId: 'basic', billingCycle: 'monthly' }, owner.cookie)).status, 403);
pass('personal free signup/login; wrong password rejected; personal user excluded from enterprise checkout');
const form = new FormData();
for (const [k, v] of Object.entries({ name: '完整链路验收', style: '现代简约', area: '56', budget: '15', needs: '测试项目，不属于真实客户', requestKey: 'acceptance-' + run })) form.set(k, v);
const saved = await call('/api/projects', form, owner.cookie);
assert.equal(saved.status, 200, JSON.stringify(saved.data));
const id = saved.data.id;
fs.writeFileSync(statePath, JSON.stringify({run, owner, stranger, company, id}), {mode:0o600});
assert.equal((await call('/api/projects', form, owner.cookie)).data.id, id);
assert.equal((await call('/api/projects/' + id, null, stranger.cookie)).status, 403);
assert.equal((await call('/api/projects/' + id, null)).status, 401);
assert.equal((await call('/api/orders', { projectId: id }, owner.cookie)).status, 409);
assert.equal((await call('/api/projects/' + id + '/results', { kind: 'quote', content: { total: 1 } }, owner.cookie)).status, 403);
pass('save/read permissions, retry without duplication, premature publishing and forged quote blocked');
const floorplan = await call('/api/projects/' + id + '/results', { kind: 'floorplan', upsert: true, content: {
  rects: [{ id: 1, name: '客厅', x: 0, y: 0, w: 500, d: 400 }, { id: 2, name: '卧室', x: 500, y: 0, w: 200, d: 400 }], strokes: [],
} }, owner.cookie);
assert.equal(floorplan.status, 200);
const replanTime = Date.now();
assert.equal((await call('/api/projects/' + id + '/replan', {}, owner.cookie)).status, 200);
let project;
for (let i = 0; i < 120; i++) {
  project = (await call('/api/projects/' + id, null, owner.cookie)).data;
  const qa = project.results?.find(x => x.kind === 'qa')?.content;
  if (qa?.passed && Date.parse(qa.checkedAt) >= replanTime) break;
  if (project.tasks?.some(t => t.status === 'escalated' || t.status === 'failed')) throw new Error('Design task failed: ' + JSON.stringify(project.tasks.map(t => ({ to: t.toAgent, status: t.status, output: t.output }))));
  if (i % 6 === 0) console.log('Design progress', project.tasks?.map(t => `${t.toAgent}:${t.status}`).join(', '));
  await new Promise(resolve => setTimeout(resolve, 2500));
}
assert.ok(project.results.find(r => r.kind === 'qa')?.content.passed, 'Design pipeline must reach QA passed');
const design = project.results.find(r => r.kind === 'design')?.content;
const scene = project.results.find(r => r.kind === 'scene_model')?.content;
assert.ok(design.svg.includes('<svg'));
assert.equal(scene.rooms.length, 2);
const images = project.results.find(r => r.kind === 'decorations')?.content.images || [];
assert.equal(images.filter(i => i.url || i.b64).length, 2, 'Both room images must actually exist');
pass('hand-drawn floorplan → real room images → 2D/3D → quote → QA, persisted results');
const decision = await call('/api/projects/' + id + '/results', { kind: 'decision', upsert: true, content: { adjustPct: 0, finalTotal: 1 } }, owner.cookie);
assert.equal(decision.status, 200);
const quote = project.results.find(r => r.kind === 'quote').content;
const published = await call('/api/orders', { projectId: id }, owner.cookie);
assert.equal(published.status, 200, JSON.stringify(published.data));
const order = published.data;
assert.equal((await call('/api/orders', { projectId: id }, owner.cookie)).data.id, order.id);
assert.equal((await call('/api/orders/' + order.id, { status: 'contracted' }, owner.cookie, 'PATCH')).status, 400);
assert.equal((await call('/api/orders/' + order.id + '/contract', {}, owner.cookie)).status, 409);
pass('server-authoritative quote confirmation and idempotent publication; status and contract bypasses rejected');
process.loadEnvFile('/opt/irenovation-remediation/apps/web/.env.local');
const boss = await call('/api/auth/login', { phone: process.env.BOSS_PHONE, password: process.env.BOSS_PASSWORD });
assert.equal(boss.status, 200);
const verified = await call('/api/users/' + company.id + '/verify', { action: 'approve' }, boss.cookie);
assert.equal(verified.status, 200, JSON.stringify(verified.data));
const unpaid = await call('/api/bids', { orderId: order.id, amount: String(quote.total / 10000), weeks: '8' }, company.cookie);
assert.equal(unpaid.status, 402);
assert.equal((await call('/api/orders?status=open', null, company.cookie)).status, 402);
assert.equal((await call('/api/projects/' + id, null, company.cookie)).status, 403);
pass('live provider denies unpaid company; manual qualification review works');
// Explicit provider fixture for positive domain/API tests only; no real payment is claimed.
fs.writeFileSync('/opt/irenovation-remediation/test-payment-fixtures.json', JSON.stringify({ ['company-' + company.id]: new Date(Date.now() + 86400000).toISOString() }), { mode: 0o644 });
const bidBody = { orderId: order.id, amount: String(quote.total / 10000), weeks: '8', estimatedCost: String(quote.total * 0.8 / 10000) };
const bid = await call('/api/bids', bidBody, company.cookie);
assert.equal(bid.status, 200, JSON.stringify(bid.data));
assert.equal((await call('/api/orders?status=open', null, company.cookie)).status, 200);
assert.notEqual((await call('/api/bids', bidBody, company.cookie)).status, 200);
let matched = false;
for(let i=0;i<12;i++){const result=(await call('/api/projects/'+id,null,owner.cookie)).data;matched=!!result.results.find(r=>r.kind==='match')?.content.contractors?.some(c=>c.id===company.id);if(matched)break;await new Promise(resolve=>setTimeout(resolve,1000));}
assert.ok(matched,'actual matching task must recommend the real bidder');
const chosen = await call('/api/orders/' + order.id, { status: 'matched', companyId: company.id, bidAmount: '0.01', bidWeeks: '1' }, owner.cookie, 'PATCH');
assert.equal(chosen.status, 200, JSON.stringify(chosen.data));
assert.equal(chosen.data.bidAmount, bidBody.amount);
await Promise.all([call('/api/orders/' + order.id + '/confirm', {}, owner.cookie), call('/api/orders/' + order.id + '/confirm', {}, company.cookie)]);
assert.equal((await call('/api/orders/' + order.id, null, owner.cookie)).data.status, 'confirmed');
const contract = await call('/api/orders/' + order.id + '/contract', {}, owner.cookie);
assert.equal(contract.status, 200, JSON.stringify(contract.data));
assert.ok(contract.data.content.includes(`${quote.total} 元`));
assert.ok(contract.data.content.includes('56 个自然日'));
const signed = await Promise.all([call('/api/orders/' + order.id + '/contract', { signer: 'homeowner' }, owner.cookie), call('/api/orders/' + order.id + '/contract', { signer: 'company' }, company.cookie)]);
assert.ok(signed.every(r => r.status === 200));
assert.equal((await call('/api/orders/' + order.id, null, owner.cookie)).data.status, 'contracted');
pass('controlled entitlement fixture: bid → real bid selection → concurrent confirmations → correctly priced contract → concurrent signatures');
fs.writeFileSync(statePath, JSON.stringify({ run, owner, stranger, company, bossCookie: boss.cookie, id, orderId: order.id, image: images[0], checks }), { mode: 0o600 });
console.log('Acceptance state saved. Real payment was NOT executed; positive paid membership used an explicit test fixture.');
