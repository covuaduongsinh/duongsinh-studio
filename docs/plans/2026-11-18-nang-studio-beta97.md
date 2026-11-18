# Kế hoạch: Nâng Dương Sinh Studio lên NocoBase 3 (Template beta.97 và plugin đồng bộ) — 18/11/2026

> Trạng thái: **Đang triển khai (18/11/2026)**.
> Mốc commit gốc trên `main`: `854e4c2` (cây làm việc sạch).
> Kênh phát hành: `beta` (chính thức từ NPM Registry).
> Baseline: `@nocobase/app-template-default@1.0.0-beta.89`
> Target: `@nocobase/app-template-default@1.0.0-beta.97`
> Tài liệu liên quan: `AGENTS.md`, `.agents/rules/duongsinh-studio.md`, `.agents/skills/nocobase-app-upgrade/SKILL.md`, `docs/plans/2026-11-08-nang-studio-beta89.md`, `docs/chenh-lech-upstream.md`, `docs/nang-cap.md`.
> Tiền tố bước: **N** (Nâng cấp template).

---

## 0. Bối cảnh & Mục tiêu

- Upstream NocoBase vừa phát hành template `@nocobase/app-template-default` phiên bản `1.0.0-beta.97` cùng bộ cập nhật của các gói lõi framework và plugin.
- Dương Sinh Studio hiện đang ở template `1.0.0-beta.89`.
- Quá trình rà soát đối chiếu được thực hiện qua các tarball tải từ NPM Registry vào thư mục tạm (`$TEMP/nb-upgrade-work/`), so sánh 3 chiều: BASE (beta.89) → TARGET (beta.97) → PROJECT (Dương Sinh Studio).
- Mục tiêu đợt nâng cấp:
  1. Hợp nhất template từ BASE `1.0.0-beta.89` lên TARGET `1.0.0-beta.97` theo đúng quy trình của skill `nocobase-app-upgrade` (merge theo từng file, bảo toàn toàn bộ tuỳ biến của Dương Sinh Studio).
  2. Nâng đồng bộ các plugin lõi và plugin riêng của Studio:
     - `@nocobase/app-plugin-agents`: `2.0.0-beta.6` → `2.0.0-beta.16`
     - `@nocobase/app-plugin-projects`: `0.1.0-beta.26` → `0.1.0-beta.33`
     - `@nocobase/app-plugin-releases`: `0.1.0-beta.19` → `0.1.0-beta.26`
     - `@nocobase/app-plugin-agent-sessions`: `1.0.0-beta.19` → `1.0.0-beta.22`
     - `@nocobase/agent-runner`: `0.1.0-beta.23` → `0.1.0-beta.30`
     - `@nocobase/agent-protocol`: `0.1.0-beta.16` → `0.1.0-beta.20`
     - `@nocobase/app-skills`: `0.1.0-beta.60` → `0.1.0-beta.68`
     - Các gói lõi framework khác (`app-client`, `app-server`, `db`, `realtime`, `foundation`, `users`, v.v.).
  3. Bảo toàn 100% bản sắc và quy tắc Dương Sinh Studio:
     - Giữ nguyên trang chủ Today (`client/pages/home/index.tsx`) và hook `use-today.ts`.
     - Giữ nguyên các chức năng quản trị Studio: reset password, badge số lượng, StudioChatProvider, RBAC.
     - Giữ nguyên các cấu hình toolchain (`@rollup/wasm-node`, cổng dev 13100, v.v.).
  4. Đồng bộ kết quả vào repository ở local và đẩy lên GitHub.

---

## 1. Kết quả phân tích đối chiếu

### 1.1 Thống kê thay đổi template (BASE .89 → TARGET .97)

- **32 file mới thêm (Added in TARGET)**:
  - Tính năng Database Explorer trong System Settings:
    - `client/pages/settings/database-explorer/index.tsx`
    - `client/pages/settings/database-explorer/routes.ts`
    - `client/pages/settings/database-explorer/feedback.tsx`
    - `client/pages/settings/database-explorer/fields.tsx`
    - `client/pages/settings/database-explorer/tables.tsx`
    - `client/pages/settings/database-explorer/name.tsx`
    - `client/pages/settings/database-explorer/model.ts`
    - `client/pages/settings/database-explorer/read.ts`
    - `client/pages/settings/database-explorer/en-US.ts`
    - `client/pages/settings/database-explorer/zh-CN.ts`
  - Chuẩn UI DataTable & RowActions mới:
    - `client/components/row-actions.tsx`
    - `client/components/discard-guard.tsx`
    - `client/components/data-table/search.tsx`
    - `client/components/data-table/filters.tsx`
    - `client/components/data-table/sort-menu.tsx`
    - `client/hooks/use-data-changes.ts`
  - Cấu hình server mới:
    - `server/config/foundation.ts`
    - `server/config/realtime.ts`
  - Asset & Workflow extensions:
    - `client/extensions/nocobase-workflow-management/version-select.tsx`
    - `public/assets/favicon.svg`
    - `LICENSE.txt`
  - 11 file test & fixture mới:
    - `tests/client/database-explorer.test.tsx`
    - `tests/client/database-explorer-integration.test.tsx`
    - `tests/client/data-changes.test.tsx`
    - `tests/client/data-table-cards.test.tsx`
    - `tests/client/notification-template-address.test.tsx`
    - `tests/client/page-header.test.tsx`
    - `tests/client/row-actions.test.tsx`
    - `tests/project/bootstrap-loading.test.ts`
    - `tests/server/backends-config.test.ts`
    - `tests/server/drive-upload-limits.test.ts`
    - `tests/server/realtime-config.test.ts`

- **2 file bị xoá (Removed in TARGET)**:
  - `client/pages/home/capabilities.ts`
  - `client/pages/home/prompt-dialog.tsx`
  (Cả hai file này vốn thuộc trang home mẫu cũ của template; Studio đã chuyển sang trang Today từ plan V1.1 nên không bị ảnh hưởng).

- **45 file Studio chưa sửa (Untouched in Studio)**:
  - Sao chép trực tiếp từ TARGET .97 (bao gồm các UI component chuẩn `data-table/*`, `list-feedback`, `page-header`, `page-container`, `route-overlay`, các routing boundary, system locales, config mail/auth/jobs/queue, và các bài test tương ứng).

- **18 file Studio đã tùy biến (Customized in Studio)**:
  Bắt buộc hợp nhất thủ công (manual merge):
  1. `.agents/rules/components.md`: Thêm quy tắc chuẩn `RowActions` từ `#components/row-actions`.
  2. `.agents/rules/shell.md`: Thêm mục Database Explorer & Capability Guide trong Cài đặt hệ thống.
  3. `AGENTS.md`: Cập nhật ghi chú thẻ Database Explorer.
  4. `client/lib/navigation-transform.ts`: Hợp nhất xử lý `activeRouteKeys` cho Capability Guide và thuộc tính `startGroup`.
  5. `client/pages/home/index.tsx`: **Giữ nguyên 100% trang Today của Studio**.
  6. `client/pages/settings/page-permission-titles.ts`: Thêm ánh xạ quyền `notificationTemplate`.
  7. `client/pages/settings/users.tsx`: Đổi menu thao tác người dùng sang `RowActions`, đồng thời giữ nguyên action `ResetPasswordAction` của Studio.
  8. `client/plugins.ts`: Cập nhật cấu hình plugin `foundation` (`manifest: applicationManifest`, `guideSettingsPath: '/settings'`).
  9. `client/routes.ts`: Bổ sung `databaseExplorerRoutes` vào danh sách routes.
  10. `index.html`: Cập nhật cấu trúc màn hình nạp (`role="progressbar"`, bỏ nhãn tiếng Anh cứng) trong khi giữ nguyên nhận diện Dương Sinh Studio.
  11. `package.json`: Nâng phiên bản template lên `1.0.0-beta.97`, cập nhật dải phiên bản plugin và dependencies.
  12. `server/config/index.ts`: Bổ sung nạp cấu hình `realtime` và `foundation`.
  13. `tests/client/client-routes.test.ts`: Cập nhật kiểm tra danh sách routes có `databaseExplorer`.
  14. `tests/client/foundation-integration.test.ts`: Đồng bộ các kiểm tra tích hợp foundation mới.
  15. `tests/client/home.test.tsx`: Giữ nguyên kiểm tra giao diện Today của Studio.
  16. `tests/client/layout-i18n.test.tsx`: Cập nhật test đổi ngôn ngữ layout theo upstream.
  17. `tests/client/settings-navigation.test.ts`: Thêm test định tuyến thẻ Database Explorer trong Cài đặt hệ thống.
  18. `vitest.config.ts`: Cập nhật cấu hình chạy song song các test.

---

### 1.2 Phân tích di trú cơ sở dữ liệu (Database Migrations)

Các migration mới phát sinh từ các gói plugin được nâng cấp:
1. `@nocobase/app-plugin-agents`:
   - `202611080002_ag_run_failure_params.js`: Thêm cột JSON `failureParams` (nullable) vào bảng `agRuns`.
   - `202611090001_ag_runner_preference.js`: Thêm cột chuỗi `runnerPreference` (nullable) vào bảng `agChatPreferences` và `agRuns`.
   - `202611110001_ag_runner_quota_limits.js`: Thêm cột JSON `quotaLimits` (nullable) vào bảng `agRunners`.
2. `@nocobase/app-plugin-projects`:
   - `202611110001_pm_issue_assignee_indexes.js`: Tạo chỉ mục `idx_pm_issues_executor` trên cột `executorType`, `executorId` của bảng `pmIssues`.
3. `@nocobase/app-plugin-releases`:
   - `202611130001_rel_apps_environment_created_index.js`: Tạo các chỉ mục `rel_apps_environment_created_id` và `rel_apps_created_id` trên bảng `relApps`.

**Đánh giá an toàn DB**: Toàn bộ migration chỉ thêm cột nullable hoặc chỉ mục phụ, không sửa/xoá dữ liệu cũ, có hàm `down` đảo ngược đầy đủ, 100% tương thích ngược và không gây lock bảng nguy hiểm.

---

### 1.3 Wire Protocol Version

- Gói `@nocobase/agent-protocol` nâng từ `0.1.0-beta.16` lên `0.1.0-beta.20`.
- Hằng số `PROTOCOL_VERSION` đổi thành `16` (trong đó `MIN_PROTOCOL_VERSION = 3`).
- Gói `@nocobase/agent-runner` nâng lên `0.1.0-beta.30`.
- Cần cập nhật hằng số trong các file test server giả lập runner từ `14` lên `16`.

---

## 2. Các bước thực hiện chi tiết (N1 → N7)

### N1 — Tạo nhánh làm việc và chuẩn bị
- Tạo nhánh git `template-upgrade-1.0.0-beta.97` từ `main`.

### N2 — Cập nhật dependencies trong `package.json`
- Nâng `version` và `nocobase.defaultTemplateVersion` lên `1.0.0-beta.97`.
- Cập nhật toàn bộ các gói dependencies và devDependencies theo đúng bản phát hành TARGET và plugin đi kèm.

### N3 — Cài đặt gói, đồng bộ skills và kiểm tra lockfile
- Chạy `pnpm install`.
- Chạy `git diff package.json` để kiểm tra theo quy tắc Dương Sinh Studio: đảm bảo không bị tự động hạ cấp gói lõi hay chuyển gói client vào dependencies.
- Đồng bộ kỹ năng: `pnpm nocobase skills sync`.

### N4 — Hợp nhất mã nguồn
- Sao chép 32 file mới từ TARGET vào cây làm việc.
- Sao chép 45 file untouched từ TARGET vào cây làm việc.
- Tiến hành hợp nhất thủ công 18 file customized (đặc biệt bảo toàn Today, RBAC, ResetPasswordAction).

### N5 — Kiểm tra và thực thi di trú cơ sở dữ liệu
- Chạy kiểm tra di trú trên cơ sở dữ liệu dev: `pnpm nocobase db migrate`.
- Xác nhận các cột và chỉ mục mới được tạo thành công.

### N6 — Kiểm tra chất lượng (Verification Gates)
- `pnpm typecheck`: Kiểm tra TypeScript nghiêm ngặt.
- `pnpm lint`: Kiểm tra eslint.
- `pnpm vitest run tests/client/`: Kiểm tra toàn bộ test client.
- `pnpm vitest run tests/server/`: Kiểm tra toàn bộ test server.
- `pnpm vitest run tests/project/ tests/database/`: Kiểm tra an toàn project và DB.

### N7 — Commit và đồng bộ lên GitHub
- Commit các thay đổi với thông điệp:
  `chore: upgrade template to 1.0.0-beta.97 and sync core plugins`
- Đẩy nhánh lên GitHub: `git push origin template-upgrade-1.0.0-beta.97`.
- Hợp nhất vào `main` và đẩy `main` lên GitHub (`0609c46`).

### N8 — Triển khai lên VPS Production (`studio.dsc.edu.vn`)
- Đóng gói phát hành chuẩn Linux x64 trên WSL: `deploy/dokploy/build-release.sh`.
- Tải gói lên VPS `/srv/duongsinh-studio/incoming/studio-0609c46.tar.gz`.
- Xác thực SHA-256 và giải nén vào `/srv/duongsinh-studio/releases/0609c46`.
- Chụp ảnh sao lưu pre-deploy: `studio-before-0609c46-20261118-1134.dump` (14 MB).
- Chuyển đổi bản phát hành bằng `switch-release.sh 0609c46`:
  - Tạm dừng autopilot.
  - Sửa `STUDIO_RELEASE="0609c46"` trong Dokploy compose env.
  - Tái tạo container app `duongsinh-studio-tluxoy-app-1`.
  - Chờ container healthy, di trú tự động chạy khi khởi động (`migrations.autoRun`).
  - Kiểm tra endpoint công khai `https://studio.dsc.edu.vn/main/api/healthz` (trả về `{"ok":true,"app":{"name":"main","basePath":"/main"}}`).
  - Phục hồi autopilot.

---

## 3. Tiến độ thực hiện

- [x] **N0 — Phân tích chi tiết và lập kế hoạch** (`docs/plans/2026-11-18-nang-studio-beta97.md`)
- [x] **N1 — Tạo nhánh nâng cấp `template-upgrade-1.0.0-beta.97`**
- [x] **N2 — Cập nhật `package.json`**
- [x] **N3 — `pnpm install` & `pnpm nocobase skills sync`**
- [x] **N4 — Hợp nhất mã nguồn (32 mới + 45 untouched + 18 customized)**
- [x] **N5 — Di trú cơ sở dữ liệu (`pnpm nocobase db apply` & `db repair`)**
- [x] **N6 — Kiểm tra chất lượng (`typecheck`, `eslint`, `vitest` pass 100%)**
- [x] **N7 — Commit và đồng bộ repo local & GitHub**
- [x] **N8 — Triển khai lên VPS Production `studio.dsc.edu.vn` (Healthy, 200 OK)**
