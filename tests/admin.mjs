import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAdminServer } from '../admin/server.mjs';
const serviceKey = 'test-only-management-service-key-1234567890';
const received = [];
const game = createServer(async (req, res) => {
  received.push({ path: req.url, auth: req.headers.authorization });
  for await (const chunk of req) { /* consume */ }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(req.url === '/api/rooms' ? { code: 'ABC234', hostToken: 'must-not-leak' } : { ok: true }));
});
game.listen(0, '127.0.0.1'); await once(game, 'listening');
const gameOrigin = 'http://127.0.0.1:' + game.address().port;
// Reserve an ephemeral port, then configure the exact allowed management origin.
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(r => reservation.close(r));
const origin = 'http://127.0.0.1:' + port;
const admin = createAdminServer({ serviceKey, gameOrigin, publicOrigin: gameOrigin, adminOrigin: origin });
admin.listen(port, '127.0.0.1'); await once(admin, 'listening');
const post = (path, input = {}, cookie = '', from = origin) => fetch(origin + path, { method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(input) });
try {
  const index = await (await fetch(origin)).text();
  assert.ok(!index.includes('password') && !index.includes('id="login"') && !index.includes('退出登录'));
  assert.deepEqual(await (await fetch(origin + '/config')).json(), { publicOrigin: gameOrigin });
  const created = await post('/create', { title: '测试' });
  assert.equal(created.status, 200); assert.deepEqual(await created.json(), { code: 'ABC234' });
  assert.equal(received.at(-1).auth, 'Bearer ' + serviceKey);
  assert.equal(created.headers.get('set-cookie'), null);
  const before = received.length;
  assert.equal((await post('/start', { code: 'ABC234' }, '', 'https://evil.test')).status, 403);
  assert.equal((await post('/create', {}, '', '')).status, 403);
  assert.equal(received.length, before);
  assert.equal((await post('/start', { code: '../bad' })).status, 400);
  assert.equal((await post('/start', { code: 'ABC234' })).status, 200);
  assert.equal(received.at(-1).path, '/api/rooms/ABC234/start');
  assert.equal((await post('/next', { code: 'ABC234' })).status, 200);
  assert.equal((await fetch(origin + '/rooms/ABC234')).status, 200);
  assert.equal((await fetch(origin + '/rooms/ABC234/history?round=1')).status, 200);
  assert.equal(received.at(-1).path, '/api/rooms/ABC234/history?round=1');
  assert.equal(received.at(-1).auth, 'Bearer ' + serviceKey);
  assert.equal((await post('/login')).status, 404);
  assert.equal((await post('/logout')).status, 404);
  assert.throws(() => createAdminServer({ serviceKey: '' }), /required/);
  console.log('Admin integration checks passed: password-free management, Origin enforcement, service-only proxy, credential isolation');
} finally { await Promise.all([new Promise(r => admin.close(r)), new Promise(r => game.close(r))]); }
