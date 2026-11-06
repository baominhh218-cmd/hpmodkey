# KEYHUB — Website phát Key tự động

Website React/Vite, triển khai giao diện trên GitHub Pages và dùng Supabase làm cơ sở dữ liệu/backend.

## Tính năng
- Người dùng nhận từng Key tự động; Key đã phát được đánh dấu đã dùng và không phát lại.
- Giới hạn mặc định: tối đa 2 Key trên mỗi mã thiết bị trong cửa sổ 24 giờ.
- Admin đăng nhập bằng Supabase Auth.
- Admin thêm nhiều Key (mỗi dòng một Key), xem kho Key và lịch sử 100 lượt nhận gần nhất.
- RPC SQL cấp Key theo giao dịch và khóa hàng, tránh phát trùng khi có nhiều người nhấn cùng lúc.

## 1. Tạo Supabase
1. Tạo project tại https://supabase.com/.
2. Mở **SQL Editor**, chạy toàn bộ file `supabase/schema.sql`.
3. Vào **Project Settings → API** và lấy Project URL cùng `anon`/publishable key. Không dùng `service_role` key trong website.
4. Vào **Authentication → Users**, tạo tài khoản Admin bằng email và mật khẩu.
5. Mở SQL Editor, chạy lệnh dưới đây (thay email bằng email Admin vừa tạo):

```sql
insert into public.admin_users(user_id)
select id from auth.users where email = 'admin@example.com'
on conflict do nothing;
```

## 2. Chạy thử trên máy
Cài Node.js 20+.

```bash
npm install
cp .env.example .env
```

Điền `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Sau đó:

```bash
npm run dev
```

## 3. Đưa lên GitHub Pages
1. Tạo repository GitHub và tải toàn bộ source code này lên nhánh `main`.
2. Mở `vite.config.js`, đổi `REPLACE_WITH_REPO_NAME` thành đúng tên repository (nếu repo là `username.github.io` thì đặt `/`).
3. Vào **Settings → Secrets and variables → Actions → New repository secret**, tạo:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Vào **Settings → Pages**, chọn **GitHub Actions** làm Build and deployment source.
5. Push code lên `main`. GitHub Actions sẽ build và deploy website.

## Bảo mật và giới hạn quan trọng
- Không đưa Supabase `service_role` key vào frontend hoặc GitHub.
- Admin không được xác định bằng cách ẩn/hiện nút ở trình duyệt: quyền được kiểm tra bằng bảng `admin_users` và RLS ở database.
- Mã thiết bị hiện được tạo và lưu trong `localStorage`. Đây là giới hạn theo mã thiết bị của trình duyệt, **không phải nhận diện phần cứng bất biến**: người dùng có thể vượt giới hạn bằng cách xóa dữ liệu trình duyệt, đổi trình duyệt hoặc thiết bị. Muốn chống lạm dụng mạnh hơn cần thêm xác minh người dùng, CAPTCHA/rate-limit hoặc backend có cơ chế định danh đáng tin cậy.
- Bảng `claims` lưu lịch sử; bảng `keys` giữ cả Key đã phát với trạng thái `used` để Admin kiểm tra. Không xóa Key đã phát qua giao diện.
- Cấu hình email confirmation / password policy trong Supabase Authentication theo nhu cầu.
