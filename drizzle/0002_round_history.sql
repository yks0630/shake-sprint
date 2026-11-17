CREATE TABLE game_rounds (
  room TEXT NOT NULL REFERENCES games(code),
  round INTEGER NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  roster_json TEXT NOT NULL,
  PRIMARY KEY (room, round)
);
--> statement-breakpoint
CREATE TRIGGER record_round_start AFTER UPDATE OF status, start_at ON games
WHEN NEW.status = 'running' AND OLD.status = 'lobby' AND NEW.start_at IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO game_rounds (room, round, start_at, end_at, roster_json)
  SELECT NEW.code, NEW.round, NEW.start_at, NEW.end_at,
    COALESCE((SELECT json_group_array(json_object('id', id, 'nickname', nickname, 'character', character)) FROM players WHERE room = NEW.code), '[]');
END;
--> statement-breakpoint
INSERT OR IGNORE INTO game_rounds (room, round, start_at, end_at, roster_json)
SELECT g.code, g.round, g.start_at, g.end_at,
  COALESCE((SELECT json_group_array(json_object('id', p.id, 'nickname', p.nickname, 'character', p.character)) FROM players p WHERE p.room = g.code AND p.joined_at <= g.start_at), '[]')
FROM games g WHERE g.start_at IS NOT NULL AND g.end_at IS NOT NULL;
