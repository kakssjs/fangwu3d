import fs from 'node:fs';
import assert from 'node:assert/strict';
const state = JSON.parse(fs.readFileSync('/opt/irenovation-remediation/test-state.json', 'utf8'));
const base = 'http://127.0.0.1:3400';
const cookie = state.owner.cookie;
const results = [];
async function request(path, body, session = cookie, method = 'POST') {
  const form = body instanceof FormData;
  const r = await fetch(base + path, { method, headers: { ...(form ? {} : { 'content-type': 'application/json' }), cookie: session },
    ...(body ? { body: form ? body : JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json() };
}
const badFile = new FormData(); badFile.set('name', 'invalid upload');
badFile.set('floorPlan', new Blob(['not an image']), '../../invalid.png');
assert.equal((await request('/api/projects', badFile)).status, 400);
const goodFile = new FormData(); goodFile.set('name', 'upload-only acceptance'); goodFile.set('area', '56');
goodFile.set('floorPlan', new Blob([fs.readFileSync('/tmp/test-floorplan.png')], { type: 'image/png' }), '../../outside.png');
const saved = await request('/api/projects', goodFile);
assert.equal(saved.status, 200);
const read = await request('/api/projects/' + saved.data.id, null, cookie, 'GET');
assert.match(read.data.project.floorPlanPath, /[a-f0-9-]{36}\.png$/);
assert.ok(!read.data.project.floorPlanPath.includes('outside'));
assert.equal((await request('/api/projects/' + saved.data.id, null, cookie, 'DELETE')).status, 200);
assert.ok(!fs.existsSync(read.data.project.floorPlanPath));
results.push('valid upload uses server-generated filename; invalid image rejected; delete cleans file and project');
assert.equal((await request('/api/projects', { name: 'wrong transport' })).status, 400);
assert.equal((await request('/api/projects/' + state.id + '/results', { kind: 'scene_model', content: { schema: 'invalid' } })).status, 400);
assert.equal((await request('/api/boss', { taskId: 1, action: 'retry' })).status, 403);
assert.equal((await request('/api/auth/me', null, 'ireno_session=a.%C3%A9', 'GET')).status, 401);
results.push('malformed project/scene data rejected; owner cannot adjudicate; invalid session denied');
const waitingForm = new FormData(); waitingForm.set('name', '任务裁决验收');
const waitingProject = await request('/api/projects', waitingForm);
assert.equal(waitingProject.status, 200);
let task;
for (let i = 0; i < 20; i++) {
  const current = await request('/api/projects/' + waitingProject.data.id, null, cookie, 'GET');
  task = current.data.tasks.find(t => t.status === 'waiting_user');
  if (task) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(task, 'Project without a floorplan must ask the user rather than inventing one');
assert.equal((await request('/api/boss', { taskId: task.id, action: 'dismiss' }, state.bossCookie)).status, 200);
const decided = await request('/api/projects/' + waitingProject.data.id, null, cookie, 'GET');
assert.equal(decided.data.tasks.find(t => t.id === task.id).status, 'cancelled');
results.push('boss task decision persisted; missing floorplan asks user without fabricated output');
const list = await request('/api/projects', null, cookie, 'GET');
for (const project of list.data.filter(p => p.name.startsWith('浏览器验收'))) {
  const detail = await request('/api/projects/' + project.id, null, cookie, 'GET');
  const waiting = detail.data.tasks.find(t => t.status === 'waiting_user');
  if (!waiting) continue;
  const dismissed = await request('/api/boss', { taskId: waiting.id, action: 'dismiss' }, state.bossCookie);
  assert.equal(dismissed.status, 200);
  const again = await request('/api/projects/' + project.id, null, cookie, 'GET');
  assert.equal(again.data.tasks.find(t => t.id === waiting.id).status, 'cancelled');
  results.push('boss task decision persisted and read back');
  break;
}
console.log('PASS', results.join('; '));
