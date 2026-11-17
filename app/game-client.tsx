"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Copy, Expand, Flag, LoaderCircle, Play, RotateCcw, Smartphone, Timer, Trophy, Users } from "lucide-react";
import { CHARACTERS, COUNTDOWN, READY_HEARTBEAT, scoreLimit, type GameState } from "@/lib/game-types";
import { ShakeDetector } from "@/lib/shake-detector";
type View = "home" | "screen" | "play" | "demo";
type Session = { id: string; playerToken: string };
const names = ["小满", "追风的阿乐", "橘子汽水", "好运来", "小林同学", "一颗丸子", "阳光选手", "加油鸭", "向前跑", "闪电小周", "元气满满", "快乐小陈", "星星", "大步向前", "小叶", "最佳拍档", "好运选手", "小太阳"];
const roleNames = ["元气选手", "追风选手", "冒险选手"];
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function api<T = unknown>(path: string, input?: unknown, auth?: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(path, { method: input === undefined ? "GET" : "POST", cache: "no-store", headers: { ...(input !== undefined ? { "Content-Type": "application/json" } : {}), ...(auth ? { Authorization: "Bearer " + auth } : {}) }, body: input === undefined ? undefined : JSON.stringify(input), signal: controller.signal });
    let d: { error?: string };
    try { d = await r.json() as { error?: string }; } catch { throw new Error("连接暂时不可用，请稍后重试"); }
    if (!r.ok) throw new ApiError(r.status, d?.error || "连接未成功，请重试"); return d as T;
  } catch (error) { if (controller.signal.aborted) throw new Error("网络连接超时，请重试"); throw error; }
  finally { clearTimeout(timeout); }
}
function storageCopies(key: string) {
  const copies: { value: string; revision: number }[] = [];
  for (const access of [() => localStorage, () => sessionStorage]) {
    try {
      const raw = access().getItem(key);
      if (raw === null) continue;
      let value;
      try { value = JSON.parse(raw); } catch {}
      if (value?.raceStorage === 1 && typeof value.value === "string" && Number.isSafeInteger(value.revision) && value.revision > 0) copies.push(value);
      else copies.push({ value: raw, revision: 0 }); // Existing credentials remain readable.
    } catch {}
  }
  return copies.sort((a, b) => b.revision - a.revision);
}
function stored(key: string) { return storageCopies(key)[0]?.value ?? null; }
function remember(key: string, value: string) {
  // One storage may still contain readable credentials after its writes fail.
  // Choose the newest successful copy on reload instead of a fixed preference.
  const revision = Math.max(Date.now(), (storageCopies(key)[0]?.revision || 0) + 1);
  const raw = JSON.stringify({ raceStorage: 1, revision, value });
  let ok = false;
  for (const access of [() => localStorage, () => sessionStorage]) { try { access().setItem(key, raw); ok = true; } catch {} }
  return ok;
}
function forget(key: string) { for (const access of [() => localStorage, () => sessionStorage]) { try { access().removeItem(key); } catch {} } }
function saved<T,>(key: string): T | null { try { return JSON.parse(stored(key) || "null"); } catch { return null; } }
function playerSession(code: string) { const value = saved<Partial<Session>>("player-" + code); return value && typeof value.id === "string" && value.id && typeof value.playerToken === "string" && value.playerToken ? value as Session : null; }
// A local timer expiring cannot confirm that the final score upload window
// has been observed by the server. Keep provisional results until a fresh poll.
function resultsPending(data: GameState, clock: number) {
  const settledAt = (data.endAt || 0) + 2200;
  return data.stage === "finished" && (clock < settledAt || data.serverNow < settledAt);
}
function Character({ choice = 0, pose = "idle", moving = false }: { choice?: number; pose?: string; moving?: boolean }) {
  const slug = CHARACTERS[choice % 3];
  return <span className={"character " + (moving ? "is-moving" : "")} aria-hidden="true"><img src={"/assets/" + slug + "-" + (moving ? "walk1" : pose) + ".png"} alt="" />{moving && <img className="alternate" src={"/assets/" + slug + "-walk2.png"} alt="" />}</span>;
}
function Logo() { return <span className="brand"><span>摇一摇运动会</span></span>; }
function Scene({ running = false, compact = false, choice }: { running?: boolean; compact?: boolean; choice?: number }) {
  return <div className={"sports-scene " + (compact ? "compact-scene" : "")} aria-label="卡通选手与田径跑道"><img className="scene-clouds" src="/assets/clouds1.png" alt="" /><img className="scene-hills" src="/assets/hills1.png" alt="" /><div className="scene-track" /><img className="scene-flag" src="/assets/finish-flag.png" alt="" />
    {choice === undefined ? <div className="scene-runners"><Character choice={2} moving={running} /><Character choice={1} moving={running} /><Character choice={0} moving={running} /></div> : <div className="single-runner"><Character choice={choice} moving={running} pose="cheer1" /></div>}
    {!compact && <span className="scene-ticket"><Timer size={18} />40 秒，全场一起出发</span>}</div>;
}
function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let alive = true; if (value) QRCode.toDataURL(value, { width: 360, margin: 2, errorCorrectionLevel: "M", color: { dark: "#142e30", light: "#ffffff" } }).then(v => { if (alive) setSrc(v); }).catch(() => {}); return () => { alive = false; }; }, [value]);
  return src ? <img className="qr" src={src} alt="微信扫码加入本场比赛" /> : <div className="qr qr-loading"><LoaderCircle className="spin" /></div>;
}
function Home() {
  const [code, setCode] = useState(""), [error, setError] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[A-Z2-9]{6}$/.test(code.trim().toUpperCase())) { setError("请输入大屏上的 6 位房间号"); return; }
    location.href = "/play/" + code.trim().toUpperCase();
  }
  return <div className="home"><header className="site-header"><Logo /></header>
    <main className="home-main"><div className="game-title"><h1>摇一摇赛跑</h1><p>多人同场 · 每局 40 秒</p></div>
    <section className="menu-stage"><div className="menu-runner runner-left"><Character choice={1} pose="cheer1" /></div><div className="menu-runner runner-right"><Character choice={0} pose="cheer1" /></div>
      <div className="entry-card"><h2 className="ribbon-title">手机参赛</h2>
      <form onSubmit={submit}><label htmlFor="entry-input">房间号</label><input id="entry-input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="输入大屏上的 6 位房间号" required autoComplete="off" /><button className="button primary full-button">加入比赛</button><p className="form-hint">也可以直接扫描大屏上的二维码加入。</p>{error && <p className="error" role="alert">{error}</p>}</form></div>
    </section></main><footer className="site-footer"><span>摇得越多，跑得越远</span></footer></div>;
}
export default function GameClient({ view = "home", code = "" }: { view?: View; code?: string }) {
  const [data, setData] = useState<GameState | null>(null), [error, setError] = useState(""), [connectionError, setConnectionError] = useState(""), [session, setSession] = useState<Session | null>(null), [initialized, setInitialized] = useState(false), [busy, setBusy] = useState(false), [clock, setClock] = useState(Date.now());
  const serverClock = useRef<{ server: number; at: number } | null>(null), refreshSequence = useRef(0), observedStage = useRef<GameState["stage"]>("lobby");
  const getNow = useCallback(() => { const anchor = serverClock.current; return anchor ? anchor.server + performance.now() - anchor.at : Date.now(); }, []);
  const [demoStart, setDemoStart] = useState<number | null>(null), [demoPhone, setDemoPhone] = useState(false), [demoRound, setDemoRound] = useState(1), [demoBoost, setDemoBoost] = useState(0);
  const isDemo = view === "demo", isPhone = view === "play" || (isDemo && demoPhone);
  useEffect(() => { if (view === "home") return; setSession(playerSession(code)); setInitialized(true); }, [code, view]);
  useEffect(() => { const t = setInterval(() => setClock(getNow()), 100); return () => clearInterval(t); }, [getNow]);
  const refresh = useCallback(async () => {
    if (!code || isDemo) return; const before = performance.now(), sequence = ++refreshSequence.current;
    try {
      const r = await api<GameState>("/api/rooms/" + code + (view === "play" && session ? "?player=" + session.id : ""), undefined, session?.playerToken);
      if (sequence !== refreshSequence.current) return;
      const receivedAt = performance.now(); serverClock.current = { server: r.serverNow + (receivedAt - before) / 2, at: receivedAt }; observedStage.current = r.stage; setClock(getNow()); setData(r); setConnectionError("");
    } catch (error) {
      if (sequence !== refreshSequence.current) return;
      if (view === "play" && session && error instanceof ApiError && error.status === 403) { forget("player-" + code); setSession(null); setData(null); setConnectionError(""); setError(error.message); return; }
      throw error;
    }
  }, [code, view, session, isDemo, getNow]);
  useEffect(() => {
    if (!initialized || view === "home" || isDemo) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { await refresh(); } catch (e) { if (!stopped) setConnectionError((e as Error).message); } if (!stopped) timer = setTimeout(poll, view === "play" ? observedStage.current === "lobby" || observedStage.current === "countdown" ? 400 : 1500 : 800); };
    poll(); return () => { stopped = true; ++refreshSequence.current; clearTimeout(timer); };
  }, [initialized, refresh, view, isDemo]);
  useEffect(() => {
    if (!isDemo) return;
    const elapsed = demoStart === null ? 0 : Math.min(40, Math.max(0, (clock - demoStart) / 1000));
    const players = names.map((nickname, i) => ({ id: "demo-" + i, nickname, character: i % 3, shakes: Math.floor(elapsed * (4.1 - i * 0.13) + (elapsed > 0 ? Math.sin(elapsed * 0.6 + i) * 1.5 + 2 : 0)) + (i === 0 ? demoBoost : 0), rank: 0, ready: true })).sort((a, b) => b.shakes - a.shakes);
    players.forEach((p, i) => { p.rank = i && players[i - 1].shakes === p.shakes ? players[i - 1].rank : i + 1; });
    setData({ code: "DEMO", title: "摇一摇运动会", round: demoRound, stage: demoStart === null ? "lobby" : clock < demoStart ? "countdown" : elapsed < 40 ? "running" : "finished", startAt: demoStart, endAt: demoStart === null ? null : demoStart + 40000, serverNow: clock, count: players.length, readyCount: players.length, players, me: players.find(p => p.id === "demo-0") });
  }, [isDemo, demoStart, demoRound, clock, demoBoost]);
  const d: GameState | null = data ? { ...data, stage: data.startAt && data.endAt ? clock < data.startAt ? "countdown" : clock < data.endAt ? "running" : "finished" : "lobby" } : null;
  async function control(action: "start" | "next") {
    setBusy(true); setError("");
    try { if (isDemo) { if (action === "start") setDemoStart(Date.now() + COUNTDOWN); else { setDemoStart(null); setDemoBoost(0); setDemoRound(v => v + 1); } } else { throw new Error("请使用独立管理后台操作比赛"); } }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (view === "home") return <Home />;
  const visibleError = connectionError || error;
  if (!d) return <div className="loading-page"><Logo />{visibleError ? <><h1>暂时无法进入比赛</h1><p className="error" role="alert">{visibleError}</p></> : <><LoaderCircle className="spin" size={30} /><p>正在连接运动场…</p></>}</div>;
  return <div className={isPhone ? "phone-shell" : "board-shell" + (isDemo ? " host-shell" : "")}>{isDemo && <div className="demo-banner"><span>效果演示 · 模拟选手与成绩</span><button onClick={() => setDemoPhone(v => !v)}><Smartphone size={14} />{demoPhone ? "看大屏效果" : "看手机效果"}</button></div>}
    {isPhone ? <Phone data={d} clock={clock} getNow={getNow} session={session} setSession={setSession} error={visibleError} setError={setError} isDemo={isDemo} onDemoShake={() => setDemoBoost(v => v + 1)} refresh={refresh} /> : <Board data={d} clock={clock} isHost={isDemo} isDemo={isDemo} hasToken={isDemo} busy={busy} control={control} error={visibleError} />}</div>;
}
export function Board({ data: d, clock, isHost, isDemo, hasToken, busy, control, error, preview = false }: { data: GameState; clock: number; isHost: boolean; isDemo: boolean; hasToken: boolean; busy: boolean; control: (a: "start" | "next") => void; error: string; preview?: boolean }) {
  const [origin, setOrigin] = useState(""), [page, setPage] = useState(0), [copied, setCopied] = useState(false), [notice, setNotice] = useState(""), [shortScreen, setShortScreen] = useState(false);
  const finished = d.stage === "finished", finalizing = resultsPending(d, clock);
  const pageSize = finished ? shortScreen ? 8 : 12 : 10, pages = Math.max(1, Math.ceil(d.count / pageSize));
  const seconds = d.stage === "lobby" ? 40 : d.stage === "countdown" ? Math.max(1, Math.ceil(((d.startAt || clock) - clock) / 1000)) : Math.max(0, Math.ceil(((d.endAt || clock) - clock) / 1000));
  const joinUrl = origin + "/play/" + d.code;
  useEffect(() => { setOrigin(location.origin); }, []);
  useEffect(() => { const media = window.matchMedia("(min-width:1100px) and (max-height:800px)"); const update = () => setShortScreen(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => { setPage(0); }, [d.stage, d.round, pageSize]);
  useEffect(() => { if (d.stage === "running" || d.stage === "countdown" || pages <= 1) return; const t = setInterval(() => setPage(v => (v + 1) % pages), 8000); return () => clearInterval(t); }, [d.stage, pages]);
  async function copy() { try { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setNotice("复制未成功，可直接复制地址：" + joinUrl); } }

  const currentPage = d.stage === "running" || d.stage === "countdown" ? 0 : page;
  const items = d.players.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  return <><header className="board-header"><Logo /><div className="event-name">{d.title}<span>第 {d.round} 场 · 摇一摇赛跑</span></div></header>
    <main className={"board-main " + (finished ? "results-main" : "")}><div className="board-title-row"><div><div className="eyebrow">SHAKE IT. MAKE IT.</div><h1>{finished ? "比赛结果" : d.stage === "lobby" ? "等待入场" : "比赛进行中"}</h1><p>{finished ? finalizing ? "正在汇总最后的成绩…" : "本场比赛已结束" : d.stage === "lobby" ? "扫描二维码加入比赛" : "按累计距离实时排名"}</p></div><div className={"countdown " + (seconds <= 10 && d.stage === "running" ? "last-seconds" : "")}><span>{finished ? "全场参与" : d.stage === "lobby" ? "每局时长" : d.stage === "countdown" ? "准备出发" : "距离结束"}</span><b>{finished ? d.count : seconds}<small>{finished ? "人" : "秒"}</small></b></div></div>
    {finished ? <section className="results-layout"><div className="podium-wrap"><div className="results-kicker"><Trophy size={20} />本场前三名</div><div className="podium">{[1, 0, 2].map(index => { const p = d.players[index]; return p ? <div className={"podium-person place-" + index} key={p.id}><span className="medal-label">{p.rank === 1 ? "冠军" : "第 " + p.rank + " 名"}</span><Character choice={p.character} pose="cheer1" /><b>{p.nickname}</b><span>{p.shakes * 2}<small> 米</small></span><div className="podium-step"><Trophy size={index === 0 ? 32 : 23} /><strong>{p.rank.toString().padStart(2, "0")}</strong></div></div> : null; })}</div><p className="tie-note">相同距离并列排名 · 每次有效摇动前进 2 米</p><Scene compact /></div><div className="finish-list"><div className="panel-heading"><h2>全部参赛者</h2><span>{d.count} 位参赛者</span></div><div className="participant-grid">{items.map(p => <div className="participant-tile" key={p.id}><span className="tile-rank">{p.rank.toString().padStart(2, "0")}</span><Character choice={p.character} pose="cheer1" /><div><b>{p.nickname}</b><small>{p.shakes * 2} 米 · {p.shakes} 次摇动</small></div></div>)}</div>{pages > 1 && <div className="pagination"><button className="icon-button" aria-label="上一页参赛者" onClick={() => setPage(v => (v - 1 + pages) % pages)}><ChevronLeft size={17} /></button><span>{page + 1} / {pages} · 8 秒自动翻页</span><button className="icon-button" aria-label="下一页参赛者" onClick={() => setPage(v => (v + 1) % pages)}><ChevronRight size={17} /></button></div>}</div></section>
      : <div className={"race-layout " + (d.stage !== "lobby" ? "live-layout" : "")}><section className="leaderboard"><div className="panel-heading"><h2><Trophy size={20} />实时排行榜</h2><span><Users size={15} />{d.stage === "lobby" ? "已加入 " + d.count + " · 已准备 " + (d.readyCount || 0) : d.count + " 人已加入"}</span></div><div className="leader-columns"><span>排名</span><span>参赛选手</span><span>{d.stage === "lobby" ? "准备状态" : "累计距离"}</span><span>{d.stage === "lobby" ? "" : "有效摇动"}</span></div>{!d.count ? <div className="empty-board"><div className="empty-runners"><Character choice={1} /><Character choice={0} /></div><h3>等待参赛者加入</h3><p>请扫描右侧二维码</p></div> : <div className="rank-list">{items.map(p => <div className={"rank-row " + (p.rank <= 3 ? "rank-top rank-" + p.rank : "")} key={p.id}><span className="rank-number">{d.stage === "lobby" ? "—" : p.rank.toString().padStart(2, "0")}</span><span className="rank-player"><Character choice={p.character} /><b>{p.nickname}</b>{d.stage === "lobby" && <small>已加入</small>}</span><strong>{d.stage === "lobby" ? <small className={p.ready ? "readiness-status is-ready" : "readiness-status"}>{p.ready ? "已准备" : "未准备"}</small> : <>{p.shakes * 2}<small>米</small></>}</strong><span className="shake-total">{d.stage !== "lobby" && <>{p.shakes}<small>次</small></>}</span></div>)}</div>}<div className="leader-foot"><span>{d.stage === "lobby" ? "选手正在集结，开赛前都可以加入" : "按累计距离排名 · 相同距离并列"}</span>{pages > 1 && <span>{d.stage === "running" || d.stage === "countdown" ? "前 10 名 / 共 " + d.count + " 人" : "第 " + (page + 1) + " / " + pages + " 页"}</span>}</div></section>
      {d.stage === "lobby" && <aside className="join-panel"><div className="join-panel-top"><span className="tiny-label">YOUR NEXT CHAMPION</span><h2>{d.stage === "lobby" ? "扫码参加" : "摇一摇赛跑"}</h2><p>{d.stage === "lobby" ? "微信扫一扫加入" : "手机持续摇动，名次随时刷新"}</p></div>{d.stage === "lobby" ? <><div className="qr-wrap">{preview ? <img className="qr" src="/assets/review-qr.png" alt="评审示例二维码，不能加入真实比赛" /> : isDemo ? <div className="demo-qr"><Smartphone size={44} /><b>扫码区域预览</b><span>创建比赛后生成入场码</span></div> : <Qr value={origin ? joinUrl : ""} />}</div><div className="room-code"><span>房间号</span><b>{isDemo && !preview ? "预览模式" : d.code}</b></div></> : <div className="race-cheer"><Character choice={d.players[0]?.character || 0} pose="cheer1" /><p>{d.stage === "countdown" ? "手机拿稳，准备摇起来！" : seconds <= 10 ? "最后冲刺，冠军等你！" : "名次还在变，好戏才开始。"}</p></div>}<div className="join-panel-bottom"><Scene compact /><span>摇得越多 · 跑得越远</span></div></aside>}</div>}
      {d.stage === "countdown" && <div className="start-overlay" aria-live="polite"><span>各就各位</span><b>{seconds}</b><span>准备摇起来！</span></div>}
      {isHost && (d.stage === "lobby" || finished) && <div className="host-bar"><div><span className="host-label"><Flag size={15} />主持人控制台</span><span className="host-subtitle">{d.stage === "lobby" ? "已准备 " + (d.readyCount || 0) + " / " + d.count + " 人，请确认后统一开赛" : finished ? "大家留在房间里，下一场继续一起玩" : "比赛计时中，所有设备统一结算"}</span></div>{hasToken ? <div className="host-actions">{!isDemo && <><button className="button secondary" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "已复制" : "手机入场链接"}</button><a className="button secondary" href={"/screen/" + d.code} target="_blank" rel="noreferrer">打开纯大屏<Expand size={17} /></a></>}{d.stage === "lobby" ? <button className="button primary" disabled={busy || !d.count} onClick={() => control("start")}>{busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} fill="currentColor" />}开始比赛 · 40 秒</button> : <button className="button primary" disabled={busy || finalizing} onClick={() => control("next")}><RotateCcw size={17} />再来一场</button>}</div> : <p className="error">请在创建比赛的设备中打开主持人页面。</p>}</div>}
      {(error || notice) && <p className="connection-error" role="alert">{error || notice}</p>}</main><footer className="board-footer"><span>一起摇 · 40 秒运动会</span><span>{isDemo ? "演示数据" : "房间 " + d.code} · 第 {d.round} 场</span><span>正式比赛 40 秒</span></footer></>;
}
type MotionConstructor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
export function Phone({ data: d, clock, getNow, session, setSession, error, setError, isDemo, onDemoShake, refresh, preview = false }: { data: GameState; clock: number; getNow: () => number; session: Session | null; setSession: (s: Session) => void; error: string; setError: (s: string) => void; isDemo: boolean; onDemoShake: () => void; refresh: () => Promise<void>; preview?: boolean }) {
  const [nickname, setNickname] = useState(preview ? "小满" : ""), [choice, setChoice] = useState(0), [busy, setBusy] = useState(false), [ready, setReady] = useState(preview && d.stage !== "lobby"), [motionError, setMotionError] = useState(""), [tests, setTests] = useState(0), [count, setCount] = useState(0), [syncError, setSyncError] = useState(""), [signal, setSignal] = useState(preview), [readinessError, setReadinessError] = useState("");
  const local = useRef(0), sent = useRef(-1), posting = useRef(false), lastPost = useRef(0), roundRef = useRef(d.round), scoreOwner = useRef(d.code + ":" + (session?.id || "demo") + ":" + d.round), latest = useRef({ d, session, getNow, ready });
  latest.current = { d, session, getNow, ready };
  const readinessRefresh = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (isDemo || preview || !session) return;
    let active = true, sending = false, queued = false;
    const send = async () => {
      if (!active) return;
      if (sending) { queued = true; return; }
      const { d, session: player, ready } = latest.current;
      if (!player || d.stage !== "lobby") return;
      sending = true; queued = false;
      try {
        await api("/api/rooms/" + d.code + "/ready", { id: player.id, round: d.round, ready: ready && !document.hidden }, player.playerToken, 1800);
        if (active && latest.current.d.round === d.round) setReadinessError("");
      } catch { if (active && latest.current.d.round === d.round) setReadinessError("准备状态尚未同步，正在重试，请保持页面打开。"); }
      finally { sending = false; if (active && queued) void send(); }
    };
    const notify = () => { void send(); };
    readinessRefresh.current = notify;
    document.addEventListener?.("visibilitychange", notify);
    const timer = setInterval(notify, READY_HEARTBEAT);
    notify();
    return () => { active = false; readinessRefresh.current = null; clearInterval(timer); document.removeEventListener?.("visibilitychange", notify); };
  }, [d.code, session, isDemo, preview]);
  useEffect(() => { readinessRefresh.current?.(); }, [ready, d.round, d.stage]);
  useEffect(() => { const owner = d.code + ":" + (session?.id || "demo") + ":" + d.round; if (scoreOwner.current !== owner) { scoreOwner.current = owner; roundRef.current = d.round; local.current = 0; setCount(0); sent.current = -1; lastPost.current = 0; setTests(0); setSyncError(""); } }, [d.code, d.round, session?.id]);
  useEffect(() => {
    if (isDemo || preview || !session) return;
    const key = "pending-score-" + d.code + "-" + session.id;
    try {
      const checkpoint = JSON.parse(sessionStorage.getItem(key) || "null");
      if (checkpoint?.round === d.round && checkpoint.startAt === d.startAt && d.startAt && d.endAt && getNow() <= d.endAt + 1800 && Number.isSafeInteger(checkpoint.shakes) && checkpoint.shakes >= 0 && checkpoint.shakes <= scoreLimit(d.startAt, getNow())) {
        local.current = Math.max(local.current, checkpoint.shakes); setCount(local.current);
      } else sessionStorage.removeItem(key);
    } catch {}
  }, [d.code, d.round, d.startAt, d.endAt, session, isDemo, preview, getNow]);
  useEffect(() => { if (!isDemo && d.me && d.me.shakes > local.current) { local.current = d.me.shakes; setCount(d.me.shakes); } }, [d.me, isDemo]);
  const shake = useCallback(() => { const { d, session, getNow } = latest.current, t = getNow(); if (document.hidden) return; if (d.startAt && d.endAt && t >= d.startAt && t < d.endAt) { if (local.current >= scoreLimit(d.startAt, t)) return; local.current++; setCount(local.current); if (session) { try { sessionStorage.setItem("pending-score-" + d.code + "-" + session.id, JSON.stringify({ round: d.round, startAt: d.startAt, shakes: local.current })); } catch {} } navigator.vibrate?.(18); } else if (d.stage === "lobby") setTests(v => v + 1); }, []);
  useEffect(() => {
    if (!ready || isDemo || preview) return;
    const detector = new ShakeDetector();
    const listener = (e: DeviceMotionEvent) => {
      const result = detector.feed(e, performance.now());
      if (result.signal) setSignal(true);
      if (result.shake) shake();
    };
    window.addEventListener("devicemotion", listener); return () => window.removeEventListener("devicemotion", listener);
  }, [ready, isDemo, preview, shake]);
  useEffect(() => {
    if (isDemo || preview || !session) return; let active = true;
    const send = async () => {
      const { d, session: s, getNow } = latest.current, t = getNow();
      if (!s || !d.startAt || !d.endAt || t < d.startAt || t > d.endAt + 1800 || posting.current || sent.current >= local.current || (t < d.endAt - 1500 && t - lastPost.current < 600)) return;
      const n = local.current, r = d.round, owner = scoreOwner.current; posting.current = true; lastPost.current = t;
      try { const result = await api<{ accepted: boolean; shakes: number }>("/api/rooms/" + d.code + "/score", { id: s.id, round: r, shakes: n }, s.playerToken, 1800); if (active && scoreOwner.current === owner && result.accepted && roundRef.current === r) { sent.current = Math.max(sent.current, result.shakes); setSyncError(""); } }
      catch { if (active && scoreOwner.current === owner) setSyncError("成绩同步中，保持页面打开…"); } finally { posting.current = false; }
    };
    const t = setInterval(send, 220); return () => { active = false; clearInterval(t); };
  }, [session, isDemo, preview]);
  async function enable() {
    setMotionError("");
    if (preview) { setReady(true); setSignal(true); return; }
    try {
      if (!window.isSecureContext) throw new Error("摇一摇需要 HTTPS，请使用现场二维码中的完整链接。");
      const Motion = window.DeviceMotionEvent as MotionConstructor | undefined;
      if (!Motion) throw new Error("当前浏览器不支持摇一摇，请在手机浏览器中打开。");
      if (Motion.requestPermission && await Motion.requestPermission() !== "granted") throw new Error("需要允许访问运动传感器，才能使用摇一摇。");
      setReady(true); setSignal(false);
      try { const n = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<unknown> } }; await n.wakeLock?.request("screen"); } catch {}
    } catch (e) { setMotionError((e as Error).message); }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    if (preview) { setSession({ id: "review-0", playerToken: "preview-only" }); setBusy(false); return; }
    try { const r = await api<{ id: string; playerToken: string }>("/api/rooms/" + d.code + "/join", { nickname, character: choice }); const s = { id: r.id, playerToken: r.playerToken }; const kept = remember("player-" + d.code, JSON.stringify(s)); setSession(s); if (!kept) setError("浏览器无法保存参赛凭证，本次比赛请保持页面打开，避免刷新。"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const joined = !!session || isDemo, running = d.stage === "running", finished = d.stage === "finished";
  const seconds = d.stage === "countdown" ? Math.max(1, Math.ceil(((d.startAt || clock) - clock) / 1000)) : Math.max(0, Math.ceil(((d.endAt || clock) - clock) / 1000));
  const finalizing = resultsPending(d, clock);
  const preparationLabel = ready ? preview || isDemo || d.me?.ready ? "准备完成" : "准备同步中" : "参赛准备";
  const own = isDemo ? d.me?.shakes || 0 : finished && !finalizing ? d.me?.shakes || 0 : Math.max(count, d.me?.shakes || 0);
  return <div className="phone-page"><header className="phone-header"><Logo /><span>第 {d.round} 场</span></header><main><div className="phone-event"><span>40 秒现场运动会</span><h1>{d.title}</h1></div>
    {!joined ? <><form className="join-form" onSubmit={join}><h2>加入比赛</h2><label htmlFor="nickname">你的参赛昵称</label><input id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={12} placeholder="输入昵称" required autoComplete="nickname" /><fieldset><legend>选择角色</legend><div className="character-choices">{CHARACTERS.map((_, i) => <button type="button" aria-pressed={choice === i} key={i} className={choice === i ? "picked" : ""} onClick={() => setChoice(i)}><Character choice={i} /><span>{roleNames[i]}</span>{choice === i && <Check size={14} />}</button>)}</div></fieldset><button className="button primary full-button" disabled={busy || d.stage !== "lobby"}>{busy ? <LoaderCircle className="spin" size={18} /> : <>加入运动会<ArrowRight size={18} /></>}</button><p className="form-hint">{d.stage === "lobby" ? d.count + " 位选手已加入，就差你啦！" : "本局已经开始，下一场开放后可加入。"}</p></form></>
      : finished ? <section className="phone-result"><div className="phone-ribbon"><Trophy size={22} />比赛结束</div><Character choice={d.me?.character || 0} pose="cheer1" /><h2>{d.me?.nickname || nickname || "元气选手"}</h2><span className="result-caption">{finalizing ? "正在汇总成绩" : "你的最终成绩"}</span><div className="phone-result-stats"><div><b>{own * 2}<small>米</small></b><span>累计距离</span></div><div><b>{d.me?.rank || "—"}<small>名</small></b><span>全场排名</span></div></div><p>{own} 次有效摇动 · 共 {d.count} 人参与</p>{finalizing && syncError && <p className="sensor-hint" role="status">{syncError}</p>}{!finalizing && count > (d.me?.shakes || 0) && <p className="error" role="status">部分摇动未及时同步，最终成绩以服务器记录为准。</p>}<div className="waiting-next"><RotateCcw size={17} />等待主持人开启下一场</div></section>
      : <section className={"phone-race " + (running ? "phone-running" : "")}><div className="phone-state-label"><span className={running ? "live-dot" : ""} />{running ? seconds <= 10 ? "最后冲刺，加把劲！" : "比赛进行中" : d.stage === "countdown" ? "准备开始" : ready ? preparationLabel + " · 等待主持人开赛" : "已加入 · 请先开启摇一摇"}</div><div className="phone-count">{d.stage === "lobby" ? <><b data-preparation>{preparationLabel}</b><small>{!ready ? "开启摇一摇后，等待统一开赛" : "等待主持人开赛"}</small></> : <><b>{seconds.toString().padStart(2, "0")}<span>秒</span></b><small>{d.stage === "countdown" ? "倒数结束，一起出发" : "剩余时间"}</small></>}</div><Scene compact choice={d.me?.character ?? choice} running={running && (ready || isDemo)} /><div className="phone-live-stats"><div><strong>{own * 2}<small>米</small></strong><span>已跑距离</span></div><div><strong>{d.stage === "lobby" ? "—" : d.me?.rank || "—"}<small>名</small></strong><span>当前排名</span></div></div>
        {isDemo ? <button className="button primary full-button" disabled={!running} onClick={() => { shake(); onDemoShake(); }}>点击模拟摇一摇</button> : ready ? <div className="motion-ready"><Check size={18} /><b>{d.stage === "lobby" ? "已准备，等待主持人开赛" : d.stage === "countdown" ? "手机拿稳，准备出发" : "持续摇动手机，加油！"}</b><span>{d.stage === "lobby" ? "倒计时结束后开始计分" : "已摇动 " + count + " 次"}</span></div> : <button className="button primary full-button" onClick={enable}><Smartphone size={19} />开启摇一摇</button>}
        {ready && !signal && !isDemo && <p className="sensor-hint">请保持页面在前台；若开赛后摇动无反应，可点微信右上角在浏览器中打开。</p>}{d.stage === "lobby" && readinessError && <p className="sensor-hint" role="status">{readinessError}</p>}{motionError && <div className="error" role="alert">{motionError}<button className="text-link" onClick={enable}>重新开启</button></div>}{syncError && <p className="sensor-hint" role="status">{syncError}</p>}{d.stage === "lobby" && <p className="phone-hint">每次有效摇动前进 2 米，40 秒结束后结算</p>}</section>}
      {error && <div className="error phone-error" role="alert">{error}<button className="text-link" onClick={() => refresh().catch(() => {})}>重新连接</button></div>}</main><footer className="phone-footer">房间 {d.code} · 请握稳手机，保持页面在前台</footer></div>;
}
