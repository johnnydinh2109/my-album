# My Album

Web thư viện ảnh riêng tư kiểu Google Photos, chạy native trên Windows. Ảnh/video nằm nguyên trên `D:\photos`; cơ sở dữ liệu chỉ lưu tài khoản, đường dẫn, album và trạng thái yêu thích.

## Công nghệ

- React + Vite + TypeScript
- Node.js + Express
- MongoDB (official Node.js driver)
- Argon2 (băm mật khẩu), JWT trong cookie HttpOnly

## Cài trên Windows

Yêu cầu **Node.js 22 LTS hoặc Node.js 24 LTS** (`node --version` phải từ `v22` trở lên) và **MongoDB Community Server** đang chạy. Dự án không còn dùng native SQLite nên không cần Python, `node-gyp` hoặc Visual Studio Build Tools.

```powershell
cd my-album
npm install
npm run setup
notepad .env
npm run dev
```

Mở `http://localhost:5173`.

`npm run setup` sẽ tạo `.env` từ `.env.example`, rồi tự thay `BOOTSTRAP_SETUP_CODE` và `JWT_SECRET` mẫu bằng chuỗi ngẫu nhiên an toàn. Script không in secret ra terminal và không ghi đè secret thật đã tồn tại.

Trong `.env`, cấu hình MongoDB, ổ ảnh và email:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=my_album
PHOTOS_ROOT=D:/photos
BOOTSTRAP_ADMIN_EMAIL=email-cua-ban@example.com
BOOTSTRAP_ADMIN_FOLDER=admin
```

Nếu dùng MongoDB Atlas, thay `MONGODB_URI` bằng connection string Atlas. Không commit connection string vào GitHub.

### Các script quản lý secret

```powershell
npm run setup           # tạo .env nếu chưa có và thay các secret mẫu
npm run env:init        # tương đương npm run setup
npm run env:check       # kiểm tra .env đã có secret an toàn chưa
npm run secrets:rotate  # tạo lại cả hai secret
```

Sau khi chạy `secrets:rotate`, các phiên đăng nhập JWT hiện tại sẽ hết hiệu lực và người dùng cần đăng nhập lại.

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

## Chạy production

```powershell
npm start
```

Không cần tự đặt `NODE_ENV`; script start sẽ tự bật production trên Windows, build ứng dụng và phục vụ cả frontend lẫn API.

`npm start` sẽ tự động:

1. Build frontend và backend.
2. Kiểm tra kết nối MongoDB trong tối đa 5 giây.
3. Chỉ khởi động server nếu MongoDB hoạt động.

Bạn cũng có thể kiểm tra riêng MongoDB bằng `npm run mongo:check`. Sau khi server chạy, mở `http://localhost:3001`. Có thể dùng Task Scheduler hoặc NSSM để tự chạy khi Windows khởi động.

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

## Chuyển từ bản SQLite cũ

Nếu đã từng chạy `npm install` với bản cũ, mở PowerShell trong thư mục dự án:

```powershell
git pull
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
npm run setup
npm run dev
```

Kiểm tra dịch vụ MongoDB local:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

Nếu nhận lỗi `ECONNREFUSED 127.0.0.1:27017`, MongoDB chưa được cài/chưa chạy hoặc `MONGODB_URI` chưa đúng.

## Lưu ý an toàn

- App hiện phù hợp chạy trong máy hoặc mạng gia đình đáng tin cậy.
- Nếu mở ra Internet, đặt sau HTTPS reverse proxy, thêm rate-limit đăng nhập, xác minh email, CSRF token và backup định kỳ.
- Việc xóa trong web là **xóa vĩnh viễn**, không đưa vào Recycle Bin.
- Sao lưu `D:\photos` và database MongoDB `my_album`.
