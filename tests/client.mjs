import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

// Exercise the real components' effects and event handlers with a deterministic
// clock and transport. This is a unit harness, not a physical motion test.
let active;
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
globalThis.__CLIENT_HOOKS__ = {
  useState(initial) {
    const h = active, i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [h.slots[i], value => {
      const next = typeof value === 'function' ? value(h.slots[i]) : value;
      if (!Object.is(next, h.slots[i])) { h.slots[i] = next; h.dirty = true; }
    }];
  },
  useRef(value) {
    const h = active, i = h.cursor++;
    return h.slots[i] ||= { current: value };
  },
  useCallback(fn, deps) {
    const h = active, i = h.cursor++, old = h.slots[i];
    if (!old || !same(old.deps, deps)) h.slots[i] = { fn, deps };
    return h.slots[i].fn;
  },
  useEffect(fn, deps) {
    const h = active, i = h.cursor++, old = h.slots[i];
    if (!old || !same(old.deps, deps)) {
      const next = { deps, cleanup: old?.cleanup };
      h.slots[i] = next;
      h.effects.push(() => { next.cleanup?.(); next.cleanup = fn(); });
    }
  },
};
const compiled = await build({ stdin: {
  contents: readFileSync('app/game-client.tsx', 'utf8'),
  loader: 'tsx', resolveDir: process.cwd() + '/app',
}, bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [{
  name: 'component-test-runtime', setup(b) {
    b.onResolve({ filter: /^(react(?:\/jsx-runtime)?|lucide-react|qrcode)$/ }, args => ({ path: args.path, namespace: 'fake-ui' }));
    b.onLoad({ filter: /.*/, namespace: 'fake-ui' }, args => ({ contents:
      args.path === 'react' ? 'export const {useState,useRef,useCallback,useEffect}=globalThis.__CLIENT_HOOKS__;' :
      args.path === 'react/jsx-runtime' ? 'export const Fragment="fragment";export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;' :
      args.path === 'qrcode' ? 'export default {toDataURL:async()=>""};' :
      'const Icon=()=>null;export {' + ['ArrowRight','Check','ChevronLeft','ChevronRight','Copy','Expand','Flag','LoaderCircle','Play','Radio','RotateCcw','Smartphone','Timer','Trophy','Users','Zap'].map(n => 'Icon as ' + n).join(',') + '};'
    }));
  }
}] });
const { default: GameClient, Phone, Board } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
let transport, readinessTransport;
globalThis.fetch = (url, options) => String(url).endsWith('/ready') ? readinessTransport(url, options) : transport(url, options);
let timers = new Map(), events = new Map(), nextTimer = 1, now = 100000;
const originals = { now: Date.now, fetch: globalThis.fetch, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
Date.now = () => now;
globalThis.document = { hidden: false };
globalThis.window = { isSecureContext: true, DeviceMotionEvent: class {},
  addEventListener(name, fn) { events.set(name, fn); },
  removeEventListener(name, fn) { if (events.get(name) === fn) events.delete(name); },
};
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.location = { origin: 'https://game.test' };
globalThis.setInterval = (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; };
globalThis.clearInterval = id => timers.delete(id);
globalThis.setTimeout = (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms, once: true }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
function render(Component, props) {
  const h = { slots: [], effects: [], cursor: 0, dirty: true, tree: null, props,
    flush() {
      let turns = 0;
      while (h.dirty || h.effects.length) {
        assert.ok(++turns < 30, 'component settles');
        if (h.dirty) { h.dirty = false; h.cursor = 0; active = h; h.tree = Component(h.props); active = null; }
        const effects = h.effects.splice(0); effects.forEach(fn => fn());
      }
      return h.tree;
    },
    unmount() { for (const slot of h.slots) slot?.cleanup?.(); },
  };
  h.flush(); return h;
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
const find = (h, predicate) => nodes(h.tree).find(predicate);
const button = (h, label) => find(h, n => n.type === 'button' && text(n) === label);
const settle = async h => { for (let i = 0; i < 8; i++) { await Promise.resolve(); h.flush(); } };
const snapshot = (round = 1) => ({ code: 'ABC123', title: '测试运动会', round, stage: 'lobby', startAt: null, endAt: null, serverNow: now, count: 1, players: [], me: null });
const response = data => ({ ok: true, status: 200, json: async () => data });
const failures = [];
async function test(name, fn) {
  timers.clear(); events.clear(); now = 100000; readinessTransport = async () => ({ ok: true, status: 200, json: async () => ({ accepted: true }) });
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  try { await fn(); console.log('PASS', name); }
  catch (e) { failures.push(name); console.error('FAIL', name, e.message); }
}
try {
  await test('UI review cannot create participants or upload scores', async () => {
    let requests = 0, joined = null;
    transport = async () => { requests++; throw new Error('review must stay local'); };
    readinessTransport = async () => { requests++; throw new Error('review readiness must stay local'); };
    const props = { preview: true, data: snapshot(), clock: now, getNow: () => now, session: null, isDemo: false, error: '', setError() {}, setSession(value) { joined = value; }, onDemoShake() {}, refresh: async () => {} };
    const h = render(Phone, props);
    await find(h, n => n.props?.className === 'join-form').props.onSubmit({ preventDefault() {} }); await settle(h);
    assert.equal(joined.id, 'review-0');
    h.props = { ...props, session: joined, data: { ...snapshot(), stage: 'running', startAt: now - 1000, endAt: now + 39000 } }; h.dirty = true; h.flush();
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    assert.equal(events.has('devicemotion'), false);
    assert.equal([...timers.values()].some(t => t.ms === 220), false);
    assert.equal(requests, 0);
    h.unmount();
  });
  await test('formal preparation distinguishes joining from enabling motion', async () => {
    const h = render(Phone, { data: snapshot(), clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    assert.match(text(h.tree), /已加入 · 请先开启摇一摇/);
    assert.equal(text(find(h, n => n.props?.['data-preparation'])), '参赛准备');
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    assert.match(text(h.tree), /准备同步中 · 等待主持人开赛/);
    h.props = { ...h.props, data: { ...snapshot(), me: { id: 'p', nickname: '测试', character: 0, shakes: 0, rank: 1, ready: true } } }; h.dirty = true; h.flush();
    assert.match(text(h.tree), /准备完成 · 等待主持人开赛/);
    h.props = { ...h.props, data: { ...snapshot(), stage: 'countdown', startAt: now + 3000, endAt: now + 43000 } }; h.dirty = true; h.flush();
    assert.match(text(h.tree), /手机拿稳，准备出发/);
    assert.ok(!text(h.tree).includes('持续摇动手机，加油！'), 'countdown does not ask for scored motion yet');
    h.unmount();
  });
  await test('host controls return at results and stay hidden during the race', async () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    const props = { data: snapshot(), clock: now, isHost: true, isDemo: false, hasToken: true, busy: false, control() {}, error: '' };
    const h = render(Board, props);
    try {
      assert.ok(button(h, '开始比赛 · 40 秒'));
      for (const stage of ['countdown', 'running']) {
        h.props = { ...props, data: { ...snapshot(), stage, startAt: now + 3000, endAt: now + 43000 } }; h.dirty = true; h.flush();
        assert.ok(!find(h, n => n.props?.className === 'host-bar'));
        assert.ok(!find(h, n => n.props?.className === 'join-panel'));
      }
      h.props = { ...props, data: { ...snapshot(), stage: 'finished', endAt: now - 3000 } }; h.dirty = true; h.flush();
      assert.ok(button(h, '再来一场'));
    } finally { h.unmount(); delete window.matchMedia; }
  });
  await test('stale final snapshots cannot erase pending motion or declare final results', async () => {
    const endAt = now - 3000, startAt = endAt - 40000;
    sessionStorage.setItem('pending-score-ABC123-p', JSON.stringify({ round: 1, startAt, shakes: 20 }));
    // The phone mounted during the final upload window, then lost connection.
    now = endAt + 1000;
    const props = { data: { ...snapshot(), stage: 'finished', startAt, endAt, serverNow: endAt - 100, me: { id: 'p', nickname: '测试', character: 0, shakes: 18, rank: 2 } }, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} };
    const h = render(Phone, props);
    now = endAt + 4000; h.props = { ...props, clock: now }; h.dirty = true; h.flush();
    assert.match(text(h.tree), /正在汇总成绩/);
    assert.match(text(find(h, n => n.props?.className === 'phone-result-stats')), /^40米/);
    h.props = { ...props, clock: now, data: { ...props.data, serverNow: now } }; h.dirty = true; h.flush();
    assert.match(text(h.tree), /你的最终成绩/);
    assert.match(text(find(h, n => n.props?.className === 'phone-result-stats')), /^36米/);
    assert.match(text(h.tree), /部分摇动未及时同步/);
    h.unmount();
  });
  await test('host waits for a fresh final snapshot before enabling the next race', async () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    const props = { data: { ...snapshot(), stage: 'finished', endAt: now - 3000, serverNow: now - 4000 }, clock: now, isHost: true, isDemo: false, hasToken: true, busy: false, control() {}, error: '' };
    const h = render(Board, props);
    try {
      assert.equal(button(h, '再来一场').props.disabled, true);
      assert.match(text(h.tree), /正在汇总最后的成绩/);
      h.props = { ...props, data: { ...props.data, serverNow: now } }; h.dirty = true; h.flush();
      assert.equal(button(h, '再来一场').props.disabled, false);
    } finally { h.unmount(); delete window.matchMedia; }
  });
  for (const blocked of ['localStorage', 'sessionStorage']) {
    await test('new credentials survive reload when ' + blocked + ' is readable but not writable', async () => {
      const key = 'player-ABC123', stale = JSON.stringify({ id: 'old', playerToken: 'old-token' });
      localStorage.setItem(key, stale); sessionStorage.setItem(key, stale);
      globalThis[blocked].setItem = () => { throw new Error('quota exceeded'); };
      globalThis[blocked].removeItem = () => { throw new Error('read only'); };
      transport = async url => url.endsWith('/join') ? response({ id: 'new', playerToken: 'new-token' }) : response(snapshot());
      const p = render(Phone, { data: snapshot(), clock: now, getNow: () => now, session: null, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
      await find(p, n => n.props?.className === 'join-form').props.onSubmit({ preventDefault() {} }); await settle(p); p.unmount();
      const h = render(GameClient, { view: 'play', code: 'ABC123' }); await settle(h);
      assert.equal(find(h, n => n.type === Phone).props.session.id, 'new');
      h.unmount();
    });
  }
  await test('a delayed upload error from the last round does not pollute the next round', async () => {
    let rejectUpload;
    transport = () => new Promise((_resolve, reject) => { rejectUpload = reject; });
    const props = { data: { ...snapshot(), stage: 'running', startAt: now - 1000, endAt: now + 39000 }, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} };
    const h = render(Phone, props);
    const uploading = [...timers.values()].find(t => t.ms === 220).fn();
    h.props = { ...props, data: snapshot(2) }; h.dirty = true; h.flush();
    rejectUpload(new Error('old request failed')); await uploading; await settle(h);
    assert.ok(!text(h.tree).includes('成绩同步中'), 'last round errors must not appear in a new round');
    h.unmount();
  });
  await test('changing the phone wall clock does not end the race early', async () => {
    const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
    let monotonic = 1000;
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => monotonic } });
    transport = async () => response({ ...snapshot(), stage: 'running', startAt: now - 10000, endAt: now + 30000 });
    const h = render(GameClient, { view: 'play', code: 'ABC123' }); await settle(h);
    try {
      now += 86400000; monotonic += 1000;
      [...timers.values()].find(t => t.ms === 100).fn(); h.flush();
      const phone = find(h, n => n.type === Phone);
      assert.equal(phone.props.data.stage, 'running');
      assert.ok(Math.abs(phone.props.getNow() - 101000) < 2);
      now -= 172800000; monotonic += 1000;
      [...timers.values()].find(t => t.ms === 100).fn(); h.flush();
      assert.equal(find(h, n => n.type === Phone).props.data.stage, 'running');
      assert.ok(Math.abs(find(h, n => n.type === Phone).props.getNow() - 102000) < 2);
    } finally { h.unmount(); Object.defineProperty(globalThis, 'performance', originalPerformance); }
  });
  await test('readiness reports enabling, refresh reset, hidden state and the next round', async () => {
    const reports = [];
    readinessTransport = async (_url, options) => { reports.push(JSON.parse(options.body)); return response({ accepted: true }); };
    const props = { data: snapshot(), clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} };
    let h = render(Phone, props); await settle(h);
    assert.equal(reports.at(-1).ready, false, 'a fresh page cannot inherit stale readiness');
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    assert.equal(reports.at(-1).ready, true);
    document.hidden = true;
    await [...timers.values()].find(t => t.ms === 2500).fn(); await settle(h);
    assert.equal(reports.at(-1).ready, false);
    document.hidden = false;
    h.props = { ...props, data: snapshot(2) }; h.dirty = true; h.flush(); await settle(h);
    assert.equal(reports.at(-1).round, 2); assert.equal(reports.at(-1).ready, true);
    h.unmount(); h = render(Phone, props); await settle(h);
    assert.equal(reports.at(-1).ready, false); h.unmount();
  });
  await test('permission denial never reports prepared', async () => {
    const reports = [], OriginalMotion = window.DeviceMotionEvent;
    readinessTransport = async (_url, options) => { reports.push(JSON.parse(options.body)); return response({ accepted: true }); };
    window.DeviceMotionEvent = class { static async requestPermission() { return 'denied'; } };
    const h = render(Phone, { data: snapshot(), clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    try { await button(h, '开启摇一摇').props.onClick(); await settle(h); assert.ok(reports.every(r => !r.ready)); assert.match(text(h.tree), /需要允许访问运动传感器/); }
    finally { h.unmount(); window.DeviceMotionEvent = OriginalMotion; }
  });
  await test('readiness changes are serialized while an older heartbeat is pending', async () => {
    let release; const reports = [];
    readinessTransport = (_url, options) => { reports.push(JSON.parse(options.body)); return new Promise(resolve => { release = () => resolve(response({ accepted: true })); }); };
    const h = render(Phone, { data: snapshot(), clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    assert.equal(reports.length, 1); assert.equal(reports[0].ready, false);
    release(); await settle(h); assert.equal(reports.at(-1).ready, true);
    release(); await settle(h); h.unmount();
  });
  await test('failed readiness reports retry without claiming server confirmation', async () => {
    let failed = true;
    readinessTransport = async () => { if (failed) throw new Error('offline'); return response({ accepted: true }); };
    const h = render(Phone, { data: snapshot(), clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    assert.match(text(h.tree), /准备状态尚未同步/); assert.match(text(h.tree), /准备同步中/);
    failed = false; await [...timers.values()].find(t => t.ms === 2500).fn(); await settle(h);
    assert.ok(!text(h.tree).includes('准备状态尚未同步')); h.unmount();
  });
  await test('blocked browser storage does not crash the room', async () => {
    globalThis.localStorage.getItem = () => { throw new Error('storage denied'); };
    transport = async () => response(snapshot());
    const h = render(GameClient, { view: 'play', code: 'ABC123' }); await settle(h);
    assert.ok(find(h, n => n.type === Phone), 'the room still loads');
    h.unmount();
  });
  await test('plain-text service failures show a readable connection error', async () => {
    transport = async () => ({ ok: false, status: 503, json: async () => { throw new SyntaxError('Unexpected token'); } });
    const h = render(GameClient, { view: 'play', code: 'ABC123' }); await settle(h);
    assert.match(text(h.tree), /连接暂时不可用，请稍后重试/);
    assert.ok(!text(h.tree).includes('Unexpected token'));
    h.unmount();
  });
  await test('invalid saved credentials return to the join form', async () => {
    localStorage.setItem('player-ABC123', JSON.stringify({ id: 'expired', playerToken: 'old' }));
    transport = async url => url.includes('?player=') ? { ok: false, status: 403, json: async () => ({ error: '参赛凭证已失效，请重新加入' }) } : response(snapshot());
    const h = render(GameClient, { view: 'play', code: 'ABC123' }); await settle(h); await settle(h);
    const phone = find(h, n => n.type === Phone);
    assert.ok(phone, 'public room still loads after credential rejection');
    assert.equal(phone.props.session, null);
    h.unmount();
  });
  await test('reload restores a shake that has not uploaded yet', async () => {
    const props = { data: { ...snapshot(), stage: 'running', startAt: now - 1000, endAt: now + 39000 }, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} };
    let h = render(Phone, props);
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    events.get('devicemotion')({ acceleration: { x: 14, y: 0, z: 0 } }); h.flush(); h.unmount();
    h = render(Phone, props);
    assert.match(text(find(h, n => n.props?.className === 'phone-live-stats')), /^2米/);
    h.unmount();
  });
  await test('fast movement respects the same score limit on phone and server', async () => {
    const base = now, originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now - base } });
    const props = { data: { ...snapshot(), stage: 'running', startAt: base, endAt: base + 40000 }, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} };
    const h = render(Phone, props);
    try {
      await button(h, '开启摇一摇').props.onClick(); await settle(h);
      for (let i = 0; i < 600; i++) { now = base + i * 1000 / 60; events.get('devicemotion')({ acceleration: { x: 24 * Math.sin(2 * Math.PI * 5 * (now - base) / 1000), y: 0, z: 0 } }); }
      h.flush();
      const shakes = Number(text(find(h, n => n.props?.className === 'phone-live-stats')).match(/^(\d+)米/)[1]) / 2;
      assert.ok(shakes >= 69 && shakes <= 70, 'rapid shaking saturates at the shared rate without overshooting the server');
    } finally { h.unmount(); Object.defineProperty(globalThis, 'performance', originalPerformance); }
  });
  await test('next round ignores the previous round checkpoint', async () => {
    sessionStorage.setItem('pending-score-ABC123-p', JSON.stringify({ round: 1, startAt: now - 50000, shakes: 160 }));
    const h = render(Phone, { data: snapshot(2), clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    assert.match(text(find(h, n => n.props?.className === 'phone-live-stats')), /^0米/);
    assert.equal(sessionStorage.getItem('pending-score-ABC123-p'), null);
    h.unmount();
  });
  await test('switching participant identity resets local scores', async () => {
    const props = { data: { ...snapshot(), stage: 'running', startAt: now - 1000, endAt: now + 39000 }, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} };
    const h = render(Phone, props);
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    events.get('devicemotion')({ acceleration: { x: 14, y: 0, z: 0 } }); h.flush();
    h.props = { ...props, session: { id: 'other', playerToken: 'other-token' } }; h.dirty = true; h.flush();
    assert.match(text(find(h, n => n.props?.className === 'phone-live-stats')), /^0米/);
    h.unmount();
  });
  await test('temporary connection failures retain participant credentials', async () => {
    localStorage.setItem('player-ABC123', JSON.stringify({ id: 'p', playerToken: 't' }));
    let calls = 0;
    transport = async () => ++calls === 1 ? { ok: false, status: 503, json: async () => ({ error: '暂时不可用' }) } : response({ ...snapshot(), me: { id: 'p', nickname: '测试', character: 0, shakes: 0, rank: 1 } });
    const h = render(GameClient, { view: 'play', code: 'ABC123' }); await settle(h);
    const poll = [...timers.values()].find(t => t.once && t.ms === 400); await poll.fn(); await settle(h);
    assert.equal(find(h, n => n.type === Phone).props.session.id, 'p');
    h.unmount();
  });
  await test('short-screen result pagination includes every participant', async () => {
    let resize;
    const media = { matches: true, addEventListener(_name, fn) { resize = fn; }, removeEventListener() {} };
    window.matchMedia = () => media;
    const players = Array.from({ length: 137 }, (_, i) => ({ id: 'p-' + i, nickname: '测试' + i, character: i % 3, shakes: 137 - i, rank: i + 1 }));
    const h = render(Board, { data: { ...snapshot(), stage: 'finished', endAt: now - 3000, count: 137, players }, clock: now, isHost: false, isDemo: false, hasToken: false, busy: false, control() {}, error: '' });
    const tiles = () => nodes(h.tree).filter(n => n.props?.className === 'participant-tile');
    assert.equal(tiles().length, 8, 'short displays show fewer result rows');
    const seen = new Set();
    for (let i = 0; i < 18; i++) { tiles().forEach(n => seen.add(n.key)); find(h, n => n.props?.['aria-label'] === '下一页参赛者').props.onClick(); h.flush(); }
    assert.equal(seen.size, 137, 'pagination does not skip participants');
    media.matches = false; resize(); h.flush();
    assert.equal(tiles().length, 12);
    assert.equal(tiles()[0].key, 'p-0', 'resizing returns to the first page');
    h.unmount(); delete window.matchMedia;
  });
  await test('motion at the end boundary uses the current time', async () => {
    const data = { ...snapshot(), stage: 'running', startAt: now - 39950, endAt: now + 50 };
    const h = render(Phone, { data, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    now += 51;
    events.get('devicemotion')({ acceleration: { x: 14, y: 0, z: 0 } }); h.flush();
    const count = find(h, n => n.props?.className === 'motion-ready');
    assert.match(text(count), /已摇动 0 次/);
    h.unmount();
  });
  await test('a superseded public snapshot cannot overwrite a joined session', async () => {
    const pending = [];
    transport = () => new Promise(resolve => pending.push(resolve));
    const h = render(GameClient, { view: 'play', code: 'ABC123' });
    assert.equal(pending.length, 1, 'initial public poll');
    pending[0](response(snapshot())); await settle(h);
    const phone = find(h, n => n.type === Phone);
    const poll = [...timers.values()].find(t => t.once && t.ms === 400);
    poll.fn(); assert.equal(pending.length, 2, 'second public poll');
    phone.props.setSession({ id: 'p', playerToken: 't' }); h.flush();
    assert.equal(pending.length, 3, 'authenticated poll');
    pending[2](response({ ...snapshot(2), me: { id: 'p', nickname: '测试', character: 0, shakes: 0, rank: 1 } })); await settle(h);
    pending[1](response(snapshot(1))); await settle(h);
    assert.equal(find(h, n => n.type === Phone).props.data.round, 2);
    h.unmount();
  });
  await test('first motion after the start counts despite a stale rendered clock', async () => {
    const data = { ...snapshot(), stage: 'countdown', startAt: now + 50, endAt: now + 40050 };
    const h = render(Phone, { data, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    now += 51;
    events.get('devicemotion')({ acceleration: { x: 14, y: 0, z: 0 } }); h.flush();
    assert.match(text(find(h, n => n.props?.className === 'motion-ready')), /已摇动 1 次/);
    h.unmount();
  });
  await test('countdown motion is excluded from scores', async () => {
    const data = { ...snapshot(), stage: 'countdown', startAt: now + 3000, endAt: now + 43000 };
    const h = render(Phone, { data, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    events.get('devicemotion')({ acceleration: { x: 14, y: 0, z: 0 } }); h.flush();
    assert.match(text(find(h, n => n.props?.className === 'motion-ready')), /已摇动 0 次/);
    h.unmount();
  });
  await test('background motion is excluded from scores', async () => {
    const data = { ...snapshot(), stage: 'running', startAt: now - 1000, endAt: now + 39000 };
    const h = render(Phone, { data, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    await button(h, '开启摇一摇').props.onClick(); await settle(h);
    document.hidden = true;
    try { events.get('devicemotion')({ acceleration: { x: 14, y: 0, z: 0 } }); h.flush(); }
    finally { document.hidden = false; }
    assert.match(text(find(h, n => n.props?.className === 'motion-ready')), /已摇动 0 次/);
    h.unmount();
  });
  await test('successful background polling keeps action errors visible', async () => {
    transport = async () => response(snapshot());
    const h = render(GameClient, { view: 'play', code: 'ABC123' }); await settle(h);
    find(h, n => n.type === Phone).props.setError('请输入有效昵称'); h.flush();
    const poll = [...timers.values()].find(t => t.once && t.ms === 400);
    await poll.fn(); await settle(h);
    assert.equal(find(h, n => n.type === Phone).props.error, '请输入有效昵称');
    h.unmount();
  });
  await test('a stalled score upload times out and allows a retry', async () => {
    let uploads = 0;
    transport = (_url, options) => {
      uploads++;
      return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    };
    const data = { ...snapshot(), stage: 'running', startAt: now - 1000, endAt: now + 39000 };
    const h = render(Phone, { data, clock: now, getNow: () => now, session: { id: 'p', playerToken: 't' }, isDemo: false, error: '', setError() {}, setSession() {}, refresh: async () => {} });
    const send = [...timers.values()].find(t => t.ms === 220).fn;
    send();
    assert.equal(uploads, 1);
    const timeout = [...timers.values()].find(t => t.once && t.ms <= 2000);
    assert.ok(timeout, 'score requests have a bounded timeout shorter than the final upload window');
    now += 2000; timeout.fn(); await settle(h);
    send(); assert.equal(uploads, 2, 'timed-out upload no longer blocks later scores');
    h.unmount();
  });
} finally {
  Date.now = originals.now;
  Object.assign(globalThis, { fetch: originals.fetch, setInterval: originals.setInterval, clearInterval: originals.clearInterval, setTimeout: originals.setTimeout, clearTimeout: originals.clearTimeout });
  delete globalThis.__CLIENT_HOOKS__; delete globalThis.window; delete globalThis.document; delete globalThis.localStorage; delete globalThis.sessionStorage; delete globalThis.location;
}
if (failures.length) { console.error(failures.length + ' client regressions reproduced'); process.exitCode = 1; }
