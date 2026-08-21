import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import argon2 from 'argon2'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { config } from './config.js'
import { albumMedia, albums, dbReady, media, safeUserFolder, users } from './db.js'
import { requireAuth, setSession } from './auth.js'
import { allowedExt, resolveOwned, syncMedia, userRoot } from './media.js'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
const asyncRoute = (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next)
const authSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128), name: z.string().trim().min(2).max(60).optional(), setupCode: z.string().optional() })

app.post('/api/auth/register', asyncRoute(async (req: any, res: any) => {
  await dbReady
  const input = authSchema.parse(req.body), email = input.email.toLowerCase(), isBootstrap = email === config.adminEmail
  if (isBootstrap && config.setupCode && input.setupCode !== config.setupCode) return res.status(403).json({ error: 'Mã thiết lập không đúng' })
  if (await users.findOne({ email })) return res.status(409).json({ error: 'Email đã được sử dụng' })
  const folder = safeUserFolder(isBootstrap ? config.adminFolder : uuid()), id = uuid()
  if (await users.findOne({ media_folder: folder })) return res.status(409).json({ error: 'Thư mục ảnh đã được gán' })
  const hash = await argon2.hash(input.password)
  fs.mkdirSync(path.join(config.photosRoot, folder), { recursive: true })
  await users.insertOne({ id, email, name: input.name!, password_hash: hash, media_folder: folder, created_at: new Date().toISOString() })
  setSession(res, id)
  res.status(201).json({ user: { id, email, name: input.name, mediaFolder: folder } })
}))
app.post('/api/auth/login', asyncRoute(async (req: any, res: any) => {
  await dbReady
  const input = authSchema.pick({ email: true, password: true }).parse(req.body)
  const user = await users.findOne({ email: input.email.toLowerCase() })
  if (!user || !await argon2.verify(user.password_hash, input.password)) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' })
  setSession(res, user.id)
  res.json({ user: { id: user.id, email: user.email, name: user.name, mediaFolder: user.media_folder } })
}))
app.post('/api/auth/logout', (req, res) => { res.clearCookie('my_album_session', { path: '/' }); res.json({ ok: true }) })
app.get('/api/me', requireAuth, (req, res) => { const user = req.user!; res.json({ user: { id: user.id, email: user.email, name: user.name, mediaFolder: user.media_folder } }) })

app.get('/api/media', requireAuth, asyncRoute(async (req: any, res: any) => {
  await syncMedia(req.user)
  const q = String(req.query.q || '').trim(), favorite = req.query.favorite === 'true'
  const filter: Record<string, any> = { user_id: req.user.id }
  if (q) filter.filename = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  if (favorite) filter.favorite = 1
  res.json({ items: await media.find(filter).sort({ taken_at: -1 }).toArray() })
}))
app.get('/api/media/:id/file', requireAuth, asyncRoute(async (req: any, res: any) => {
  const row = await media.findOne({ id: req.params.id, user_id: req.user.id })
  if (!row) return res.sendStatus(404)
  res.sendFile(resolveOwned(req.user, row.relative_path))
}))
app.patch('/api/media/:id/favorite', requireAuth, asyncRoute(async (req: any, res: any) => {
  await media.updateOne({ id: req.params.id, user_id: req.user.id }, { $set: { favorite: req.body.favorite ? 1 : 0 } })
  res.json({ ok: true })
}))
app.delete('/api/media/:id', requireAuth, asyncRoute(async (req: any, res: any) => {
  const row = await media.findOne({ id: req.params.id, user_id: req.user.id })
  if (!row) return res.sendStatus(404)
  fs.unlinkSync(resolveOwned(req.user, row.relative_path))
  await Promise.all([media.deleteOne({ id: row.id }), albumMedia.deleteMany({ media_id: row.id })])
  res.json({ ok: true })
}))
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024, files: 50 } })
app.post('/api/media/upload', requireAuth, upload.array('files', 50), asyncRoute(async (req: any, res: any) => {
  const files = req.files as Express.Multer.File[]
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!allowedExt.has(ext)) continue
    const base = path.basename(file.originalname, ext).replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 100) || 'media'
    let name = `${Date.now()}-${base}${ext}`, full = path.join(userRoot(req.user), name)
    while (fs.existsSync(full)) { name = `${Date.now()}-${uuid().slice(0, 6)}-${base}${ext}`; full = path.join(userRoot(req.user), name) }
    fs.writeFileSync(full, file.buffer)
  }
  await syncMedia(req.user)
  res.status(201).json({ ok: true })
}))

app.get('/api/albums', requireAuth, asyncRoute(async (req: any, res: any) => {
  const rows = await albums.find({ user_id: req.user.id }).sort({ created_at: -1 }).toArray()
  const items = await Promise.all(rows.map(async album => ({ ...album, count: await albumMedia.countDocuments({ album_id: album.id }) })))
  res.json({ items })
}))
app.post('/api/albums', requireAuth, asyncRoute(async (req: any, res: any) => {
  const name = z.string().trim().min(1).max(80).parse(req.body.name), id = uuid()
  await albums.insertOne({ id, user_id: req.user.id, name, created_at: new Date().toISOString() })
  res.status(201).json({ id, name })
}))
app.get('/api/albums/:id/media', requireAuth, asyncRoute(async (req: any, res: any) => {
  const album = await albums.findOne({ id: req.params.id, user_id: req.user.id })
  if (!album) return res.sendStatus(404)
  const links = await albumMedia.find({ album_id: album.id }).toArray()
  const ids = links.map(link => link.media_id)
  res.json({ items: ids.length ? await media.find({ id: { $in: ids }, user_id: req.user.id }).sort({ taken_at: -1 }).toArray() : [] })
}))
app.post('/api/albums/:id/media', requireAuth, asyncRoute(async (req: any, res: any) => {
  const album = await albums.findOne({ id: req.params.id, user_id: req.user.id })
  if (!album) return res.sendStatus(404)
  const ids = z.array(z.string()).max(500).parse(req.body.mediaIds)
  const owned = await media.find({ id: { $in: ids }, user_id: req.user.id }).project<{id:string}>({ id: 1 }).toArray()
  if (owned.length) await albumMedia.bulkWrite(owned.map(row => ({ updateOne: { filter: { album_id: album.id, media_id: row.id }, update: { $setOnInsert: { album_id: album.id, media_id: row.id } }, upsert: true } })), { ordered: false })
  res.json({ ok: true })
}))
app.delete('/api/albums/:id', requireAuth, asyncRoute(async (req: any, res: any) => {
  const result = await albums.deleteOne({ id: req.params.id, user_id: req.user.id })
  if (result.deletedCount) await albumMedia.deleteMany({ album_id: req.params.id })
  res.json({ ok: true })
}))

if (config.production) { app.use(express.static('dist')); app.get('*', (req, res) => res.sendFile(path.resolve('dist/index.html'))) }
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err)
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Dữ liệu không hợp lệ' })
  if (err?.code === 11000) return res.status(409).json({ error: 'Email hoặc thư mục đã được sử dụng' })
  res.status(500).json({ error: 'Có lỗi xảy ra trên máy chủ' })
})
fs.mkdirSync(config.photosRoot, { recursive: true })
dbReady.then(() => app.listen(config.port, '0.0.0.0', () => console.log(`My Album API: http://localhost:${config.port}`))).catch(error => { console.error('Không thể kết nối MongoDB:', error); process.exit(1) })
