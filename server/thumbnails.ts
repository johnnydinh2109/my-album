import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { config } from './config.js'
import type { MediaDoc, UserDoc } from './db.js'
import { resolveOwned } from './media.js'

const generating = new Map<string, Promise<string>>()

function cachePath(user: UserDoc, item: MediaDoc, size: number) {
  const version = Number.isFinite(Date.parse(item.modified_at)) ? Date.parse(item.modified_at) : 0
  return path.join(config.thumbnailCacheRoot, user.id, `${item.id}-${version}-${size}.webp`)
}

async function exists(file: string) {
  try { await fs.access(file); return true } catch { return false }
}

export async function deleteThumbnails(user: UserDoc, mediaId: string) {
  const dir = path.join(config.thumbnailCacheRoot, user.id)
  try {
    const files = await fs.readdir(dir)
    await Promise.all(files.filter(file => file.startsWith(`${mediaId}-`)).map(file => fs.rm(path.join(dir, file), { force: true })))
  } catch {}
}

export async function getThumbnail(user: UserDoc, item: MediaDoc, requestedSize: number) {
  // Chỉ cho phép vài kích thước hữu hạn để tránh tạo vô số cache file.
  const size = requestedSize <= 320 ? 320 : requestedSize <= 640 ? 640 : 960
  const output = cachePath(user, item, size)
  if (await exists(output)) return output
  const current = generating.get(output)
  if (current) return current

  const job = (async () => {
    await fs.mkdir(path.dirname(output), { recursive: true })
    const temporary = `${output}.${process.pid}.${Date.now()}.tmp`
    try {
      await sharp(resolveOwned(user, item.relative_path), { animated: false })
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toFile(temporary)
      await fs.rename(temporary, output)
      return output
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  })().finally(() => generating.delete(output))

  generating.set(output, job)
  return job
}
