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
INSERT OR IGNORE INTO seq_counter (stream, last_seq) VALUES ('acks', 0);

-- Inbox gesture queue (acks stream): resolve/answer actions replayed to the hub, which dedups on
-- client_action_id. Accepted and permanently-rejected rows are deleted; transients stay for retry.
CREATE TABLE IF NOT EXISTS pending_acks (
  seq              INTEGER PRIMARY KEY,
  kind             TEXT    NOT NULL,        -- 'resolve' | 'answer'
  target_id        TEXT    NOT NULL,        -- approval / check-in id
  client_action_id TEXT    NOT NULL,
  payload_json     TEXT    NOT NULL,
  created_at       INTEGER NOT NULL
);

-- Read-only Inbox cache: the whole last assistant-api feed stored as one JSON blob so the screen renders offline.
CREATE TABLE IF NOT EXISTS inbox_cache (
  key        TEXT PRIMARY KEY,
  json       TEXT    NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT);
INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('version', '1');

DROP TABLE IF EXISTS pending_fixes;
DROP TABLE IF EXISTS pending_ring;
DROP TABLE IF EXISTS pending_summaries;
DROP TABLE IF EXISTS sync_state;
DROP TABLE IF EXISTS collector_meta;
`;
