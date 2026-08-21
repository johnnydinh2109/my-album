import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuid } from 'uuid'
import { db, type UserRow } from './db.js'
import { config } from './config.js'

export const allowedExt = new Map([
  ['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.png','image/png'],['.webp','image/webp'],['.gif','image/gif'],
  ['.heic','image/heic'],['.avif','image/avif'],['.mp4','video/mp4'],['.mov','video/quicktime'],['.webm','video/webm']
])
export function userRoot(user: UserRow) {
  const full = path.resolve(config.photosRoot, user.media_folder)
  if (!full.startsWith(config.photosRoot + path.sep) && full !== config.photosRoot) throw new Error('Unsafe path')
  return full
}
export function resolveOwned(user: UserRow, relative: string) {
  const root = userRoot(user), full = path.resolve(root, relative)
  if (!full.startsWith(root + path.sep)) throw new Error('Unsafe path')
  return full
}
function walk(dir: string, base: string, out: string[]) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) walk(full, base, out)
    else if (allowedExt.has(path.extname(item.name).toLowerCase())) out.push(path.relative(base, full).split(path.sep).join('/'))
  }
}
export function syncMedia(user: UserRow) {
  const root = userRoot(user)
  fs.mkdirSync(root, { recursive: true })
  const files: string[] = []; walk(root, root, files)
  const upsert = db.prepare(`INSERT INTO media(id,user_id,relative_path,filename,mime,size,taken_at,modified_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,relative_path) DO UPDATE SET filename=excluded.filename,mime=excluded.mime,size=excluded.size,modified_at=excluded.modified_at`)
  const run = db.transaction(() => {
    for (const relative of files) {
      const full = resolveOwned(user, relative), stat = fs.statSync(full), ext = path.extname(full).toLowerCase()
      const existing = db.prepare('SELECT taken_at FROM media WHERE user_id=? AND relative_path=?').get(user.id, relative) as {taken_at:string}|undefined
      const date = existing?.taken_at || stat.birthtime.toISOString()
      upsert.run(uuid(), user.id, relative, path.basename(full), allowedExt.get(ext), stat.size, date, stat.mtime.toISOString())
    }
    const disk = new Set(files)
    const rows = db.prepare('SELECT id,relative_path FROM media WHERE user_id=?').all(user.id) as {id:string;relative_path:string}[]
    for (const row of rows) if (!disk.has(row.relative_path)) db.prepare('DELETE FROM media WHERE id=?').run(row.id)
  }); run()
  return files.length
}
