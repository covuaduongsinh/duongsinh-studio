# Nhật ký phiên làm việc 08–09/11/2026: M2 lên production, driver Dokploy (M4.2) và NocoLMS chạy thật

Kế hoạch gốc: `docs/plans/2026-11-08-studio-hoan-thien-theo-tai-lieu.md` (mục "Tiến độ" ghi trạng thái từng bước; file này ghi
**việc đã làm, lỗi gặp và cách xử lý** của phiên). Không có bí mật nào trong file này.

## Kết quả

| Hạng mục                                                          | Trạng thái                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| M2 (tài khoản, mời thành viên, khoá API cá nhân, PWA…) production | Xong, `8568db3` (08/11)                                                                                |
| Nâng beta.89                                                      | Do phiên khác đưa lên (`0320f6e`)                                                                      |
| M4.2 driver `dokploy` + migration `ds_nb3_apps`                   | Xong, production `17c3843` (09/11)                                                                     |
| Sửa driver sau lần deploy thật đầu tiên                           | `4eb458c` (biến `APP_PUBLIC_ORIGIN`), `8465cbb` (hard link trong archive)                              |
| NocoLMS (`nocolms.dsc.edu.vn`)                                    | **Chạy thật**: trang 200, chứng chỉ Let's Encrypt, API bảo vệ trả 401 khi chưa đăng nhập, ~212 MiB RAM |
| Studio production hiện tại                                        | `8465cbb`                                                                                              |

## Việc đã làm, theo thứ tự

1. **Đưa M2 lên production** (`8568db3`): sao lưu DB, tạm dừng tự lái, chờ không còn run chạy, đổi `STUDIO_RELEASE`, kiểm,
   bật lại tự lái. Dọn bản cũ trên VPS (giữ 3 bản mới nhất).
2. **PR #39** ghi tiến độ M2; sau đó dọn bản phát hành cũ.
3. **M4.1 → M4.2**: chủ dự án chốt tên miền cố định từng app (không wildcard), `maxApps` = 1, tự dừng sau 30 phút, staging chỉ
   bật khi cần, app đầu tiên là NocoLMS, cho phép khoá Dokploy hiện có tạo/sửa/xoá compose theo allowlist.
4. **PR #40 – driver `dokploy`** (`server/releases/dokploy-driver.ts`, `nb3-compose.ts`, `extract.ts`,
   `server/providers/nb3-apps.ts`, migration `202611110001_ds_nb3_apps`, client Dokploy có allowlist `nb3-*` tách khỏi
   preview NB2). Test với Dokploy giả. Lệch hợp đồng driver ghi ở `docs/chenh-lech-upstream.md` §33.
5. **PR #41**: bản build đầu bị chặn vì `tar` nằm ở `devDependencies` trong khi code server import nó; chuyển sang
   `dependencies` (sửa tay đoạn lockfile, kiểm `pnpm install --frozen-lockfile`).
6. **Production `17c3843`** (driver + migration): phải chờ vì "Khởi tạo dự án" của một dự án mới chạy nối tiếp ~2 giờ; một
   script bắt khoảng trống không còn run `running`/`dispatched` rồi sao lưu và đổi bản. **PR #42** ghi tiến độ.
7. **Hạ tầng NocoLMS**: chủ dự án thêm bản ghi A `nocolms.dsc.edu.vn → 217.15.160.118` ở Mắt Bão và tạo
   `/srv/duongsinh-studio/storage/nb3-apps` (chown 1000).
8. **Kết nối repo `covuaduongsinh/nocolms` qua GitHub App** "Duong Sinh Studio" (đã cấp "All repositories"); liên kết trong Studio.
9. **Mã NocoLMS không build được và có route không xác thực** → **PR #2 trên `nocolms`**:
   - 12 lỗi kiểu (thiếu `@types/qrcode`, import `@nocobase/server`, `app` không có kiểu, `container.get` không tồn tại);
   - các route chứng nhận, thăng cấp, lịch báo cáo, trợ lý AI chưa có `auth.required()`/kiểm tra quyền; nay bắt buộc phiên
     đăng nhập + một action LMS (nhân viên: `lms.reports view`; admin: `lms.courses assignTeacher`); tra cứu chứng nhận theo
     mã vẫn công khai; người đề xuất/người duyệt/chủ hạn mức AI lấy từ phiên, không từ nội dung gửi lên hay header `x-user-id`;
   - các route trước đó **không lưu được gì** (gọi `db.query()`/`getRepository()` không tồn tại trên `DatabaseManager`),
     nay dùng query builder của kết nối `main`; `LmsNotifier` đăng ký một lần (`lmsNotifierToken`); báo cáo tuần đọc đúng cột
     `parentId`;
   - test mới `tests/server/lms-protected-routes.test.ts` (401, 403, giáo viên/admin, duyệt thăng cấp sinh chứng nhận).
10. **Quyền để tạo môi trường/app**: khoá API cá nhân không giữ quyền quản trị (`Settings (not provided)`) và trang khoá tổ
    chức từ chối mọi khoá API; chủ dự án tự tạo môi trường `nocolms` (driver `dokploy`) và app `nocolms` trong giao diện.
    Hướng dẫn ban đầu của tôi (tick quyền trong vai trò `ds-admin`) sai: các action `rel.*` không có trong giao diện vai trò.
11. **Tải build lên** bằng `ds-studio release upload` + POST kèm ticket (lần đầu 502 do gateway, lần hai 200): bản phát hành
    `730e8f40-141e-4f15-b2e1-1635d2ba9bb2`, commit `7e05800`, 74 MB.
12. **Deploy thất bại lần 1** → **PR #43** (`4eb458c`): Studio sinh sẵn `APP_PUBLIC_ORIGIN` và đưa cho driver, driver lại từ
    chối mọi biến trùng tên với biến nó tự đặt. Nay bỏ qua khi giá trị đúng bằng giá trị driver đặt, vẫn từ chối giá trị khác.
13. **Deploy lần 2** tạo compose `nb3-nocolms` và Traefik cấp chứng chỉ, nhưng container lỗi `ERR_MODULE_NOT_FOUND` →
    **PR #44** (`8465cbb`): archive có ~2000 hard link do pnpm tạo trong `dist/node_modules` mà bộ giải nén bỏ hết mọi link.
    Nay nhận hard link trỏ vào trong `dist/`, vẫn từ chối symlink và link ra ngoài.
14. **Deploy lần 3–5**: thư mục giải nén hỏng bị tái dùng (driver bỏ qua giải nén khi đã có `dist/`) → xoá tay; Docker đã tạo
    `config.yml` thành thư mục rỗng (EISDIR) → xoá tay; volume `storage` thuộc root nên SQLite không mở được
    (`SQLITE_CANTOPEN`) → `chown 1000:1000` volume của app này. Sau đó app lên.

## Các đợt production trong phiên

| Bản       | Nội dung                     | Sao lưu                                 |
| --------- | ---------------------------- | --------------------------------------- |
| `8568db3` | M2                           | `studio-before-8568db3-20261109_002052` |
| `17c3843` | Driver `dokploy` + migration | `studio-before-17c3843-20261109_044205` |
| `4eb458c` | Sửa `APP_PUBLIC_ORIGIN`      | `studio-before-4eb458c-20261109_165056` |
| `8465cbb` | Sửa giải nén hard link       | `studio-before-8465cbb-20261109_173445` |

Mỗi đợt: sao lưu `pg_dump`, tạm dừng tự lái Sandbox với lý do `Cập nhật Studio (<sha>)`, chờ khoảng trống không có run
`running`/`dispatched`, đổi `STUDIO_RELEASE` qua Dokploy, kiểm (healthz, mount, manifest 200, 0 lỗi mức 50,
`nocobase.dsc.edu.vn` 302, runner online), bật lại tự lái. Bản cũ giữ trên VPS: `0320f6e`, `17c3843`, `4eb458c`, `8465cbb`,
`8568db3` (cần dọn về 3 bản mới nhất).

## Sai sót của tôi trong phiên (để tránh lặp lại)

- Lỡ in chuỗi khoá API cá nhân của CLI ra phiên làm việc khi kiểm tra cấu hình (đã báo chủ dự án, khuyến nghị **xoay khoá**:
  Tài khoản của tôi → Khoá API cá nhân → Xoay, rồi `ds-studio login --api-key-stdin`). Ticket tải lên một lần cũng từng bị in
  (hết hạn trong vài phút). Lần sau chỉ đọc bí mật vào biến, không in.
- Hướng dẫn chủ dự án sai chỗ hai lần (trang khoá tổ chức, rồi tick quyền trong vai trò) vì chưa đọc mã trước khi hướng dẫn.
- Driver chưa chạy trên Dokploy thật nên ba lỗi (biến, hard link, chủ volume) chỉ lộ ở lần deploy thật; test với Dokploy giả
  không bắt được.
- Máy dev dùng `gh.exe` (Windows) nên bản clone có CRLF; đã chuẩn hoá và đẩy bằng token của `gh`, không in token.

## Còn lại

- PR sửa driver: chown volume tự động, đánh dấu giải nén xong, báo lỗi deploy khi container không lên (xem mục Tiến độ).
- NocoLMS: đăng nhập thật, tự dừng sau 30 phút không dùng, nút Bật/Dừng thủ công trong giao diện (khoá API không có
  `rel.apps/operate`), dọn route `/lmsAttachments/*` chưa có `describeRoute`, thêm action phân quyền riêng cho chứng nhận/thăng cấp.
- M4.3–M4.5, M5 theo kế hoạch gốc; chưa kiểm: các luồng M2 với người dùng thật, PWA/push trên Android thật.
- Quyền khoá API: không nâng quyền cho khoá; việc cần quyền quản trị làm trong giao diện bằng phiên đăng nhập.
