import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dbPath = process.env.DB_PATH || 'data/my-album.db'
fs.mkdirSync(path.dirname(dbPath), { recursive: true })
export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  media_folder TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  taken_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, relative_path)
);
CREATE INDEX IF NOT EXISTS idx_media_user_date ON media(user_id, taken_at DESC);
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS album_media (
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  PRIMARY KEY(album_id, media_id)
);
`)

export type UserRow = { id: string; email: string; name: string; password_hash: string; media_folder: string; created_at: string }
export function safeUserFolder(folder: string) {
  if (!folder || path.isAbsolute(folder) || folder.includes('..') || /[\\/]/.test(folder)) throw new Error('Invalid media folder')
  return folder
}
