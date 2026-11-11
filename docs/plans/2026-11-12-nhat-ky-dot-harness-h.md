# Nhật ký đợt H: hoàn thiện harness của Dương Sinh Studio (11–12/11/2026)

Kế hoạch gốc: `docs/plans/2026-11-10-studio-harness-H.md` (mục 9 "Tiến độ" đã tick toàn bộ H0–H3b). Lệnh giao việc:
`docs/plans/2026-11-10-prompt-trien-khai-harness-H.md`. Toàn bộ 11 bước đã được triển khai theo quy trình nghiêm ngặt:
mỗi bước một nhánh riêng, một PR vào `main`, squash merge sau khi 3/3 job CI xanh (`static`, `test (client project)`, `test (node project)`).
Các điểm chênh lệch so với upstream được ghi nhận tại `docs/chenh-lech-upstream.md` §43–§53.

---

## 1. Các PR đã hoàn thành và gộp vào `main`

| Bước    | PR  |  Commit   | Nội dung kỹ thuật chính                                                                                                                                                                                                                                                                                                                                                                                                              |
| :------ | :-: | :-------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H0**  | #69 | `c2efe69` | **Nâng phiên bản skill dựng sẵn**: Bổ sung `revision` vào metadata của skill (`ds-workflow`, `ds-review`, `ds-development`). `ensureBuiltinSkills` tự động nâng cấp các skill chưa bị sửa tay và gửi thông báo In-app Inbox cho quản trị viên nếu có xung đột sửa đổi.                                                                                                                                                               |
| **H1a** | #70 | `8a6708c` | **Tiêu chí có cấu trúc**: Migration `202611110003_ds_issue_criteria` tạo bảng `dsIssueCriteria`. Hỗ trợ 4 loại tiêu chí (`test`, `command`, `review`, `artifact`). Tích hợp giao diện quản lý tiêu chí ngay trong trang chi tiết việc, tự động đưa checklist vào đề bài của agent.                                                                                                                                                   |
| **H1b** | #71 | `41cfd79` | **Lượt Kiểm chứng và cổng `in_review`**: Migration `202611110004_ds_verifications` tạo bảng `dsVerifications`. Cổng `mayMove` tại `server/providers/agent-executor.ts` chặn agent chuyển việc sang `in_review` nếu chưa có lượt kiểm chứng đạt (`passed = true`) với đúng mã `headSha`. Báo người sau 2 lần thất bại liên tiếp.                                                                                                      |
| **H1c** | #72 | `4b09ec4` | **Review theo tiêu chí**: Migration `202611110005_ds_review_criteria_checks` tạo bảng `dsReviewCriteriaChecks`. Nâng cấp route `POST /api/reviews` và service review; bắt buộc đánh giá từng tiêu chí, cấm trả về `verdict = 'approve'` nếu có bất kỳ tiêu chí nào chưa đạt. Giao diện xem chi tiết kết quả từng tiêu chí trong Cài đặt / Chi tiết việc.                                                                             |
| **H1d** | #73 | `97bb526` | **Cổng xác định trước review**: Kiểm soát 3 điều kiện tiên quyết trước khi mở phiếu review hoặc chuyển việc: (1) Nhánh git sạch không xung đột; (2) Toàn bộ jobs CI GitHub Actions xanh; (3) Quét mã diff không chứa chuỗi nghi là bí mật. Chặn tình trạng review diff dở dang hoặc review khi CI còn đỏ.                                                                                                                            |
| **H4**  | #74 | `2c2a0bf` | **Bộ đo Harness**: Migration `202611110006_ds_bench` tạo bảng `dsBenchRuns` và `dsBenchTasks`. Bộ 10 bài test chuẩn đo lường năng lực agent (`server/bench/sets/ds-core/`). Tuyến API `POST /api/bench/run` và giao diện giám sát Benchmark trên Dashboard tổng.                                                                                                                                                                     |
| **H2a** | #75 | `c7c64a7` | **Vòng học từ lỗi**: Migration `202611110007_ds_lessons` tạo bảng `dsLessons`. Khi một phiếu review bị `reject` hoặc `request_changes`, hệ thống tự động trích xuất nguyên nhân và đề xuất bài học kinh nghiệm (`proposed`). Trang Cài đặt / Bài học kinh nghiệm cho phép admin duyệt (`applied`) hoặc từ chối. Bài học có hiệu lực được tự động đưa vào prompt ngữ cảnh của agent.                                                  |
| **H2b** | #76 | `6c1cce8` | **Bài học đầu tiên và cảnh báo bí mật**: Seed `202611110001_ds_initial_lesson` nạp bài học bảo mật đầu tiên (cấm đưa API keys vào mô tả việc/bình luận). Migration `202611110008_ds_secret_findings` tạo bảng `dsSecretFindings`. Bộ quét regex nhận diện token (`server/security/secret-patterns.ts`). Tự động che chuỗi bí mật bằng `[NGHI LÀ BÍ MẬT]`, gửi cảnh báo In-app Inbox và hiển thị banner cảnh báo trên đầu trang việc. |
| **H2c** | #77 | `3ff3948` | **Báo cáo tuần học từ lỗi**: Bổ sung `ReportFigures.learning(scope, days)` vào `server/reports/service.ts`. Tổng hợp số lượng bài học mới, phát hiện bí mật, top tiêu chí hay thất bại và lỗi lặp lại (xuất hiện >= 2 lần/tuần). Tuyến API `GET /api/reports/learning` và tự động gửi thông báo tổng kết tuần sáng thứ Hai qua In-app Inbox.                                                                                         |
| **H3a** | #78 | `7d3d33e` | **Playbook và quy trình chuẩn**: Migration `202611110009_ds_playbook_invocations` tạo bảng `dsPlaybookInvocations`. Bốn playbook chuẩn đầu tiên: `!nang-template`, `!tao-app-nocobase`, `!nhap-lark`, `!deploy-dokploy`. Tự động chép tiêu chí mặc định và hướng dẫn quy trình vào việc khi người dùng gọi cú pháp `!<slug>`. Trang Cài đặt / Playbooks hiển thị danh sách và lịch sử thực thi.                                      |
| **H3b** | #79 | `7d1625f` | **Đo runner và đề xuất giới hạn**: Dịch vụ `server/runner/service.ts` đo thời gian chạy (trung vị, P95) và ước tính đỉnh RAM (~1.85 GiB). Tuyến API `GET /api/runner/recommendations`. Tài liệu `docs/runner-resource-limits-proposal.md` đề xuất cấu hình drop-in `MemoryHigh=2.0GiB` trên `user-1002.slice` để chống OOM-killer đột ngột và thiết lập proxy allowlist 5 domain thiết yếu.                                          |

---

## 2. Triển khai Production Dokploy (12/11/2026)

- **Bản phát hành**: `7d1625f` (commit `main` sau PR #79).
- **Môi trường build**: Thực hiện trên máy dev môi trường WSL Ubuntu Linux x64 (`node v24.14.1`, `pnpm 11.7.0`) bằng lệnh:
  `pnpm build --target linux-x64 --node-version 24`.
  - Toàn bộ native binaries cho Linux x64 (`@napi-rs/canvas-linux-x64-gnu`, `better-sqlite3`, `sqlite-vec-linux-x64`) được liên kết chính xác.
  - Lệnh `pnpm nocobase dist check` xác nhận đạt 35/35 dependencies server.
  - Đóng gói thành `studio-7d1625f.tar.gz` (84 MB) và truyền lên VPS qua SSH/SCP.
- **Bảo toàn dữ liệu trước deploy**:
  - Xác nhận hàng đợi runner yên tĩnh: không có run nào ở trạng thái `running` trên `ag_runs`.
  - Chụp snapshot cơ sở dữ liệu dự phòng trước deploy: `/srv/duongsinh-studio/backups/studio-before-7d1625f-20261112_014230.dump` (17 MB, đọc và kiểm tra toàn vẹn).
- **Áp dụng bản phát hành trên VPS**:
  - Giải nén tarball vào `/srv/duongsinh-studio/releases/7d1625f/dist`, phân quyền sở hữu `1000:1000` (`hermesui:hermesui`).
  - Cập nhật biến môi trường `STUDIO_RELEASE="7d1625f"` trong `/etc/dokploy/compose/duongsinh-studio-tluxoy/code/.env` và bảng `compose` của Dokploy.
  - Tái tạo container ứng dụng: `duongsinh-studio-tluxoy-app-1`.
- **Thực thi Migration cơ sở dữ liệu thật**:
  - Bảy migration của đợt H đã tự động chạy thành công lúc 02:14:49–02:14:52 ngày 12/11/2026:
    1. `202611110003_ds_issue_criteria`
    2. `202611110004_ds_verifications`
    3. `202611110005_ds_review_criteria_checks`
    4. `202611110006_ds_bench`
    5. `202611110007_ds_lessons`
    6. `202611110008_ds_secret_findings`
    7. `202611110009_ds_playbook_invocations`
  - Dữ liệu hạt giống bài học bảo mật ban đầu `lesson-initial-secrets` đã có mặt trong bảng `ds_lessons`.
- **Dọn dẹp phiên bản cũ trên VPS**:
  - Giữ đúng 3 thư mục phát hành mới nhất: `7d1625f` (đang mount chạy), `1ef3baf` và `c419bdd` (dự phòng rollback).
  - Đã xoá bản cũ `97a8f12` và xoá tarball đã giải nén trong `incoming/`.

---

## 3. Kiểm chứng vận hành thực tế

- **Trạng thái container**: `Status=running, Health=healthy`.
- **Mount thư mục**: `/srv/duongsinh-studio/releases/7d1625f/dist` (chỉ đọc).
- **Trang chủ**: `GET https://studio.dsc.edu.vn/main/` trả về HTTP 200, nạp client bundle đầy đủ.
- **Endpoint kiểm tra sức khỏe**: `GET https://studio.dsc.edu.vn/main/api/healthz` trả về:
  ```json
  {
    "ok": true,
    "app": { "name": "main", "basePath": "/main" },
    "basePath": "/main"
  }
  ```
- **Endpoint API mới**: `GET https://studio.dsc.edu.vn/main/api/runner/recommendations` trả về HTTP 401 khi chưa xác thực, xác nhận bảo mật hoạt động đúng chuẩn.

---

## 4. Lưu ý quan trọng cho các phiên làm việc tiếp theo

1. **Quy trình Build Linux Production**:
   - Khi chạy trên máy phát triển Windows, lệnh `pnpm build --target linux-x64` trên Windows shell sẽ không tải được các gói native binaries đặc thù của Linux (`@napi-rs/canvas-linux-x64-gnu`, `sqlite-vec-linux-x64`).
   - Do đó, **bắt buộc chạy lệnh build production bên trong môi trường WSL Ubuntu Linux x64**:
     ```bash
     wsl -d Ubuntu -- bash -c "cd ~/code/duongsinh-studio && pnpm build --target linux-x64 --node-version 24"
     ```
2. **Kiểm tra phân quyền Client Routes (Page Authorization Pinning Test)**:
   - Khi bổ sung bất kỳ route nào thuộc Cài đặt hệ thống (`client/routes.ts`), phải cập nhật đồng bộ các bài test `tests/client/client-routes.test.ts` (`settingsAuthorizations`) và `tests/client/foundation-integration.test.ts` (`settingsAi`) để tránh làm CI bị đỏ.
3. **Thao tác Git và Commit**:
   - Stage theo đường dẫn từng file cụ thể (`git add <file>`), tuyệt đối không dùng `git add -A` hay `git add .`.
   - Commit bằng file nội dung tạm (`git commit -F <file>`), format Conventional Commits bằng tiếng Anh, không thêm Co-Authored-By.
4. **Vấn đề còn mở (Chờ quyết định của Chủ dự án)**:
   - **Q7 (Giới hạn tài nguyên runner)**: Đề xuất thêm `MemoryHigh=2.0GiB` trên `user-1002.slice` tại VPS `217.15.160.118` đang chờ chủ dự án phê duyệt (xem chi tiết tại `docs/runner-resource-limits-proposal.md`).
   - **Sao lưu DB ra ngoài**: Cấu hình rclone đẩy bản dump DB ra ngoài VPS vẫn chưa bật (chờ cấp tài khoản S3/remote).
