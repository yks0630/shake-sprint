import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const base = process.env.BASE_URL || 'http://127.0.0.1:5187';
let checks = 0;
async function call(path, input, token, status = 200) {
  const response = await fetch(base + path, {
    method: input === undefined ? 'GET' : 'POST',
    headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(8000),
  });
  assert.equal(response.status, status, 'unexpected HTTP status for ' + path); checks++;
  return response.json();
}
const room = await call('/api/rooms', { title: '准备同步接口验收' });
const path = '/api/rooms/' + room.code;
const players = [];
for (let i = 0; i < 16; i++) players.push(await call(path + '/join', { nickname: '准备测试' + (i + 1), character: i % 3 }));
const state = () => call(path);
const ready = (p, value) => call(path + '/ready', { id: p.id, round: 1, ready: value }, p.playerToken);
assert.equal((await state()).readyCount, 0); checks++;
await call(path + '/ready', { id: players[0].id, round: 1, ready: true }, players[1].playerToken, 403);
await Promise.all(players.map(p => ready(p, true)));
const joined = await state();
assert.equal(joined.count, 16); assert.equal(joined.readyCount, 16); assert.ok(joined.players.every(p => p.ready)); checks += 3;
const me = await call(path + '?player=' + players[0].id, undefined, players[0].playerToken);
assert.equal(me.me.ready, true); assert.equal(me.readyCount, 16); checks += 2;
await ready(players[0], false); assert.equal((await state()).readyCount, 15); checks++;
await ready(players[0], true); assert.equal((await state()).readyCount, 16); checks++;
// No more heartbeats: the server must expire the ready state itself.
await new Promise(resolve => setTimeout(resolve, 10200));
assert.equal((await state()).readyCount, 0); checks++;
await ready(players[0], true);
const schedule = await call(path + '/start', {}, room.hostToken);
assert.equal(schedule.endAt - schedule.startAt, 40000); checks++;
assert.equal((await ready(players[0], false)).accepted, false); checks++;
assert.equal((await state()).stage, 'countdown'); checks++;
const report = { result: 'passed', checks, participants: players.length, room: room.code, covers: ['ready count', 'individual status', 'authenticated reporting', 'refresh reset', '10 second expiry', 'start boundary'], physicalWeChatTested: false };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
