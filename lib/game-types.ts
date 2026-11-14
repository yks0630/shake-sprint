export type Stage = "lobby" | "countdown" | "running" | "finished";
export type Runner = { id: string; nickname: string; character: number; shakes: number; rank: number; ready?: boolean };
export type GameState = {
  code: string; title: string; round: number; stage: Stage; startAt: number | null; endAt: number | null;
  serverNow: number; count: number; readyCount?: number; players: Runner[]; me?: Runner | null;
};
export const CHARACTERS = ["female", "player", "adventurer"];
export const DISTANCE_PER_SHAKE = 2;
export const COUNTDOWN = 3_000;
export const DURATION = 40_000;
export const MAX_SHAKES_PER_SECOND = 7;
export function scoreLimit(startAt: number, now: number) {
  return Math.min(Math.max(0, Math.floor((now - startAt) * MAX_SHAKES_PER_SECOND / 1000) + 1), DURATION * MAX_SHAKES_PER_SECOND / 1000);
}

export const READY_TTL = 10_000;
export const READY_HEARTBEAT = 2_500;
