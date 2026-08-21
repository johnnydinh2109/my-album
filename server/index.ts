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
import { db, safeUserFolder, type UserRow } from './db.js'
import { requireAuth, setSession } from './auth.js'
import { allowedExt, resolveOwned, syncMedia, userRoot } from './media.js'

const app = express(); app.disable('x-powered-by'); app.use(express.json({limit:'1mb'})); app.use(cookieParser())
const asyncRoute = (fn:any) => (req:any,res:any,next:any) => Promise.resolve(fn(req,res,next)).catch(next)
const authSchema = z.object({ email:z.string().email(), password:z.string().min(8).max(128), name:z.string().trim().min(2).max(60).optional(), setupCode:z.string().optional() })

app.post('/api/auth/register', asyncRoute(async (req:any,res:any) => {
  const input=authSchema.parse(req.body), email=input.email.toLowerCase(), isBootstrap=email===config.adminEmail
  if (isBootstrap && config.setupCode && input.setupCode!==config.setupCode) return res.status(403).json({error:'Mã thiết lập không đúng'})
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({error:'Email đã được sử dụng'})
  const folder=safeUserFolder(isBootstrap ? config.adminFolder : uuid()), id=uuid()
  if (db.prepare('SELECT 1 FROM users WHERE media_folder=?').get(folder)) return res.status(409).json({error:'Thư mục ảnh đã được gán'})
  const hash=await argon2.hash(input.password); fs.mkdirSync(path.join(config.photosRoot,folder),{recursive:true})
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,email,input.name!,hash,folder,new Date().toISOString())
  setSession(res,id); res.status(201).json({user:{id,email,name:input.name,mediaFolder:folder}})
}))
app.post('/api/auth/login', asyncRoute(async(req:any,res:any)=>{ const input=authSchema.pick({email:true,password:true}).parse(req.body); const u=db.prepare('SELECT * FROM users WHERE email=?').get(input.email.toLowerCase()) as UserRow|undefined; if(!u||!await argon2.verify(u.password_hash,input.password)) return res.status(401).json({error:'Email hoặc mật khẩu không đúng'}); setSession(res,u.id); res.json({user:{id:u.id,email:u.email,name:u.name,mediaFolder:u.media_folder}}) }))
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('my_album_session',{path:'/'});res.json({ok:true})})
app.get('/api/me',requireAuth,(req,res)=>{const u=req.user!;res.json({user:{id:u.id,email:u.email,name:u.name,mediaFolder:u.media_folder}})})

app.get('/api/media',requireAuth,(req,res)=>{ syncMedia(req.user!); const q=String(req.query.q||'').trim(), fav=req.query.favorite==='true'; let sql='SELECT * FROM media WHERE user_id=?', args:any[]=[req.user!.id]; if(q){sql+=' AND filename LIKE ?';args.push(`%${q}%`)} if(fav)sql+=' AND favorite=1'; sql+=' ORDER BY taken_at DESC'; res.json({items:db.prepare(sql).all(...args)}) })
app.get('/api/media/:id/file',requireAuth,(req,res)=>{const row=db.prepare('SELECT * FROM media WHERE id=? AND user_id=?').get(req.params.id,req.user!.id) as any;if(!row)return res.sendStatus(404);res.sendFile(resolveOwned(req.user!,row.relative_path))})
app.patch('/api/media/:id/favorite',requireAuth,(req,res)=>{db.prepare('UPDATE media SET favorite=? WHERE id=? AND user_id=?').run(req.body.favorite?1:0,req.params.id,req.user!.id);res.json({ok:true})})
app.delete('/api/media/:id',requireAuth,(req,res)=>{const row=db.prepare('SELECT * FROM media WHERE id=? AND user_id=?').get(req.params.id,req.user!.id) as any;if(!row)return res.sendStatus(404);fs.unlinkSync(resolveOwned(req.user!,row.relative_path));db.prepare('DELETE FROM media WHERE id=?').run(row.id);res.json({ok:true})})
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:500*1024*1024,files:50}})
app.post('/api/media/upload',requireAuth,upload.array('files',50),(req,res)=>{const files=req.files as Express.Multer.File[];for(const f of files){const ext=path.extname(f.originalname).toLowerCase();if(!allowedExt.has(ext))continue;const base=path.basename(f.originalname,ext).replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,100)||'media';let name=`${Date.now()}-${base}${ext}`,full=path.join(userRoot(req.user!),name);while(fs.existsSync(full)){name=`${Date.now()}-${uuid().slice(0,6)}-${base}${ext}`;full=path.join(userRoot(req.user!),name)}fs.writeFileSync(full,f.buffer)}syncMedia(req.user!);res.status(201).json({ok:true})})

app.get('/api/albums',requireAuth,(req,res)=>res.json({items:db.prepare(`SELECT a.*,COUNT(am.media_id) count FROM albums a LEFT JOIN album_media am ON a.id=am.album_id WHERE a.user_id=? GROUP BY a.id ORDER BY a.created_at DESC`).all(req.user!.id)}))
app.post('/api/albums',requireAuth,(req,res)=>{const name=z.string().trim().min(1).max(80).parse(req.body.name),id=uuid();db.prepare('INSERT INTO albums VALUES(?,?,?,?)').run(id,req.user!.id,name,new Date().toISOString());res.status(201).json({id,name})})
app.get('/api/albums/:id/media',requireAuth,(req,res)=>res.json({items:db.prepare(`SELECT m.* FROM media m JOIN album_media am ON m.id=am.media_id JOIN albums a ON a.id=am.album_id WHERE a.id=? AND a.user_id=? ORDER BY m.taken_at DESC`).all(req.params.id,req.user!.id)}))
app.post('/api/albums/:id/media',requireAuth,(req,res)=>{const album=db.prepare('SELECT 1 FROM albums WHERE id=? AND user_id=?').get(req.params.id,req.user!.id);if(!album)return res.sendStatus(404);const ids=z.array(z.string()).max(500).parse(req.body.mediaIds);const add=db.prepare('INSERT OR IGNORE INTO album_media VALUES(?,?)');db.transaction(()=>ids.forEach(id=>{if(db.prepare('SELECT 1 FROM media WHERE id=? AND user_id=?').get(id,req.user!.id))add.run(req.params.id,id)}))();res.json({ok:true})})
app.delete('/api/albums/:id',requireAuth,(req,res)=>{db.prepare('DELETE FROM albums WHERE id=? AND user_id=?').run(req.params.id,req.user!.id);res.json({ok:true})})

if(config.production){app.use(express.static('dist'));app.get('*',(req,res)=>res.sendFile(path.resolve('dist/index.html')))}
app.use((err:any,req:any,res:any,next:any)=>{console.error(err);if(err instanceof z.ZodError)return res.status(400).json({error:err.issues[0]?.message||'Dữ liệu không hợp lệ'});res.status(500).json({error:'Có lỗi xảy ra trên máy chủ'})})
fs.mkdirSync(config.photosRoot,{recursive:true});app.listen(config.port,'0.0.0.0',()=>console.log(`My Album API: http://localhost:${config.port}`))
