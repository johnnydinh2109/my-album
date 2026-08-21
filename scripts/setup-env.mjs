import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mode = process.argv[2] || 'init'
const envPath = resolve('.env')
const examplePath = resolve('.env.example')
const placeholders = new Set([
  '',
  'mot-ma-bi-mat',
  'doi-ma-thiet-lap-nay',
  'mot-chuoi-ngau-nhien-rat-dai',
  'doi-chuoi-nay-thanh-mot-chuoi-ngau-nhien-rat-dai',
])

function readValues(text) {
  return Object.fromEntries(
    text.split(/\r?\n/)
      .filter(line => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
      })
  )
}

function replaceValue(text, key, value) {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`
}

function secret(bytes) {
  return randomBytes(bytes).toString('base64url')
}

if (mode === 'check') {
  if (!existsSync(envPath)) {
    console.error('Chưa có .env. Chạy: npm run setup')
    process.exit(1)
  }
  const values = readValues(readFileSync(envPath, 'utf8'))
  const invalid = ['BOOTSTRAP_SETUP_CODE', 'JWT_SECRET'].filter(key => placeholders.has(values[key] || ''))
  if (invalid.length) {
    console.error(`Secret chưa an toàn: ${invalid.join(', ')}. Chạy: npm run secrets:rotate`)
    process.exit(1)
  }
  console.log('.env hợp lệ; các secret đã được thiết lập.')
  process.exit(0)
}

if (!existsSync(examplePath)) {
  console.error('Không tìm thấy .env.example')
  process.exit(1)
}
if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath)
  console.log('Đã tạo .env từ .env.example.')
}

let text = readFileSync(envPath, 'utf8')
const values = readValues(text)
const rotate = mode === 'rotate'
let changed = false

if (rotate || placeholders.has(values.BOOTSTRAP_SETUP_CODE || '')) {
  text = replaceValue(text, 'BOOTSTRAP_SETUP_CODE', secret(24))
  changed = true
}
if (rotate || placeholders.has(values.JWT_SECRET || '')) {
  text = replaceValue(text, 'JWT_SECRET', secret(48))
  changed = true
}

if (changed) {
  writeFileSync(envPath, text, { mode: 0o600 })
  console.log(rotate ? 'Đã xoay BOOTSTRAP_SETUP_CODE và JWT_SECRET.' : 'Đã tự động tạo BOOTSTRAP_SETUP_CODE và JWT_SECRET.')
} else {
  console.log('Các secret đã tồn tại; không thay đổi. Dùng npm run secrets:rotate nếu muốn tạo lại.')
}
console.log('Giá trị secret không được in ra terminal. File .env đang được Git bỏ qua.')
