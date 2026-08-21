import path from 'node:path'

const root = process.env.PHOTOS_ROOT || 'D:/photos'
export const config = {
  port: Number(process.env.PORT || 3001),
  photosRoot: path.resolve(root),
  adminEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase(),
  adminFolder: process.env.BOOTSTRAP_ADMIN_FOLDER || 'admin',
  setupCode: process.env.BOOTSTRAP_SETUP_CODE || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongodbDb: process.env.MONGODB_DB || 'my_album',
  production: process.env.NODE_ENV === 'production'
}
