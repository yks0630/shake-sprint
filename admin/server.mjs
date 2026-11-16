import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
export function createAdminServer(config) {
  const { password, serviceKey, publicOrigin, gameOrigin, adminOrigin } = config;
  if (!password || password.length < 12 || !serviceKey || serviceKey.length < 32) throw new Error('ADMIN_PASSWORD (12+ chars) and ADMIN_SERVICE_KEY (32+ chars) are required');
  for (const origin of [publicOrigin, gameOrigin, adminOrigin]) {
    const u = new URL(origin);
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== origin) throw new Error('Configure origins without paths or trailing slashes');
  }
  const sessions = new Map(), attempts = new Map();
  const secure = adminOrigin.startsWith('https:');
  const cookie = value => `sprint_admin=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? 28800 : 0}${secure ? '; Secure' : ''}`;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, expires] of sessions) if (expires <= now) sessions.delete(key);
    for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
  }, 60000);
  timer.unref();
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', `default-src 'self'; frame-src ${publicOrigin}; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const path = new URL(req.url, adminOrigin).pathname;
      // Forwarded Host and client-IP headers are intentionally not trusted.
      if (req.headers.host !== new URL(adminOrigin).host) return send(403, { error: '管理域名无效' });
      if (req.method === 'GET' && ['/', '/client.js', '/style.css'].includes(path)) {
        const file = { '/': 'index.html', '/client.js': 'client.js', '/style.css': 'style.css' }[path];
        const data = await readFile(new URL(file, import.meta.url));
        res.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' }); res.end(data); return;
      }
      const sid = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('sprint_admin='))?.slice(13);
      const authenticated = !!sid && (sessions.get(sid) || 0) > Date.now();
      if (req.method === 'GET' && path === '/session') return send(200, { authenticated, publicOrigin });
      if (req.method === 'GET' && /^\/rooms\/[A-Z2-9]{6}$/.test(path)) {
        if (!authenticated) return send(401, { error: '请先登录管理后台' });
        const upstream = await fetch(gameOrigin + '/api' + path, { redirect: 'error', signal: AbortSignal.timeout(8000) });
        return send(upstream.status, await upstream.json());
      }
      if (req.method !== 'POST') return send(404, { error: '操作不存在' });
      if (req.headers.origin !== adminOrigin) return send(403, { error: '请求来源无效' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(400, { error: '请使用 JSON 请求' });
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return send(413, { error: '内容过长' }); }
      let input;
      try { input = JSON.parse(raw); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); } catch { return send(400, { error: '请求内容无效' }); }
      if (path === '/login') {
        const ip = req.socket.remoteAddress || 'unknown';
        const attempt = attempts.get(ip);
        if (attempt && attempt.until > Date.now() && attempt.count >= 5) return send(429, { error: '尝试过多，请 15 分钟后再试' });
        if (typeof input.password !== 'string' || !equal(input.password, password)) {
          const item = attempt && attempt.until > Date.now() ? attempt : { count: 0, until: Date.now() + 900000 };
          item.count++; attempts.set(ip, item); return send(403, { error: '管理密码错误' });
        }
        attempts.delete(ip);
        if (sid) sessions.delete(sid);
        if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
        const next = randomBytes(32).toString('hex'); sessions.set(next, Date.now() + 28800000);
        res.setHeader('Set-Cookie', cookie(next)); return send(200, { ok: true });
      }
      if (!authenticated) return send(401, { error: '请先登录管理后台' });
      if (path === '/logout') { sessions.delete(sid); res.setHeader('Set-Cookie', cookie('')); return send(200, { ok: true }); }
      if (!['/create', '/start', '/next'].includes(path)) return send(404, { error: '操作不存在' });
      if (path !== '/create' && !/^[A-Z2-9]{6}$/.test(input.code || '')) return send(400, { error: '房间号无效' });
      const target = path === '/create' ? '/api/rooms' : `/api/rooms/${input.code}${path}`;
      const upstream = await fetch(gameOrigin + target, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + serviceKey },
        body: JSON.stringify(path === '/create' ? { title: input.title } : {}),
      });
      const result = await upstream.json();
      // Never relay credentials or arbitrary upstream fields to the browser.
      return send(upstream.status, upstream.ok ? (path === '/create' ? { code: result.code } : { ok: true }) : { error: result.error || '操作失败' });
    } catch { send(502, { error: '游戏服务暂时不可用，请重试' }); }
  });
  server.on('close', () => clearInterval(timer));
  server.requestTimeout = 10000;
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createAdminServer({ password: process.env.ADMIN_PASSWORD, serviceKey: process.env.ADMIN_SERVICE_KEY,
    adminOrigin: process.env.ADMIN_ORIGIN, publicOrigin: process.env.PUBLIC_GAME_ORIGIN, gameOrigin: process.env.GAME_INTERNAL_ORIGIN });
  server.listen(Number(process.env.ADMIN_PORT || 5188), process.env.ADMIN_HOST || '127.0.0.1', () => console.log('Management backend listening'));
}
