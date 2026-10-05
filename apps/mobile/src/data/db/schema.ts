// WAL + busy timeout let the foreground app and the background task (separate connections) write concurrently; seq is the monotonic value AND the PK.

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 3000;
PRAGMA foreign_keys = ON;

-- Per-stream monotonic seq counter (atomic via UPDATE ... RETURNING in seq-repo).
CREATE TABLE IF NOT EXISTS seq_counter (
  stream   TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO seq_counter (stream, last_seq) VALUES ('ring', 0), ('summaries', 0);

-- Ring buffer (phase 2). kind is a wire string: hr|hrv|spo2|skin_temp|steps|activity.
CREATE TABLE IF NOT EXISTS pending_ring (
  seq           INTEGER PRIMARY KEY,
  kind          TEXT    NOT NULL,
  ts            TEXT    NOT NULL,
  value         REAL    NOT NULL,
  status        INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pending_ring_status_seq ON pending_ring (status, seq);

-- Summaries buffer (phase 2). kind is an INTEGER (smallint); periods are camelCase on the wire.
CREATE TABLE IF NOT EXISTS pending_summaries (
  seq           INTEGER PRIMARY KEY,
  kind          INTEGER NOT NULL,
  period_start  TEXT    NOT NULL,
  period_end    TEXT    NOT NULL,
  payload_json  TEXT    NOT NULL,
  status        INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pending_summaries_status_seq ON pending_summaries (status, seq);

CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT);
INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('version', '1');

DROP TABLE IF EXISTS pending_fixes;
DROP TABLE IF EXISTS sync_state;
DROP TABLE IF EXISTS collector_meta;
DROP TABLE IF EXISTS pending_acks;
DROP TABLE IF EXISTS inbox_cache;
`;
