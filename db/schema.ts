import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
export const games = sqliteTable("games", {
  code: text("code").primaryKey(), title: text("title").notNull(), hostHash: text("host_hash").notNull(),
  round: integer("round").notNull().default(1), status: text("status").notNull().default("lobby"),
  startAt: integer("start_at"), endAt: integer("end_at"), createdAt: integer("created_at").notNull(),
});
export const players = sqliteTable("players", {
  id: text("id").primaryKey(), room: text("room").notNull().references(() => games.code),
  nickname: text("nickname").notNull(), character: integer("character").notNull(),
  tokenHash: text("token_hash").notNull(), joinedAt: integer("joined_at").notNull(),
}, t => [index("players_room").on(t.room)]);
export const scores = sqliteTable("scores", {
  playerId: text("player_id").notNull().references(() => players.id), round: integer("round").notNull(),
  shakes: integer("shakes").notNull().default(0), updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({ columns: [t.playerId, t.round] })]);

export const readiness = sqliteTable("player_readiness", {
  playerId: text("player_id").primaryKey().references(() => players.id),
  round: integer("round").notNull(), ready: integer("ready").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
