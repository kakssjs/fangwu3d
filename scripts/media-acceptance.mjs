import fs from 'node:fs';
import assert from 'node:assert/strict';
const state = JSON.parse(fs.readFileSync('/opt/irenovation-remediation/test-state.json', 'utf8'));
const base = 'http://127.0.0.1:3400';
async function post(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { cookie: state.owner.cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
const bytes = fs.readFileSync('/tmp/test-floorplan.png');
const recognized = await post('/api/mimo/recognize', { image: 'data:image/png;base64,' + bytes.toString('base64'), runs: 1 });
assert.ok(recognized.rooms.length >= 3, JSON.stringify(recognized));
assert.ok(recognized.rooms.every(r => Number.isFinite(r.x) && Number.isFinite(r.y) && r.w > 0 && r.d > 0));
console.log('PASS real MiMo recognition: room rectangles with valid coordinates, token usage', recognized.tokensUsed);
const edited = await post('/api/agnes/chat', { message: 'Change the sofa fabric to warm beige, preserve the room layout.', imageUrl: state.image.url,
  room: state.image.room, style: '现代简约' });
assert.ok(edited.url || edited.b64_json);
const original = await fetch(base + '/api/projects/' + state.id, { headers: { cookie: state.owner.cookie } });
const project = await original.json();
const images = project.results.find(r => r.kind === 'decorations').content.images;
images[0] = { ...images[0], url: edited.url, b64: edited.b64_json, history: [{ ...images[0] }] };
await post('/api/projects/' + state.id + '/results', { kind: 'decorations', upsert: true, content: { images } });
const reloaded = await fetch(base + '/api/projects/' + state.id, { headers: { cookie: state.owner.cookie } });
const result = await reloaded.json();
assert.equal(result.results.find(r => r.kind === 'decorations').content.images[0].history.length, 1);
console.log('PASS real Agnes image editing, persistence and original-image history preserved');
fs.writeFileSync('/opt/irenovation-remediation/media-acceptance.json', JSON.stringify({ recognitionRooms: recognized.rooms.length,
  edited: true, imageHistory: true, editedImage: edited.url || null }), { mode: 0o600 });
