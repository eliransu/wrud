/**
 * wrud local SQLite schema - the single source of truth, applied at adapter construction.
 * Kept as a TS string constant (not a runtime-read .sql file) so it survives bundling: the
 * published `wrud` CLI inlines this into one file with no dependency on on-disk layout.
 * Nested objects are stored as JSON text columns; the adapter (de)serializes them.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  api_key_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  user_json   TEXT NOT NULL,
  agent_json  TEXT NOT NULL,
  runtime_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  status      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);

CREATE TABLE IF NOT EXISTS events (
  session_id TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  id         TEXT NOT NULL,
  timestamp  TEXT NOT NULL,
  type       TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE IF NOT EXISTS summaries (
  session_id TEXT PRIMARY KEY,
  json       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  prefix      TEXT NOT NULL,
  hash        TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(hash);

CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,
  session_id  TEXT,
  scope       TEXT NOT NULL,
  guidance    TEXT NOT NULL,
  source      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lessons_scope ON lessons(scope);
CREATE INDEX IF NOT EXISTS idx_lessons_session ON lessons(session_id);
`;
