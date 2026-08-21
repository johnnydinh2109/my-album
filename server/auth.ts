import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { dbReady, users, type UserDoc } from './db.js'

type Claims = { sub: string }
declare global { namespace Express { interface Request { user?: UserDoc } } }

export function setSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId } satisfies Claims, config.jwtSecret, { expiresIn: '30d' })
  res.cookie('my_album_session', token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, maxAge: 30 * 86400_000, path: '/' })
}
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.my_album_session
    if (!token) return res.status(401).json({ error: 'Bạn chưa đăng nhập' })
    const claims = jwt.verify(token, config.jwtSecret) as Claims
    await dbReady
    const user = await users.findOne({ id: claims.sub })
    if (!user) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' })
    req.user = user
    next()
  } catch { res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' }) }
}
