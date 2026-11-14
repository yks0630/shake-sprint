"use client";
import { useCallback, useEffect, useState } from 'react';
import { Board, Phone } from '@/app/game-client';
import { COUNTDOWN, DURATION, type GameState, type Runner } from '@/lib/game-types';
import styles from './review.module.css';

const pages = [
  ['phone-ready', '手机·准备'], ['phone-race', '手机·比赛'], ['phone-result', '手机·结算'],
  ['screen-ready', '大屏·准备'], ['screen-race', '大屏·比赛'], ['screen-result', '大屏·结算'],
] as const;
type ReviewView = typeof pages[number][0];
const names = ['小满', '追风的阿乐', '橘子汽水', '好运来', '小林同学', '一颗丸子', '阳光选手', '加油鸭', '向前跑', '闪电小周', '元气满满', '快乐小陈'];
const participant = { id: 'review-0', playerToken: 'preview-only' };
const staticBase = 1_800_000_000_000;

function fixture(view: ReviewView, epoch: number, now: number, frozenCountdown = false): { data: GameState; clock: number } {
  const phase = view.endsWith('ready') ? 'lobby' : view.endsWith('result') ? 'finished' : 'running';
  const startAt = frozenCountdown ? staticBase + COUNTDOWN : epoch ? epoch + COUNTDOWN : phase === 'lobby' ? null : staticBase;
  const endAt = startAt === null ? null : startAt + DURATION;
  const clock = frozenCountdown ? staticBase : epoch ? now : phase === 'lobby' ? staticBase : phase === 'finished' ? staticBase + DURATION + 3000 : staticBase + 22000;
  const stage = frozenCountdown ? 'countdown' : epoch && startAt && endAt ? clock < startAt ? 'countdown' : clock < endAt ? 'running' : 'finished' : phase;
  const seconds = startAt === null ? 0 : Math.min(40, Math.max(0, (clock - startAt) / 1000));
  const players: Runner[] = Array.from({ length: 86 }, (_, i) => ({ id: 'review-' + i, nickname: names[i] || '选手' + String(i + 1).padStart(3, '0'), character: i % 3, shakes: Math.floor(seconds * Math.max(.8, 4.95 - i * .11)), rank: 0, ready: i < 60 }));
  players.sort((a, b) => b.shakes - a.shakes);
  players.forEach((p, i) => { p.rank = i && players[i - 1].shakes === p.shakes ? players[i - 1].rank : i + 1; });
  return { clock, data: { code: 'A6K8P2', title: '摇一摇运动会', round: 1, stage, startAt, endAt, serverNow: clock, count: players.length, readyCount: players.filter(p => p.ready).length, players, me: players.find(p => p.id === participant.id) } };
}

export default function ReviewClient() {
  const [view, setView] = useState<ReviewView>('phone-ready');
  const [frameOnly, setFrameOnly] = useState(false), [epoch, setEpoch] = useState(0), [clock, setClock] = useState(Date.now()), [joined, setJoined] = useState(true), [initialized, setInitialized] = useState(false), [frozenCountdown, setFrozenCountdown] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(location.search), value = query.get('view');
    if (pages.some(p => p[0] === value)) setView(value as ReviewView);
    setFrameOnly(query.get('frame') === '1'); setJoined(query.get('entry') !== '1');
    setFrozenCountdown(query.get('countdown') === '1');
    const time = Number(query.get('start'));
    if (Number.isFinite(time) && time > 0 && Math.abs(Date.now() - time) < 600000) setEpoch(time);
    setInitialized(true);
  }, []);
  useEffect(() => { if (!epoch) return; const timer = setInterval(() => setClock(Date.now()), 100); return () => clearInterval(timer); }, [epoch]);
  const getNow = useCallback(() => Date.now(), []);
  function choose(value: ReviewView) { setView(value); setEpoch(0); setJoined(true); history.replaceState(null, '', '/review?view=' + value); }
  const isPhone = view.startsWith('phone'), title = pages.find(p => p[0] === view)![1];
  if (!initialized) return <p className={styles.loading}>正在打开六页界面…</p>;
  if (!frameOnly) {
    const source = '/review?frame=1&view=' + view + (joined ? '' : '&entry=1') + (epoch ? '&start=' + epoch : '');
    return <div className={styles.review}>
      <header className={styles.toolbar}><div className={styles.topline}><strong>六页界面评审</strong><span>示例数据 · 86 人 · 二维码不用于真实入场</span></div>
        <nav className={styles.tabs} aria-label="切换手机和大屏的六个页面">{pages.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => choose(key)}>{label}</button>)}</nav>
        <div className={styles.actions}>{view === 'phone-ready' && <button type="button" onClick={() => setJoined(v => !v)}>{joined ? '查看昵称入场页' : '查看已加入状态'}</button>}<button type="button" onClick={() => { setView(isPhone ? 'phone-race' : 'screen-race'); setEpoch(Date.now()); }}>演示 3 秒开赛</button><span>{title}</span></div>
      </header>
      <main className={isPhone ? styles.phoneStage : styles.screenStage}><iframe key={source} className={isPhone ? styles.phoneFrame : styles.screenFrame} title={title} src={source} /></main>
    </div>;
  }
  const state = fixture(view, epoch, clock, frozenCountdown);
  return <div data-review-scene={view} className={(isPhone ? 'phone-shell ' : 'board-shell host-shell ')}>
    {isPhone ? <Phone key={view} preview data={state.data} clock={state.clock} getNow={getNow} session={joined ? participant : null} setSession={() => setJoined(true)} error="" setError={() => {}} isDemo={false} onDemoShake={() => {}} refresh={async () => {}} />
      : <Board preview data={state.data} clock={state.clock} isHost={!isPhone} isDemo hasToken busy={false} error="" control={action => { setEpoch(action === 'start' ? Date.now() : 0); if (action === 'next') setView('screen-ready'); }} />}
  </div>;
}
