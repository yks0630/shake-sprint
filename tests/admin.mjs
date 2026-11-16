import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAdminServer } from '../admin/server.mjs';
const password = 'test-password-long-enough', serviceKey = 'test-only-management-service-key-1234567890';
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
const admin = createAdminServer({ password, serviceKey, gameOrigin, publicOrigin: gameOrigin, adminOrigin: origin });
admin.listen(port, '127.0.0.1'); await once(admin, 'listening');
const post = (path, input = {}, cookie = '', from = origin) => fetch(origin + path, { method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(input) });
try {
  assert.equal((await post('/create')).status, 401);
  assert.equal((await post('/start', { code: 'ABC234' })).status, 401);
  assert.equal((await post('/next', { code: 'ABC234' })).status, 401);
  assert.equal((await fetch(origin + '/rooms/ABC234')).status, 401);
  assert.equal(received.length, 0);
  assert.equal((await post('/login', { password }, '', 'https://evil.test')).status, 403);
  assert.equal((await post('/login', { password: 'wrong' })).status, 403);
  const login = await post('/login', { password }); assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie'); assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];
  assert.equal((await (await fetch(origin + '/session', { headers: { Cookie: cookie } })).json()).authenticated, true);
  const created = await post('/create', { title: '测试' }, cookie); assert.deepEqual(await created.json(), { code: 'ABC234' });
  assert.equal(received.at(-1).auth, 'Bearer ' + serviceKey);
  assert.equal((await post('/start', { code: 'ABC234' }, cookie, 'https://evil.test')).status, 403);
  assert.equal((await post('/start', { code: '../bad' }, cookie)).status, 400);
  assert.equal((await post('/start', { code: 'ABC234' }, cookie)).status, 200);
  assert.equal(received.at(-1).path, '/api/rooms/ABC234/start');
  assert.equal((await post('/next', { code: 'ABC234' }, cookie)).status, 200);
  assert.equal((await fetch(origin + '/rooms/ABC234', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await post('/logout', {}, cookie)).status, 200);
  assert.equal((await post('/create', {}, cookie)).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await post('/login', { password: 'bad' })).status, 403);
  assert.equal((await post('/login', { password })).status, 429);
  assert.throws(() => createAdminServer({ password: '', serviceKey }), /required/);
  console.log('Admin integration checks passed: login, logout, CSRF, throttling, service-only proxy, credential isolation');
} finally { await Promise.all([new Promise(r => admin.close(r)), new Promise(r => game.close(r))]); }
