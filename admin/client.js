const $ = id => document.getElementById(id);
let publicOrigin = '', code = '', busy = false;
const message = text => { $('message').textContent = text; };
async function api(path, input) {
  const r = await fetch(path, { method: input === undefined ? 'GET' : 'POST', headers: input === undefined ? {} : { 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(10000) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
async function initialize() {
  const data = await api('/config'); publicOrigin = data.publicOrigin;
  try { const last = sessionStorage.getItem('admin-room'); if (last) open(last); } catch {}
}
function open(value) {
  value = value.trim().toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(value)) throw new Error('请输入 6 位房间号');
  historySequence++; historyLoadedKey = ''; $('history-round').replaceChildren(); $('history-body').replaceChildren(); $('history-table').hidden = true; $('history-time').textContent = '';
  code = value; try { sessionStorage.setItem('admin-room', code); } catch {}
  $('room').hidden = false; $('room-title').textContent = '房间 ' + code;
  $('screen').href = publicOrigin + '/screen/' + code; $('play').href = publicOrigin + '/play/' + code;
  $('preview').src = $('screen').href; message(''); refresh(); refreshHistory();
}
async function refresh() {
  if (!code) return;
  const current = code; $('start').disabled = true; $('next').disabled = true;
  try {
    const response = await fetch('/rooms/' + current, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error();
    const d = await response.json(); if (current !== code) return;
    $('status').textContent = `第 ${d.round} 局 · 已加入 ${d.count} 人 · 已准备 ${d.readyCount} 人 · ${d.stage}`;
    $('start').disabled = busy || d.stage !== 'lobby' || !d.count;
    $('next').disabled = busy || d.stage !== 'finished' || d.serverNow < d.endAt + 2200;
    const settled = d.stage === 'finished' && d.serverNow >= d.endAt + 2200;
    const historyKey = current + ':' + d.round;
    if (settled && historyLoadedKey !== historyKey) {
      historyLoadedKey = historyKey;
      refreshHistory().then(ok => { if (!ok && code === current) historyLoadedKey = ''; });
    }
  } catch { if (current === code) { $('status').textContent = '请查看下方大屏状态'; $('start').disabled = true; $('next').disabled = true; } }
}
async function run(fn) {
  if (busy) return; busy = true; message(''); document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await fn(); } catch (e) { message(e.message || '连接失败，请重试'); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); refresh(); }
}
$('create').onsubmit = e => { e.preventDefault(); run(async () => open((await api('/create', { title: e.target.title.value })).code)); };
$('open').onsubmit = e => { e.preventDefault(); run(async () => open(e.target.code.value)); };
for (const name of ['start', 'next']) $(name).onclick = () => run(async () => { await api('/' + name, { code }); message(name === 'start' ? '比赛已启动，手机和大屏同步倒计时' : '已进入下一局'); });
setInterval(refresh, 2000);


let historySequence = 0, historyLoadedKey = '';
async function refreshHistory() {
  if (!code) return;
  const current = code, sequence = ++historySequence;
  const round = $('history-round').value;
  $('history-status').textContent = '正在读取排名记录…';
  try {
    const d = await api('/rooms/' + current + '/history' + (round ? '?round=' + round : ''));
    if (sequence !== historySequence || current !== code) return;
    $('history-round').replaceChildren();
    for (const r of d.rounds) {
      const option = document.createElement('option'); option.value = String(r.round);
      option.textContent = `第 ${r.round} 局 · ${r.count} 人`; $('history-round').append(option);
    }
    if (d.selectedRound !== null) $('history-round').value = String(d.selectedRound);
    else { const option = document.createElement('option'); option.value = ''; option.textContent = '暂无已结算比赛'; $('history-round').append(option); }
    const selected = d.rounds.find(r => r.round === d.selectedRound);
    $('history-time').textContent = selected ? '比赛时间：' + new Date(selected.startAt).toLocaleString() + ' — ' + new Date(selected.endAt).toLocaleTimeString() : '';
    $('history-body').replaceChildren();
    for (const p of d.players) {
      const tr = document.createElement('tr');
      for (const value of [p.rank, p.nickname, p.shakes * 2, p.shakes]) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }
      $('history-body').append(tr);
    }
    $('history-table').hidden = !selected;
    $('history-status').textContent = selected ? `第 ${d.selectedRound} 局完整排名 · 共 ${d.players.length} 人 · 相同距离并列排名` : '暂无已结算比赛，结束并汇总成绩后自动显示。';
    return true;
  } catch (e) { if (sequence === historySequence && current === code) $('history-status').textContent = '记录读取失败：' + e.message + '。点击刷新记录重试。'; }
  return false;
}
$('history-round').onchange = () => refreshHistory();
$('history-refresh').onclick = () => refreshHistory();

initialize().catch(e => message(e.message));
