import 'dotenv/config'
import os from 'node:os'

const port = Number(process.env.PORT || 3001)
const addresses = Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal)

if (!addresses.length) {
  console.log('Không tìm thấy địa chỉ IPv4 LAN. Kiểm tra kết nối Wi-Fi/Ethernet.')
  process.exit(1)
}
console.log('\nĐịa chỉ có thể mở từ thiết bị khác trong LAN:')
for (const item of addresses) console.log(`  http://${item.address}:${port}`)
console.log('\nNếu không truy cập được, mở PowerShell bằng Run as Administrator và chạy:')
console.log(`  New-NetFirewallRule -DisplayName "My Album LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port} -Profile Private`)
console.log('\nKhông mở/port-forward cổng này trực tiếp ra Internet.')
