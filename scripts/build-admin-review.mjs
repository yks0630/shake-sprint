import { readFile, writeFile } from 'node:fs/promises';
// Static visual review of the real management template. No service credentials,
// management JavaScript or write endpoints are included.
let html = (await readFile('admin/index.html', 'utf8'))
  .replace('href="/style.css"', 'href="/review-admin.css"')
  .replace('<script src="/client.js" defer></script>', '')
  .replace('<body>', '<body><p>只读界面预览 · 不连接管理服务</p>')
  .replaceAll('<button', '<button disabled').replaceAll('<input', '<input disabled')
  .replace('<section id="room" hidden>', '<section id="room">')
  .replace('<h2 id="room-title"></h2>', '<h2 id="room-title">房间 A6K8P2</h2>')
  .replace('<p id="status"></p>', '<p id="status">第 3 局 · 已加入 86 人 · 已准备 60 人 · 等待开赛</p>')
  .replace('id="preview" title=', 'id="preview" src="/review?frame=1&amp;view=screen-ready" title=')
  .replace('比赛结算后自动记录，开始下一局仍可回看。', '第 2 局完整排名 · 共 86 人 · 相同距离并列排名')
  .replace('<option value="">暂无已结算比赛</option>', '<option value="2">第 2 局 · 86 人</option><option value="1">第 1 局 · 86 人</option>')
  .replace('<p id="history-time"></p>', '<p id="history-time">比赛时间：2026/11/17 19:30:00 — 19:30:40</p>')
  .replace('<table id="history-table" hidden>', '<table id="history-table">');
const names = ['小满', '追风的阿乐', '橘子汽水', '好运来', '小林同学', '一颗丸子', '阳光选手', '加油鸭'];
const rows = Array.from({length:86}, (_, i) => `<tr><td>${i+1}</td><td>${names[i] || '选手'+String(i+1).padStart(3,'0')}</td><td>${Math.max(0,396-i*6)}</td><td>${Math.max(0,198-i*3)}</td></tr>`).join('');
html = html.replace('<tbody id="history-body"></tbody>', `<tbody id="history-body">${rows}</tbody>`);
await writeFile('public/review-admin-dashboard.html', html);
await writeFile('public/review-admin.css', await readFile('admin/style.css'));
