-- Esquema de la base de datos del Sistema de Reservas de Pádel.
-- Ver specs/001-padel-court-booking/data-model.md

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  expires_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS courts (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS reservations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  court_id   INTEGER NOT NULL REFERENCES courts(id),
  date       TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  start_hour INTEGER NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Anti doble reserva a nivel de esquema (FR-017, Principio II)
  UNIQUE (court_id, date, start_hour)
);

CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations (user_id, date, start_hour);
