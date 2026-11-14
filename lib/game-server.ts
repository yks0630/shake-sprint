import { env } from "cloudflare:workers";
import { COUNTDOWN, DURATION, READY_TTL, scoreLimit, type Stage } from "./game-types";

export type GameRow = { code: string; title: string; host_hash: string; round: number; status: string; start_at: number | null; end_at: number | null; created_at: number };
export class GameError extends Error { constructor(public status: number, message: string) { super(message); } }
export function db() { if (!env.DB) throw new Error("DB binding missing"); return env.DB; }
export async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
export function token() { return crypto.randomUUID() + crypto.randomUUID(); }
export function stage(game: GameRow, now = Date.now()): Stage {
  if (game.status === "lobby" || !game.start_at || !game.end_at) return "lobby";
  if (now < game.start_at) return "countdown";
  return now < game.end_at ? "running" : "finished";
}
export async function gameFor(code: string) {
  const game = await db().prepare("SELECT * FROM games WHERE code = ?").bind(code.toUpperCase()).first<GameRow>();
  if (!game) throw new GameError(404, "没有找到这场比赛，请检查房间号");
  return game;
}
export async function body(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) throw new GameError(403, "请求来源无效");
  if (!request.headers.get("content-type")?.includes("application/json")) throw new GameError(400, "请使用 JSON 请求");
  const raw = await request.text();
  if (raw.length > 4096) throw new GameError(413, "内容过长");
  try { const value = JSON.parse(raw); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object"); return value as Record<string, unknown>; } catch { throw new GameError(400, "请求内容无效"); }
}
export function bearer(request: Request) { return request.headers.get("authorization")?.replace(/^Bearer /, "") || ""; }
export async function host(request: Request, game: GameRow) {
  if (await hash(bearer(request)) !== game.host_hash) throw new GameError(403, "需要主持人权限，请使用创建比赛的设备");
}
export async function participant(request: Request, game: GameRow, id: unknown) {
  if (typeof id !== "string") throw new GameError(400, "选手信息无效");
  const player = await db().prepare("SELECT id FROM players WHERE id = ? AND room = ? AND token_hash = ?").bind(id, game.code, await hash(bearer(request))).first<{ id: string }>();
  if (!player) throw new GameError(403, "参赛凭证已失效，请重新加入");
  return player;
}
export async function snapshot(code: string, request: Request) {
  const game = await gameFor(code); const now = Date.now();
  const id = new URL(request.url).searchParams.get("player");
  const base = { code: game.code, title: game.title, round: game.round, stage: stage(game, now), startAt: game.start_at, endAt: game.end_at, serverNow: now };
  const readyExpr = "CASE WHEN r.round = ? AND r.ready = 1 AND r.updated_at > ? THEN 1 ELSE 0 END";
  const select = `SELECT p.id, p.nickname, p.character, COALESCE(s.shakes, 0) AS shakes,
    RANK() OVER (ORDER BY COALESCE(s.shakes, 0) DESC) AS rank, ${readyExpr} AS ready
    FROM players p LEFT JOIN scores s ON s.player_id = p.id AND s.round = ?
    LEFT JOIN player_readiness r ON r.player_id = p.id WHERE p.room = ?`;
  const args = [game.round, now - READY_TTL, game.round, game.code];
  if (id) {
    await participant(request, game, id);
    const me = await db().prepare(`WITH ranking AS (${select})
      SELECT *, (SELECT COUNT(*) FROM ranking) AS count,
      (SELECT COALESCE(SUM(ready), 0) FROM ranking) AS readyCount FROM ranking WHERE id = ?`).bind(...args, id).first();
    return { ...base, count: me?.count || 0, readyCount: me?.readyCount || 0, players: [], me: me ? { ...me, ready: !!me.ready } : null };
  }
  const { results } = await db().prepare(select + " ORDER BY shakes DESC, p.joined_at, p.id").bind(...args).all<{ ready: number }>();
  return { ...base, count: results.length, readyCount: results.filter(p => p.ready).length, players: results.map(p => ({ ...p, ready: !!p.ready })) };
}
export async function action(request: Request, code: string, name: string) {
  const input = await body(request);
  if (name === "create") {
    const title = typeof input.title === "string" ? input.title.trim().slice(0, 30) : "一起摇 · 现场运动会";
    const hostToken = token(); const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const room = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join("");
    await db().prepare("INSERT INTO games (code, title, host_hash, round, status, created_at) VALUES (?, ?, ?, 1, 'lobby', ?)").bind(room, title || "一起摇 · 现场运动会", await hash(hostToken), Date.now()).run();
    return { code: room, hostToken };
  }
  const game = await gameFor(code);
  if (name === "join") {
    if (stage(game) !== "lobby") throw new GameError(409, "本局已经开始，下一局开放后再加入");
    const nickname = typeof input.nickname === "string" ? input.nickname.trim() : "";
    if (!nickname || Array.from(nickname).length > 12) throw new GameError(400, "请输入 1–12 个字的昵称");
    const character = typeof input.character === "number" && Number.isInteger(input.character) && input.character >= 0 && input.character < 3 ? input.character : 0;
    const id = crypto.randomUUID(); const playerToken = token();
    const result = await db().prepare(`INSERT INTO players (id, room, nickname, character, token_hash, joined_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM games WHERE code = ? AND status = 'lobby' AND round = ?)`)
      .bind(id, game.code, nickname, character, await hash(playerToken), Date.now(), game.code, game.round).run();
    if (!result.meta.changes) throw new GameError(409, "比赛刚刚开始，请等下一局");
    return { id, playerToken };
  }
  if (name === "ready") {
    const p = await participant(request, game, input.id);
    if (input.round !== game.round) throw new GameError(409, "已进入新一局");
    if (typeof input.ready !== "boolean") throw new GameError(400, "准备状态无效");
    if (stage(game) !== "lobby") return { accepted: false };
    const now = Date.now();
    const result = await db().prepare(`INSERT INTO player_readiness (player_id, round, ready, updated_at)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM games WHERE code = ? AND round = ? AND status = 'lobby')
      ON CONFLICT (player_id) DO UPDATE SET round = excluded.round, ready = excluded.ready, updated_at = excluded.updated_at`)
      .bind(p.id, game.round, input.ready ? 1 : 0, now, game.code, game.round).run();
    return { accepted: !!result.meta.changes };
  }
  if (name === "score") {
    const p = await participant(request, game, input.id); const now = Date.now();
    if (input.round !== game.round) throw new GameError(409, "已进入新一局");
    if (!game.start_at || !game.end_at || now < game.start_at || now > game.end_at + 2000) return { accepted: false, stage: stage(game, now) };
    const count = input.shakes;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new GameError(400, "成绩无效");
    const bounded = Math.min(count, scoreLimit(game.start_at, now));
    const result = await db().prepare(`INSERT INTO scores (player_id, round, shakes, updated_at)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM games WHERE code = ? AND round = ? AND status = 'running' AND start_at <= ? AND end_at + 2000 >= ?)
      ON CONFLICT (player_id, round) DO UPDATE SET shakes = MAX(scores.shakes, excluded.shakes), updated_at = excluded.updated_at`)
      .bind(p.id, game.round, bounded, now, game.code, game.round, now, now).run();
    if (!result.meta.changes) throw new GameError(409, "已进入新一局，本局成绩不再接收");
    return { accepted: true, shakes: bounded };
  }
  await host(request, game);
  if (name === "start") {
    if (stage(game) !== "lobby") throw new GameError(409, "本局已开始");
    const count = await db().prepare("SELECT COUNT(*) AS n FROM players WHERE room = ?").bind(game.code).first<{ n: number }>();
    if (!count?.n) throw new GameError(409, "至少有一位选手加入后才能开赛");
    const start = Date.now() + COUNTDOWN;
    const result = await db().prepare("UPDATE games SET status = 'running', start_at = ?, end_at = ? WHERE code = ? AND status = 'lobby' AND round = ?").bind(start, start + DURATION, game.code, game.round).run();
    if (!result.meta.changes) throw new GameError(409, "本局已开始");
    return { startAt: start, endAt: start + DURATION };
  }
  if (name === "next") {
    if (stage(game) !== "finished") throw new GameError(409, "本局结束后才能开启下一局");
    if (Date.now() < game.end_at! + 2200) throw new GameError(409, "正在汇总成绩，请稍等两秒");
    await db().prepare("UPDATE games SET round = round + 1, status = 'lobby', start_at = NULL, end_at = NULL WHERE code = ? AND round = ? AND end_at <= ?").bind(game.code, game.round, Date.now() - 2200).run();
    return { ok: true };
  }
  throw new GameError(404, "操作不存在");
}
export async function safely(fn: () => Promise<unknown>) {
  try { return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof GameError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Game request failed", error);
    return Response.json({ error: "连接暂时不可用，请稍后再试" }, { status: 500 });
  }
}
