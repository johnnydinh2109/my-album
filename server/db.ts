import { MongoClient, type Collection } from 'mongodb'
import path from 'node:path'
import { config } from './config.js'

export type UserDoc = {
  id: string
  email: string
  name: string
  password_hash: string
  media_folder: string
  created_at: string
}
export type MediaDoc = {
  id: string
  user_id: string
  relative_path: string
  filename: string
  mime: string
  size: number
  taken_at: string
  modified_at: string
  favorite: number
}
export type AlbumDoc = { id: string; user_id: string; name: string; created_at: string }
export type AlbumMediaDoc = { album_id: string; media_id: string }

export const mongo = new MongoClient(config.mongodbUri)
export const database = mongo.db(config.mongodbDb)
export const users: Collection<UserDoc> = database.collection('users')
export const media: Collection<MediaDoc> = database.collection('media')
export const albums: Collection<AlbumDoc> = database.collection('albums')
export const albumMedia: Collection<AlbumMediaDoc> = database.collection('album_media')

export const dbReady = (async () => {
  await mongo.connect()
  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    users.createIndex({ media_folder: 1 }, { unique: true }),
    media.createIndex({ user_id: 1, relative_path: 1 }, { unique: true }),
    media.createIndex({ user_id: 1, taken_at: -1 }),
    albums.createIndex({ user_id: 1, created_at: -1 }),
    albumMedia.createIndex({ album_id: 1, media_id: 1 }, { unique: true }),
  ])
})()

export function safeUserFolder(folder: string) {
  if (!folder || path.isAbsolute(folder) || folder.includes('..') || /[\\/]/.test(folder)) throw new Error('Invalid media folder')
  return folder
}
