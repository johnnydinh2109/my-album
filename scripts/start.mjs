// Đặt production trước khi import server để Express phục vụ frontend trong dist/.
// Cách này hoạt động giống nhau trên Windows, macOS và Linux.
process.env.NODE_ENV = 'production'
await import('../build-server/index.js')
