# My Album

Web thư viện ảnh riêng tư kiểu Google Photos, chạy native trên Windows. Ảnh/video nằm nguyên trên `D:\photos`; cơ sở dữ liệu chỉ lưu tài khoản, đường dẫn, album và trạng thái yêu thích.

## Công nghệ

- React + Vite + TypeScript
- Node.js + Express
- SQLite (`better-sqlite3`)
- Argon2 (băm mật khẩu), JWT trong cookie HttpOnly

## Cài trên Windows

Yêu cầu **Node.js 22 LTS**.

```powershell
cd my-album
Copy-Item .env.example .env
notepad .env
npm install
npm run dev
```

Mở `http://localhost:5173`.

Trong `.env`, sửa ít nhất:

```env
PHOTOS_ROOT=D:/photos
BOOTSTRAP_ADMIN_EMAIL=email-cua-ban@example.com
BOOTSTRAP_ADMIN_FOLDER=admin
BOOTSTRAP_SETUP_CODE=mot-ma-bi-mat
JWT_SECRET=mot-chuoi-ngau-nhien-rat-dai
```

> Dùng `D:/photos` (dấu `/`) trong `.env`. Không dùng `D:\photos` vì dấu `\` có thể bị hiểu là ký tự escape.

## Dùng ngay ảnh đang có trong `D:\photos\admin`

1. **Không cần đổi tên folder `admin`.**
2. Đặt email của bạn vào `BOOTSTRAP_ADMIN_EMAIL` và giữ `BOOTSTRAP_ADMIN_FOLDER=admin`.
3. Khởi động web, chọn **Đăng ký**.
4. Đăng ký đúng email trên và nhập `BOOTSTRAP_SETUP_CODE`.
5. Sau khi đăng ký, web tự quét `D:\photos\admin` và hiển thị ảnh/video.

Mỗi tài khoản khác được tạo một folder UUID riêng, ví dụ:

```text
D:\photos\
├── admin\                       # chỉ tài khoản của bạn
├── 05ca3f6e-...\                # user khác
└── e2478fde-...\                # user khác nữa
```

Không user nào có endpoint truy cập folder của user khác. Backend kiểm tra quyền sở hữu trước khi trả file.

## Build để chạy ổn định

```powershell
npm run build
$env:NODE_ENV="production"
npm start
```

Mở `http://localhost:3001`. Có thể dùng Task Scheduler hoặc NSSM để tự chạy khi Windows khởi động.

## Tính năng

- Đăng ký, đăng nhập, đăng xuất
- Tự quét ảnh/video đã có trong folder riêng
- Timeline theo ngày
- Tìm theo tên file
- Yêu thích
- Tạo album, chọn nhiều ảnh và thêm vào album
- Upload tối đa 50 file/lần, 500 MB/file
- Xem ảnh/video toàn màn hình
- Chọn nhiều và xóa vĩnh viễn khỏi ổ đĩa

## Lưu ý an toàn

- App hiện phù hợp chạy trong máy hoặc mạng gia đình đáng tin cậy.
- Nếu mở ra Internet, đặt sau HTTPS reverse proxy, thêm rate-limit đăng nhập, xác minh email, CSRF token và backup định kỳ.
- Việc xóa trong web là **xóa vĩnh viễn**, không đưa vào Recycle Bin.
- Sao lưu `D:\photos` và file `data\my-album.db`.
