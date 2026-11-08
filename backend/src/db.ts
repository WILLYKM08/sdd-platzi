import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

const dbDir = fileURLToPath(new URL('../../db/', import.meta.url));

export const defaultDbPath = process.env.DB_PATH ?? `${dbDir}padel.db`;

/**
 * Abre la base SQLite. Siempre aplica los PRAGMAs; si `init` no es `false`,
 * aplica además el esquema y la semilla (ambos idempotentes).
 */
export function openDb(path: string, options: { init?: boolean } = {}): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (options.init !== false) {
    db.exec(readFileSync(`${dbDir}schema.sql`, 'utf8'));
    db.exec(readFileSync(`${dbDir}seed.sql`, 'utf8'));
  }
  return db;
}
