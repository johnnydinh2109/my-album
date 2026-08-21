import 'dotenv/config'
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'my_album'
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })

try {
  await client.connect()
  await client.db(dbName).command({ ping: 1 })
  console.log(`MongoDB hoạt động: ${dbName}`)
} catch (error) {
  console.error('\nKhông thể kết nối MongoDB.')
  console.error(`MONGODB_URI: ${uri.replace(/:\/\/([^@/]+)@/, '://***@')}`)
  if (uri.includes('127.0.0.1') || uri.includes('localhost')) {
    console.error('\nTrên Windows, hãy kiểm tra dịch vụ:')
    console.error('  Get-Service MongoDB')
    console.error('  Start-Service MongoDB')
    console.error('\nNếu chưa cài, hãy cài MongoDB Community Server hoặc dùng MongoDB Atlas.')
  } else {
    console.error('\nKiểm tra connection string, tài khoản, Network Access và IP allowlist trên MongoDB Atlas.')
  }
  console.error(`\nChi tiết: ${error.message}`)
  process.exitCode = 1
} finally {
  await client.close().catch(() => {})
}
