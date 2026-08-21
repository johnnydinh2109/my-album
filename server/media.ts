import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuid } from 'uuid'
import { media, type UserDoc } from './db.js'
import { config } from './config.js'

export const allowedExt = new Map([
  ['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.png','image/png'],['.webp','image/webp'],['.gif','image/gif'],
  ['.heic','image/heic'],['.heif','image/heic'],['.avif','image/avif'],['.mp4','video/mp4'],['.mov','video/quicktime'],['.webm','video/webm']
])
export function userRoot(user: UserDoc) {
  const full = path.resolve(config.photosRoot, user.media_folder)
  if (!full.startsWith(config.photosRoot + path.sep) && full !== config.photosRoot) throw new Error('Unsafe path')
  return full
}
export function resolveOwned(user: UserDoc, relative: string) {
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
export async function syncMedia(user: UserDoc) {
  const root = userRoot(user)
  fs.mkdirSync(root, { recursive: true })
  const files: string[] = []; walk(root, root, files)
  const existing = await media.find({ user_id: user.id }).project<{relative_path:string;taken_at:string}>({ relative_path: 1, taken_at: 1 }).toArray()
  const dates = new Map(existing.map(row => [row.relative_path, row.taken_at]))
  if (files.length) {
    await media.bulkWrite(files.map(relative => {
      const full = resolveOwned(user, relative), stat = fs.statSync(full), ext = path.extname(full).toLowerCase()
      return { updateOne: {
        filter: { user_id: user.id, relative_path: relative },
        update: {
          $set: { filename: path.basename(full), mime: allowedExt.get(ext)!, size: stat.size, modified_at: stat.mtime.toISOString() },
          $setOnInsert: { id: uuid(), user_id: user.id, relative_path: relative, taken_at: dates.get(relative) || stat.birthtime.toISOString(), favorite: 0 }
        },
        upsert: true
      }}
    }), { ordered: false })
    await media.deleteMany({ user_id: user.id, relative_path: { $nin: files } })
  } else await media.deleteMany({ user_id: user.id })
  return files.length
}
