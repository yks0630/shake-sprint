const $ = id => document.getElementById(id);
let publicOrigin = '', code = '', busy = false;
const message = text => { $('message').textContent = text; };
async function api(path, input) {
  const r = await fetch(path, { method: input === undefined ? 'GET' : 'POST', headers: input === undefined ? {} : { 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(10000) });
  const data = await r.json();
  if (!r.ok) { if (r.status === 401) showLogin(); throw new Error(data.error); }
  return data;
}
function showLogin() { $('login').hidden = false; $('dashboard').hidden = true; code = ''; $('preview').removeAttribute('src'); }
async function session() {
  const data = await api('/session'); publicOrigin = data.publicOrigin;
  $('login').hidden = data.authenticated; $('dashboard').hidden = !data.authenticated;
  if (data.authenticated) { try { const last = sessionStorage.getItem('admin-room'); if (last) open(last); } catch {} }
}
function open(value) {
  value = value.trim().toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(value)) throw new Error('请输入 6 位房间号');
  code = value; try { sessionStorage.setItem('admin-room', code); } catch {}
  $('room').hidden = false; $('room-title').textContent = '房间 ' + code;
  $('screen').href = publicOrigin + '/screen/' + code; $('play').href = publicOrigin + '/play/' + code;
  $('preview').src = $('screen').href; message(''); refresh();
}
async function refresh() {
  if (!code) return;
  const current = code; $('start').disabled = true; $('next').disabled = true;
  try {
    const response = await fetch('/rooms/' + current, { signal: AbortSignal.timeout(8000) });
    if (response.status === 401) { showLogin(); return; }
    if (!response.ok) throw new Error();
    const d = await response.json(); if (current !== code) return;
    $('status').textContent = `第 ${d.round} 局 · 已加入 ${d.count} 人 · 已准备 ${d.readyCount} 人 · ${d.stage}`;
    $('start').disabled = busy || d.stage !== 'lobby' || !d.count;
    $('next').disabled = busy || d.stage !== 'finished' || d.serverNow < d.endAt + 2200;
  } catch { if (current === code) { $('status').textContent = '请查看下方大屏状态'; $('start').disabled = true; $('next').disabled = true; } }
}
async function run(fn) {
  if (busy) return; busy = true; message(''); document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await fn(); } catch (e) { message(e.message || '连接失败，请重试'); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); refresh(); }
}
$('login').onsubmit = e => { e.preventDefault(); run(async () => { await api('/login', { password: e.target.password.value }); e.target.reset(); await session(); }); };
$('create').onsubmit = e => { e.preventDefault(); run(async () => open((await api('/create', { title: e.target.title.value })).code)); };
$('open').onsubmit = e => { e.preventDefault(); run(async () => open(e.target.code.value)); };
$('logout').onclick = () => run(async () => { await api('/logout', {}); showLogin(); });
for (const name of ['start', 'next']) $(name).onclick = () => run(async () => { await api('/' + name, { code }); message(name === 'start' ? '比赛已启动，手机和大屏同步倒计时' : '已进入下一局'); });
setInterval(refresh, 2000);
session().catch(e => message(e.message));
