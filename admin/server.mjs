import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function createAdminServer(config) {
  const { serviceKey, publicOrigin, gameOrigin, adminOrigin } = config;
  if (!serviceKey || serviceKey.length < 32) throw new Error('ADMIN_SERVICE_KEY (32+ chars) is required');
  for (const origin of [publicOrigin, gameOrigin, adminOrigin]) {
    const u = new URL(origin);
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== origin) throw new Error('Configure origins without paths or trailing slashes');
  }
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
      if (req.method === 'GET' && path === '/config') return send(200, { publicOrigin });
      if (req.method === 'GET' && /^\/rooms\/[A-Z2-9]{6}(?:\/history)?$/.test(path)) {
        const upstream = await fetch(gameOrigin + '/api' + path + new URL(req.url, adminOrigin).search, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + serviceKey } });
        return send(upstream.status, await upstream.json());
      }
      if (req.method !== 'POST') return send(404, { error: '操作不存在' });
      if (req.headers.origin !== adminOrigin) return send(403, { error: '请求来源无效' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(400, { error: '请使用 JSON 请求' });
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return send(413, { error: '内容过长' }); }
      let input;
      try { input = JSON.parse(raw); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); } catch { return send(400, { error: '请求内容无效' }); }
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
  server.requestTimeout = 10000;
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createAdminServer({ serviceKey: process.env.ADMIN_SERVICE_KEY,
    adminOrigin: process.env.ADMIN_ORIGIN, publicOrigin: process.env.PUBLIC_GAME_ORIGIN, gameOrigin: process.env.GAME_INTERNAL_ORIGIN });
  server.listen(Number(process.env.ADMIN_PORT || 5188), process.env.ADMIN_HOST || '127.0.0.1', () => console.log('Management backend listening'));
}
