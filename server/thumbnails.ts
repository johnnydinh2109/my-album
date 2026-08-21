import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import sharp from 'sharp'
import { config } from './config.js'
import type { MediaDoc, UserDoc } from './db.js'
import { resolveOwned } from './media.js'

const require = createRequire(import.meta.url)
const run = promisify(execFile)
const ffmpegStatic = require('ffmpeg-static') as string | null
const heicConvert = require('heic-convert') as (options: { buffer: Buffer; format: 'JPEG' | 'PNG'; quality?: number }) => Promise<Buffer>
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
async function makeImageVariant(source: string, output: string, size: number, quality: number, isHeic: boolean) {
  const convert = (input: string | Buffer) => sharp(input, { animated: false, failOn: 'none' })
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toFile(output)
  try {
    await convert(source)
  } catch (error) {
    if (!isHeic) throw error
    // Một số bản libvips không có codec HEIC. libheif-js là fallback thuần JS.
    const jpeg = await heicConvert({ buffer: await fs.readFile(source), format: 'JPEG', quality: 0.92 })
    await convert(jpeg)
  }
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
      else await makeImageVariant(source, temporary, size, 78, item.mime === 'image/heic')
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

export async function getBrowserPreview(user: UserDoc, item: MediaDoc) {
  const version = Number.isFinite(Date.parse(item.modified_at)) ? Date.parse(item.modified_at) : 0
  const output = path.join(config.thumbnailCacheRoot, user.id, `${item.id}-${version}-preview.webp`)
  if (await exists(output)) return output
  const current = generating.get(output)
  if (current) return current

  const job = (async () => {
    await fs.mkdir(path.dirname(output), { recursive: true })
    const temporary = `${output}.${process.pid}.${Date.now()}.tmp`
    try {
      await makeImageVariant(resolveOwned(user, item.relative_path), temporary, 2560, 88, item.mime === 'image/heic')
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
