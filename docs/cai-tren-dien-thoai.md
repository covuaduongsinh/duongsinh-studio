# Cài Dương Sinh Studio lên điện thoại Android và bật thông báo

Studio là ứng dụng web có thể cài lên màn hình chính (PWA): mở như một ứng dụng riêng, không thanh địa chỉ, và nhận
**Web push** khi có việc cần bạn quyết định. Cần HTTPS (production đã có: `https://studio.dsc.edu.vn/main`).

## Cài lên màn hình chính

1. Mở `https://studio.dsc.edu.vn/main` bằng **Chrome** và đăng nhập.
2. Bấm menu ⋮ → **Cài đặt ứng dụng** (hoặc **Thêm vào màn hình chính**). Chrome có thể tự hiện thanh "Cài đặt".
3. Xác nhận. Biểu tượng **Dương Sinh Studio** (nền xanh navy, vương miện) xuất hiện trên màn hình chính.

## Bật thông báo

1. Mở Studio từ biểu tượng vừa cài, vào **Cài đặt → Thông báo của tôi**.
2. Ở mục **Web push**, bấm bật cho thiết bị này và chọn **Cho phép** khi Android hỏi quyền thông báo.
3. Bấm gửi thử để kiểm tra. Thông báo "Việc cần tôi quyết định" sẽ nhắc bạn quay lại **Hộp thư**, nơi giữ mọi thứ.

## Khi không nhận được thông báo

- Quyền thông báo của Chrome hoặc của ứng dụng bị tắt: Cài đặt Android → Ứng dụng → Dương Sinh Studio (hoặc Chrome) → Thông báo.
- Tiết kiệm pin quá chặt có thể trì hoãn thông báo: đặt Chrome ở "Không hạn chế".
- Mỗi thiết bị đăng ký riêng; đổi `WEB_PUSH_PRIVATE_KEY` trên server thì mọi thiết bị phải bật lại (xem `docs/trien-khai-vps.md`).

## Cho người làm kỹ thuật

- Manifest: `public/manifest.webmanifest`, nối bằng `<link rel="manifest">` trong `index.html`. Mọi URL trong đó là **tương đối** (`./`,
  `assets/…`) để đúng với đường dẫn gốc `/main` do triển khai chọn; không viết `/main` vào đó.
- Biểu tượng `public/assets/pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png` và `apple-touch-icon.png` dựng từ `ds-mark.svg`.
  Đổi nhận diện thì dựng lại cả bốn.
- `tests/project/pwa-manifest.test.ts` kiểm manifest, kích thước thật của biểu tượng và liên kết trong trang.
- Chưa thử trên thiết bị thật: cần cài từ bản đã lên production rồi gửi thử một thông báo.
- iPhone: chỉ có `apple-touch-icon`; chưa có hướng dẫn riêng (chủ dự án dùng Android, 08/11/2026).
