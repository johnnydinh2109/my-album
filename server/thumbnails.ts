import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import sharp from 'sharp'
import { config } from './config.js'
import type { MediaDoc, UserDoc } from './db.js'
import { resolveOwned } from './media.js'

const run = promisify(execFile)
const ffmpegStatic = createRequire(import.meta.url)('ffmpeg-static') as string | null
const generating = new Map<string, Promise<string>>()
const videoWaiters: Array<() => void> = []
let activeVideoJobs = 0

function cachePath(user: UserDoc, item: MediaDoc, size: number) {
  const version = Number.isFinite(Date.parse(item.modified_at)) ? Date.parse(item.modified_at) : 0
  return path.join(config.thumbnailCacheRoot, user.id, `${item.id}-${version}-${size}.webp`)
}
async function exists(file: string) {
  try { await fs.access(file); return true } catch { return false }
}
async function withVideoSlot<T>(task: () => Promise<T>) {
  if (activeVideoJobs >= 2) await new Promise<void>(resolve => videoWaiters.push(resolve))
  activeVideoJobs++
  try { return await task() } finally {
    activeVideoJobs--
    videoWaiters.shift()?.()
  }
}
async function makeImageThumbnail(source: string, output: string, size: number) {
  await sharp(source, { animated: false })
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(output)
}
async function makeVideoThumbnail(source: string, output: string, size: number) {
  const ffmpeg = process.env.FFMPEG_PATH || ffmpegStatic
  if (!ffmpeg) throw new Error('Không tìm thấy FFmpeg để tạo thumbnail video')
  const frame = `${output}.frame.jpg`
  const extract = async (second: string) => run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-ss', second, '-i', source,
    '-frames:v', '1', '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease`,
    '-q:v', '3', '-y', frame
  ], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 })
  try {
    // Seek nhanh đến giây 1; video cực ngắn sẽ fallback về frame đầu.
    try { await extract('1') } catch { await extract('0') }
    await sharp(frame).webp({ quality: 76, effort: 4 }).toFile(output)
  } finally { await fs.rm(frame, { force: true }).catch(() => {}) }
}

export async function deleteThumbnails(user: UserDoc, mediaId: string) {
  const dir = path.join(config.thumbnailCacheRoot, user.id)
  try {
    const files = await fs.readdir(dir)
    await Promise.all(files.filter(file => file.startsWith(`${mediaId}-`)).map(file => fs.rm(path.join(dir, file), { force: true })))
  } catch {}
}

export async function getThumbnail(user: UserDoc, item: MediaDoc, requestedSize: number) {
  const size = requestedSize <= 320 ? 320 : requestedSize <= 640 ? 640 : 960
  const output = cachePath(user, item, size)
  if (await exists(output)) return output
  const current = generating.get(output)
  if (current) return current

  const job = (async () => {
    await fs.mkdir(path.dirname(output), { recursive: true })
    const temporary = `${output}.${process.pid}.${Date.now()}.tmp`
    try {
      const source = resolveOwned(user, item.relative_path)
      if (item.mime.startsWith('video/')) await withVideoSlot(() => makeVideoThumbnail(source, temporary, size))
      else await makeImageThumbnail(source, temporary, size)
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
