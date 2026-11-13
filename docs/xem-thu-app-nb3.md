# Xem thử (preview) theo PR cho app NocoBase 3 (M4.3)

Mỗi repo app NB3 (ví dụ `covuaduongsinh/nocolms`) có **một App xem thử cố định**: môi trường `preview`, một tên miền riêng
(ví dụ `nocolms-preview.dsc.edu.vn`, một bản ghi A, không wildcard), `maxApps` 1, tự dừng khi **30 phút không có request** tới tên miền của app (daemon đọc nhật ký truy cập Traefik, `accessLog` trong `config.json`); khi daemon chưa cài hoặc chưa cấu hình nhật ký thì vẫn là 30 phút **kể từ lúc bật** (xem `docs/trien-khai-vps.md`, V5.1b). Vì chỉ có
một App nên chỉ một PR được xem thử tại một thời điểm; PR mới thay bản của PR cũ.

## Ai làm gì

| Bước                                       | Ai                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dựng `dist` cho PR có nhãn `preview`       | **GitHub Actions của repo app** (mẫu bên dưới). Studio không build.                                                                                               |
| Tải archive lên App xem thử và deploy      | Workflow, bằng khoá API có phạm vi **chỉ App xem thử** (`upload` + `deploy`), kèm nhãn bản phát hành `pr=<số PR>` và `sha=<commit>`.                              |
| Dừng khi PR đóng hoặc bị gỡ nhãn `preview` | **Studio** (`server/releases/nb3-preview.ts`): nhận webhook `pull_request`, chỉ dừng khi bản đang chạy có nhãn `pr` đúng số PR đó; bản của PR khác không bị đụng. |
| Xoá hẳn App xem thử                        | Không tự động. App xem thử là App cố định, chỉ dừng.                                                                                                              |

## Việc chủ dự án làm một lần cho mỗi repo

1. Bản ghi A `<app>-preview.dsc.edu.vn` → `217.15.160.118` (Mắt Bão).
2. Trong Studio: môi trường `preview` (driver `dokploy`, `hosts` có `<app>-preview` → tên miền ở trên, `maxApps` 1, tự dừng 30), App
   `<app>-preview`, rồi trong trang repo gán App đó cho môi trường `preview`.
3. Khoá CI của repo (`ds-studio build ci setup --reveal`, hoặc trang repo): từ 12/11/2026 khoá **chỉ chạm các App đã gán cho repo đó** (`releases.apps` giới hạn theo App), quyền `upload`, hạn **90 ngày** (trước đó mọi App, 365 ngày). Cần gán App cho repo **trước** khi làm khoá; gán thêm App sau đó thì chạy `ci rotate` để có khoá mới (khoá cũ ngừng ngay). Lưu thành secret `DS_STUDIO_API_KEY` của repo app, cùng `STUDIO_URL`. Muốn workflow tự deploy thì khoá cần mức `admin` (hiện Studio chỉ cấp `write`).
4. Thêm workflow mẫu bên dưới vào `.github/workflows/preview.yml` của repo app (đẩy file workflow cần token có quyền Workflows).

## Workflow cho repo app

Từ V5.3 chỉ còn **một** mẫu, do Studio sinh theo vai trò của app (`server/setups/ci-workflow.ts`, `nb3AppWorkflow`): xem tệp trả về khi đăng ký
(Phát hành → Đăng ký app, hoặc `GET /api/repositoryDeployments/{id}/ciWorkflow`). Nó build `dist` cho linux-x64, đóng gói với
`--exclude '*/.bin' --exclude dist/.env`, xin vé tải lên của plugin `releases` (`POST /api/releases/apps/{appId}/uploadTickets`), rồi gửi
`dist.tar.gz` tới `path` trong câu trả lời với `X-Artifact-SHA256`, `X-Release-Deploy` và nhãn `pr`/`sha`:

- `preview`: PR có nhãn `preview`, một lượt mỗi lúc (`concurrency`), deploy ngay;
- `staging`: push vào nhánh mặc định, deploy ngay;
- `production`: push vào nhánh mặc định, **chỉ tải lên** (môi trường được bảo vệ từ chối vé deploy; chủ dự án duyệt yêu cầu deploy).

Đường dẫn ticket/upload/header đã đối chiếu với nguồn route của plugin `releases` (13/11/2026); khoá CI mức `write` đủ để upload và deploy (README plugin).
Tên secret là `DS_STUDIO_API_KEY`; địa chỉ Studio nằm sẵn trong tệp, không cần secret `STUDIO_URL`. Route cũ `/api/builds/deploy` (luôn trả `APP_HOST_OFF`) đã bị bỏ;
`/api/builds/uploadTickets` còn cho workflow đã đẩy từ trước.

Lỗi build hiện trong tab Actions của PR; báo vào Hộp thư và push là phần còn lại của M4.3.
