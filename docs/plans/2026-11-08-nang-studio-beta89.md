# Kế hoạch: Nâng Dương Sinh Studio lên NocoBase 3 (Template beta.89 và plugin đi kèm) — 08/11/2026

> Trạng thái: **chờ duyệt (08/11/2026)**. Phiên này **chỉ lập kế hoạch**: không sửa mã nguồn, không cài gói vào cây làm việc, không đụng production.
> Mốc commit hiện tại trên `main`: `1c83b044c8ae3db4a709457e913e21b132e4486a` (đã merge PR #30; cây làm việc sạch).
> Bản production hiện tại trên VPS: `22706a8` (đã chạy ổn định sau đợt M0/M1/M3/M4.1).
> Tài liệu liên quan: `AGENTS.md`, `.agents/rules/duongsinh-studio.md`, `.agents/skills/nocobase-app-upgrade/SKILL.md` (và các tài liệu tham chiếu), `docs/chenh-lech-upstream.md`, `docs/nang-cap.md`, `docs/trien-khai-vps.md`, kế hoạch mẫu U1 `docs/plans/2026-11-06-nocobase-studio-ra-soat-cap-nhat.md`, kế hoạch M `docs/plans/2026-11-08-studio-hoan-thien-theo-tai-lieu.md`.
> Tên các bước trong đợt nâng cấp này dùng tiền tố **N** (Nâng cấp) để không trùng với U (06/11), K (07/11), M (08/11).

---

## 0. Bối cảnh

- Upstream NocoBase vừa phát hành template `@nocobase/app-template-default` phiên bản `1.0.0-beta.89` cùng bản cập nhật của các plugin lõi và plugin nghiệp vụ.
- Dương Sinh Studio hiện đang chạy trên nền template `1.0.0-beta.88` (kết quả của đợt nâng cấp U1 ngày 06/11/2026).
- Việc rà soát được thực hiện hoàn toàn ở chế độ chỉ đọc: tải và giải nén các tarball npm qua `npm pack` vào thư mục tạm bên ngoài repository (`$TEMP/nb-upgrade-beta89`), đối chiếu mã nguồn và CHANGELOG mà không làm bẩn cây làm việc của dự án.
- Mục tiêu kế hoạch:
  1. Nâng template từ BASE `1.0.0-beta.88` lên TARGET `1.0.0-beta.89` theo đúng quy trình của skill `nocobase-app-upgrade` (merge theo từng file, không chép đè).
  2. Nâng đồng bộ 4 plugin riêng của Studio đang ghim: `agents` (beta.5 → beta.6), `projects` (beta.25 → beta.26), `releases` (beta.18 → beta.19), `agent-sessions` (beta.18 → beta.19). Giữ nguyên `agent-runner` ở `0.1.0-beta.23` (wire protocol version 14).
  3. Duy trì toàn bộ tuỳ biến nhận diện Dương Sinh, bảo toàn an toàn vai trò và quyền hạn (RBAC), kiểm tra di trú cơ sở dữ liệu trên môi trường cô lập trước khi đưa lên VPS.

---

## 1. Kết quả rà soát chi tiết

### 1.1 Bảng phiên bản gói và thay đổi

Nguồn thông tin: NPM Registry (`npm view`, `npm pack` vào thư mục tạm ngoài repo), CHANGELOG và phân tích mã đóng gói (dist).

| Gói | Đang lắp ở Studio | Bản TARGET mới | Nguồn / Loại thay đổi | Tác động chính & Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| `@nocobase/app-template-default` | `1.0.0-beta.88` | **`1.0.0-beta.89`** | Template | Cập nhật 70 file mã nguồn mẫu; nâng dải phụ thuộc lõi; đổi `defaultTemplateVersion`. |
| `@nocobase/app-client` | `^4.0.0-beta.8` | **`^4.0.0-beta.9`** | Lõi Template | Hỗ trợ ngữ cảnh container route chung (`@nocobase/app-client/route-containers`), bảo vệ form khi kiểm tra quyền. |
| `@nocobase/app-plugin-foundation` | `^0.1.0-beta.14` | **`^0.1.0-beta.16`** | Lõi Template | Tinh chỉnh nạp snapshot module foundation. |
| `@nocobase/app-plugin-users` | `^2.0.0-beta.15` | **`^2.0.0-beta.16`** | Lõi Template | Đồng bộ peer client runtime và route presentation. |
| `@nocobase/app-skills` | `0.1.0-beta.59` | **`0.1.0-beta.60`** | Lõi Template | Cập nhật bộ hướng dẫn nâng cấp (`nocobase-app-upgrade/references/realtime-upgrade.md`, v.v.). |
| `@nocobase/realtime` | `^1.0.0-beta.0` | **`^1.0.0-beta.1`** | Lõi Template | Sửa cơ chế phục hồi snapshot và tái kết nối WebSocket; không đổi hợp đồng gọi của Studio. |
| `@nocobase/app-plugin-agents` | `2.0.0-beta.5` (ghim) | **`2.0.0-beta.6`** | Studio ghim | **Tính năng mới (`1f98579`)**: Thêm snapshot chia sẻ hội thoại chỉ đọc cho người dùng cụ thể (`agConversationShares`). Thêm 1 migration mới. |
| `@nocobase/app-plugin-projects` | `0.1.0-beta.25` (ghim) | **`0.1.0-beta.26`** | Studio ghim | Dịch các hành động trong dialog issue/sub-issue/project khi app host container route; bảo vệ form chưa lưu khi đổi quyền. |
| `@nocobase/app-plugin-releases` | `0.1.0-beta.18` (ghim) | **`0.1.0-beta.19`** | Studio ghim | Huỷ deployment trước khi chuyển đổi; cô lập giải nén archive; heap budget cho preview host; hỗ trợ diagnostic context khi upload artifact (`3597c1e`). |
| `@nocobase/app-plugin-agent-sessions` | `1.0.0-beta.18` (ghim) | **`1.0.0-beta.19`** | Studio ghim | Cải thiện độ bền khi agent trả về text hiển thị dài hoặc id lựa chọn không hợp lệ (`4f0370e`). |
| `@nocobase/agent-runner` | `0.1.0-beta.23` | **`0.1.0-beta.23`** | Giữ nguyên | Không có bản mới trên npm; wire protocol `@nocobase/agent-protocol` giữ nguyên phiên bản 14. |

---

### 1.2 Phân loại 70 file thay đổi trong template (BASE .88 → TARGET .89)

Đối chiếu trực tiếp giữa `template-88` và `template-89` kết hợp so sánh với cây mã nguồn hiện tại của Dương Sinh Studio cho kết quả phân loại:

- **52 file "Studio chưa sửa (untouched so với BASE .88)"**: Cập nhật trực tiếp từ TARGET .89.
  - Bao gồm: các UI component chuẩn (`client/components/back-button.tsx`, `brand-loading-mark.tsx`, `breadcrumbs.tsx`, `data-table/*`, `list-feedback.tsx`, `loading.tsx`, `role-list.tsx`, `route-child-page.tsx`, `route-overlay.tsx`, `use-route-overlay.ts`); extension file/workflow (`client/extensions/nocobase-file-component-ui/*`, `nocobase-workflow-management/*`); routing (`client/routing/client-route.tsx`, `route-leave-boundary.tsx`); settings (`client/pages/settings/*`); system locales (`client/locales/system/en-US.ts`, `zh-CN.ts`); cùng các test client tương ứng.
- **5 file "Studio đã sửa (customized)"**: Bắt buộc hợp nhất thủ công từng dòng (manual merge), không được chép đè:
  1. `.agents/rules/shell.md`: Upstream bổ sung quy tắc breadcrumbs và mobile parent arrow thông qua `client/routing/navigation-destination.ts`, giữ cache module route khi Activity kết nối lại. Studio cần giữ nguyên các quy tắc riêng (badge số lượng Hộp thư/Công việc `useNavigationCounts`, Chat panel, menu giao diện).
  2. `AGENTS.md`: Upstream chuẩn hoá đường dẫn kỹ năng sang `.agents/skills/...` và tinh chỉnh tài liệu. Studio cần giữ nguyên toàn bộ các quy tắc bắt buộc của Dương Sinh Studio (chỉ dẫn cấm symlink, bảo vệ vai trò, ràng buộc toolchain).
  3. `client/layouts/app-layout.tsx`: Upstream lược bỏ khối `<div className='md:hidden'><AppBrand /></div>` khỏi `LayoutHeader` để thống nhất với nút mũi tên quay lại trên mobile. Studio cần cập nhật thay đổi này, đồng thời giữ nguyên vẹn `StudioChatProvider`, `ChatPanel`, `useNavigationCounts` và các badge đếm.
  4. `client/styles.css`: Upstream mở rộng quy tắc định dạng kích thước nút trong dialog footer / alert dialog footer (`[data-slot='button']`, `dialog-close`, `alert-dialog-action`, `alert-dialog-cancel`) với `height: auto`, `min-height: calc(var(--spacing) * 10)`, `text-align: center`. Studio cần tích hợp khối CSS này và giữ nguyên toàn bộ các biến màu lượt chạy (`--run-queued`, `--run-running`, `--run-success`, `--run-failed`).
  5. `package.json`: Nâng dải phiên bản của các gói lõi và ghim plugin; giữ nguyên các cấu hình riêng (`bin: ds-studio`, `envPrefix: DS_STUDIO`, script build, cấu hình workspace).
- **13 file "File mới trong TARGET (chưa có trong Studio)"**: Tiếp nhận toàn bộ vào dự án:
  - `client/components/pending-button.tsx`: Component nút bấm hiển thị trạng thái đang xử lý.
  - `client/components/task-progress.tsx`: Component hiển thị tiến độ tác vụ đa bước.
  - `client/routing/navigation-destination.ts`: Bộ xử lý điểm đến điều hướng cha và breadcrumb.
  - 10 file test và fixture mẫu: `tests/client/authenticated-client-fixture.test.tsx`, `list-loading.test.tsx`, `navigation-parent.test.tsx`, `pending-button.test.tsx`, `route-leave-recheck.test.tsx`, `route-presentation.test.tsx`, `settings-idle-list.test.tsx`, `tests/fixtures/dialog-footer.html`, `dialog-footer.tsx`, `tests/playwright/dialog-footer.test.ts`.
- **0 file "Studio đã xoá"**.

---

### 1.3 Phân tích ảnh hưởng của plugin mới đến Dương Sinh Studio (File:Dòng)

#### A. Gate run và `runKeyScope` (`server/providers/agent-actions.ts`)
- **Vị trí ảnh hưởng**: `server/providers/agent-actions.ts:70-95` (`createStudioGate`), `103-125` (`runKeyScope`), `191-211` (đăng ký gate vào `agents.gate.set` và `authz.use`).
- **Tác động**: `@nocobase/app-plugin-agents` 2.0.0-beta.6 không thay đổi chữ ký `ActionGate` hay `KeyScope`. Studio tiếp tục duy trì cơ chế `runKeyScope` song song với kiểm tra quyền route của plugin theo đúng quyết định trong `docs/chenh-lech-upstream.md` mục 24.
- **Rủi ro**: Thấp. Test bảo vệ: `tests/server/agent-gate.test.ts`, `tests/server/run-actor.test.ts`.

#### B. Cơ chế Admission
- **Vị trí ảnh hưởng**: `server/providers/agent-actions.ts:201-211`.
- **Tác động**: Tuyến đường bảo mật của issued credential vẫn giữ nguyên hợp đồng từ beta.3/beta.25. Không có xung đột mới.

#### C. Autopilot
- **Vị trí ảnh hưởng**: `server/autopilot/stall.ts:15-45` (đọc `runs.workload` và `until`), `server/autopilot/evaluator.ts:50-120` (đánh giá 7 bước), `server/autopilot/scheduler.ts`.
- **Tác động**: Không bị ảnh hưởng bởi thay đổi của beta.6/beta.26. Các thuộc tính `workload` của run không đổi cấu trúc.

#### D. Issue Subject (`queuedExpiryMs` và `workspaces.settled`)
- **Vị trí ảnh hưởng**: `server/providers/issue-subject.ts:420-422, 449-472` (`QUEUED_EXPIRY_MS = 24h`, `settledIssues`).
- **Tác động**: Sweeper và trình dọn dẹp thư mục làm việc của plugin agents trong beta.6 tiếp tục tiếp nhận `queuedExpiryMs` và `workspaces.settled` mà Studio đã khai báo ở bước M1.
- **Rủi ro**: Thấp. Test bảo vệ: `tests/server/issue-subject-workspaces.test.ts`.

#### E. `ModelSelectionPolicies`
- **Vị trí ảnh hưởng**: `server/providers/project-manager.ts:77-88` (đăng ký `agents.selectionPolicies.register('ds-project-manager')`).
- **Tác động**: Plugin agents beta.6 tiếp tục hỗ trợ hook `selectionPolicies`, đảm bảo giá trị `fallbackAfterSeconds` (120 giây) hoạt động khi phân bổ model.
- **Rủi ro**: Không có. Test bảo vệ: `tests/server/project-manager-selection.test.ts`.

#### F. Hộp thư (Inbox) & Hoạt động
- **Vị trí ảnh hưởng**: `server/routes/inbox.ts:216-1290`, `client/extensions/nocobase-inbox/inbox-item.tsx:1-120`.
- **Tác động**: Các route `inbox/*`, `taskGroups/*` và `followUps/*` của Studio hoạt động độc lập trên dữ liệu công việc và activity. Việc bổ sung tính năng chia sẻ hội thoại của plugin agents không làm thay đổi luồng thông báo trong ứng dụng.

#### G. Di trú cơ sở dữ liệu mới (Plugin Migrations)
- **Vị trí ảnh hưởng**: Bảng mới `agConversationShares` do migration `202611080001_ag_conversation_shares.js` của `@nocobase/app-plugin-agents` tạo ra.
- **Chi tiết**: Tạo bảng `agConversationShares` (các cột `id`, `conversationId`, `userId`, `cutoffSeq`, `snapshotAt`, `title`, `createdAt`, `updatedAt`, chỉ mục duy nhất `ag_conversation_share_user_uq`). Migration có hàm `down` đảo ngược rõ ràng (`builder.dropCollection`).
- **Tác động**: Bảng mới độc lập, không thay đổi hay xoá bất kỳ cột nào của các bảng hiện hữu (`ag_runs`, `pm_issues`, `ds_*`). Hoàn toàn tương thích ngược.

#### H. Runner & `PROTOCOL_VERSION`
- **Vị trí ảnh hưởng**: Các bài test server giả lập runner: `tests/server/run-actor.test.ts:24`, `tests/server/conversations-routes.test.ts:35`, `tests/server/git-contract-routes.test.ts:34`, `tests/server/git-open-pr.test.ts:36`, `tests/server/git.test.ts:35`, `tests/server/issue-work-actions.test.ts:21`, `tests/server/issue-work-routes.test.ts:21`, `tests/server/kb-offer-routes.test.ts:21`, `tests/server/knowledge-routes.test.ts:33`, `tests/server/project-setup-routes.test.ts:29`, `tests/server/releases.test.ts:37`, `tests/server/report-routes.test.ts:21`, `tests/server/reviews.test.ts:34`, `tests/server/budget-routes.test.ts:30`.
- **Tác động**: Gói `@nocobase/agent-runner` giữ nguyên bản `0.1.0-beta.23`, phụ thuộc `@nocobase/agent-protocol` `0.1.0-beta.16` với `PROTOCOL_VERSION = 14`. Toàn bộ giao thức runner không đổi, không cần nâng cấp runner daemon trên VPS hay máy dev.

#### I. Locale Overrides `vi-VN`
- **Vị trí ảnh hưởng**: `client/locales/overrides/vi-VN.ts` và `server/locales/overrides/vi-VN.ts`.
- **Tác động**: Cần chạy `tests/client/locale-parity.test.ts` để phát hiện các khoá dịch bị cũ (stale) hoặc thiếu. Nếu plugin agents beta.6 giới thiệu các chuỗi giao diện mới cho tính năng chia sẻ hội thoại, cần bổ sung thuật ngữ tiếng Việt chuẩn theo `docs/thuat-ngu.md`.

---

### 1.4 Ảnh hưởng dây chuyền (Ripple Effect)

- Việc nâng `nocobase.defaultTemplateVersion` lên `"1.0.0-beta.89"` trong `package.json` sẽ tác động trực tiếp đến logic khởi tạo dự án:
  - `server/setups/template-version.ts` chứa hàm `readTemplateRelease()` đọc trực tiếp trường `nocobase.defaultTemplateVersion`.
  - Mọi dự án NocoBase 3 mới được tạo từ Studio qua tính năng Thiết lập dự án (`POST /projectSetups`, route `server/routes/project-setups.ts`) sẽ sinh ra issue "Khởi tạo dự án" chỉ thị agent scaffold từ template `@nocobase/app-template-default@1.0.0-beta.89` (thay vì beta.88).
  - Test `tests/server/template-version.test.ts:10-13` sẽ tự động xác nhận phiên bản mới này.
  - Ghi nhận rõ ràng vào tài liệu `docs/chenh-lech-upstream.md`.

---

## 2. Các bước thực hiện chi tiết (N1 → N9)

### N1 — Chuẩn bị và tạo nhánh nâng cấp (~0,5 giờ)
1. Đảm bảo cây làm việc trên máy dev sạch hoàn toàn, nhánh `main` ở commit `1c83b04`.
2. Tạo nhánh nâng cấp:
   ```bash
   git checkout -b template-upgrade-1.0.0-beta.89
   ```
   > **CẢNH BÁO TUÂN THỦ**: Tuyệt đối không dùng `git checkout --`, `git restore`, `git reset --hard`, `git stash`, `git clean` hay `rm -rf` trên cây làm việc.

### N2 — Cập nhật khai báo phụ thuộc trong `package.json` (~0,5 giờ)
1. Cập nhật `version` lên `"1.0.0-beta.89"`, `nocobase.defaultTemplateVersion` lên `"1.0.0-beta.89"`.
2. Cập nhật các phụ thuộc lõi theo TARGET .89:
   - `devDependencies`:
     - `@nocobase/app-client`: `"^4.0.0-beta.9"`
     - `@nocobase/app-skills`: `"0.1.0-beta.60"`
   - `dependencies`:
     - `@nocobase/app-plugin-agents`: `"2.0.0-beta.6"` (ghim bản beta.6 của Studio)
     - `@nocobase/app-plugin-foundation`: `"^0.1.0-beta.16"`
     - `@nocobase/app-plugin-users`: `"^2.0.0-beta.16"`
     - `@nocobase/realtime`: `"^1.0.0-beta.1"`
     - `@nocobase/app-plugin-projects`: `"0.1.0-beta.26"` (ghim bản beta.26 của Studio)
     - `@nocobase/app-plugin-releases`: `"0.1.0-beta.18"` → `"0.1.0-beta.19"` (ghim bản beta.19 của Studio)
     - `@nocobase/app-plugin-agent-sessions`: `"1.0.0-beta.18"` → `"1.0.0-beta.19"` (ghim bản beta.19 của Studio)

### N3 — Cài đặt gói và kiểm tra Registry (`pnpm install`) (~1 giờ)
1. Chạy cài đặt gói trong môi trường WSL:
   ```bash
   pnpm install
   ```
2. **Kiểm tra bắt buộc theo luật `.agents/rules/duongsinh-studio.md`**:
   ```bash
   git diff package.json
   ```
   Xác nhận registry không tự động hạ cấp `@nocobase/app-client` hoặc đẩy các thư viện client vào `dependencies`. Nếu có, khôi phục lại ngay.
3. Đồng bộ kỹ năng từ `@nocobase/app-skills@0.1.0-beta.60`:
   ```bash
   pnpm nocobase skills sync
   ```

### N4 — Hợp nhất mã nguồn mẫu (~2–3 giờ)
1. Sao chép 52 file thuộc diện "untouched" từ tarball `template-89` vào cây làm việc.
2. Sao chép 13 file mới từ `template-89` vào các thư mục tương ứng trong `client/` và `tests/`.
3. Tiến hành hợp nhất thủ công (manual merge) 5 file "customized":
   - `.agents/rules/shell.md`: Bổ sung đoạn hướng dẫn navigation-destination và mobile parent arrow, giữ nguyên các quy tắc Studio.
   - `AGENTS.md`: Cập nhật link `.agents/skills/...`, giữ nguyên quy tắc ứng dụng.
   - `client/layouts/app-layout.tsx`: Bỏ khối `<div className='md:hidden'><AppBrand /></div>`, giữ nguyên `StudioChatProvider`, `ChatPanel`, badge số lượng.
   - `client/styles.css`: Hợp nhất định dạng nút footer dialog, giữ nguyên các biến màu `--run-*`.
   - `package.json`: Đã làm ở N2.

### N5 — Thử nghiệm di trú DB (Database Migration Testing) (~2 giờ)
1. Liệt kê migration đang chờ: xác nhận chỉ có `202611080001_ag_conversation_shares.js` của plugin agents.
2. Thử nghiệm trên DB dev mới (SQLite / local Postgres):
   ```bash
   pnpm nocobase db migrate
   ```
3. Thử nghiệm trên bản sao DB production (PostgreSQL):
   - Sử dụng bản dump production mới nhất (`studio-before-22706a8-20261108-1650.dump`).
   - Khôi phục vào cơ sở dữ liệu thử nghiệm cục bộ (`embedded-postgres` trong thư mục tạm WSL).
   - Chạy `pnpm nocobase db migrate`, xác minh bảng `agConversationShares` được tạo thành công, chỉ mục `ag_conversation_share_user_uq` được thiết lập chính xác, không có lỗi huỷ transaction (25P02).
   - Thử nghiệm rollback: xác nhận hàm `down` hạ bảng sạch sẽ.

### N6 — Cổng kiểm tra chất lượng (Verification Gates) (~3 giờ)
Chạy toàn bộ các bước kiểm tra chất lượng tự động:
1. Định dạng & Kiểm tra tĩnh:
   ```bash
   pnpm lint
   pnpm typecheck
   ```
2. Kiểm tra tài nguyên đa ngôn ngữ:
   ```bash
   pnpm nocobase locales check
   pnpm exec vitest run tests/client/locale-parity.test.ts
   ```
3. Kiểm tra an toàn phân quyền:
   ```bash
   pnpm exec vitest run tests/server/authorization-assignment-safety.test.ts
   ```
4. Kiểm tra phiên bản template ghim cho dự án mới:
   ```bash
   pnpm exec vitest run tests/server/template-version.test.ts
   ```
5. Chạy test theo 3 nhóm (đảm bảo máy dev 12 GB không bị tràn bộ nhớ):
   ```bash
   pnpm exec vitest run tests/server/
   pnpm exec vitest run tests/client/
   pnpm exec vitest run tests/project/ tests/database/
   ```
6. Kiểm tra build sản phẩm:
   ```bash
   pnpm build --target linux-x64 --node-version 24
   pnpm nocobase dist check
   ```
7. Chạy kiểm thử luồng e2e Playwright: đăng nhập → tạo việc → chuyển trạng thái trên board.
8. Mở dev server (`pnpm dev`), duyệt qua các trang chính trên trình duyệt: Công việc của tôi, Chi tiết việc, Bảng Kanban, Hộp thư, Phát hành, Tri thức, Cài đặt hệ thống, Cài đặt Trưởng nhóm agent. Xác nhận không có lỗi API trong DevTools console.

### N7 — Chốt mốc, tạo Pull Request và Merge (~0,5 giờ)
1. Cập nhật tài liệu:
   - `docs/chenh-lech-upstream.md`: Thêm mục 33 ghi nhận nâng cấp beta.89 và migration `agConversationShares`.
   - `docs/nang-cap.md`: Cập nhật nhật ký các lần nâng cấp thành công.
2. Commit toàn bộ thay đổi với commit message chuẩn Conventional Commits (tiếng Anh):
   ```text
   chore: upgrade template to 1.0.0-beta.89 and align core plugins
   ```
3. Đẩy nhánh `template-upgrade-1.0.0-beta.89` lên GitHub và tạo Pull Request.
4. Chờ GitHub Actions CI chạy xanh, review diff và merge vào `main`.

### N8 — Triển khai lên Production VPS (~1 giờ)
Thực hiện trong môi trường WSL (`~/code/duongsinh-studio`) theo đúng `docs/trien-khai-vps.md`:
1. Build gói phát hành trên máy dev từ commit `main` vừa merge:
   ```bash
   pnpm build --target linux-x64 --node-version 24
   SHA=$(git rev-parse --short HEAD)
   tar --exclude='*/.bin' --exclude='dist/.env' -czf ~/code/release/studio-$SHA.tar.gz dist config.example.yml
   pnpm nocobase dist check
   ```
2. Tải bản build lên VPS:
   ```bash
   scp -i ~/.ssh/vps_key ~/code/release/studio-$SHA.tar.gz root@217.15.160.118:/srv/duongsinh-studio/incoming/
   ssh -i ~/.ssh/vps_key root@217.15.160.118 \
     "mkdir -p /srv/duongsinh-studio/releases/$SHA && tar -xzf /srv/duongsinh-studio/incoming/studio-$SHA.tar.gz -C /srv/duongsinh-studio/releases/$SHA && chown -R 1000:1000 /srv/duongsinh-studio/releases/$SHA"
   ```
3. Các bước an toàn trước khi chuyển phiên bản:
   - Kiểm tra không còn run nào đang ở trạng thái `running` trên VPS.
   - Tạm dừng tự lái trên các dự án đang kích hoạt (Sandbox, Dương Sinh App) với lý do: `Cập nhật Studio ($SHA)`.
   - Chụp bản sao lưu cơ sở dữ liệu:
     ```bash
     ssh -i ~/.ssh/vps_key root@217.15.160.118 \
       "docker exec duongsinh-studio-tluxoy-db-1 pg_dump -U studio -d studio -Fc > /srv/duongsinh-studio/backups/studio-before-$SHA-\$(date +%Y%m%d-%H%M).dump"
     ```
4. Đổi phiên bản trên Dokploy:
   - Truy cập Dokploy API / UI: cập nhật biến môi trường `STUDIO_RELEASE=$SHA` trên compose `studio`.
   - Bấm Deploy (chỉ redeploy duy nhất compose `studio`, không chạm vào bất kỳ service hay container nào khác).
   - Migration `202611080001_ag_conversation_shares` sẽ tự động thực thi khi container khởi động (`migrations.autoRun`).

### N9 — Kiểm chứng sau triển khai & Khôi phục tự lái (~0,5 giờ)
1. Kiểm tra trạng thái hệ thống:
   - Container `duongsinh-studio-tluxoy-app-1` ở trạng thái `healthy`.
   - Endpoint `https://studio.dsc.edu.vn/main/api/healthz` trả về `ok: true` (HTTP 200).
   - Kiểm tra log container: 0 lỗi mức 500.
   - Kiểm tra WebSocket kết nối tốt (HTTP 101).
   - Kiểm tra runner `vps-studio-runner` báo online và heartbeat bình thường.
   - Kiểm tra trang sản xuất NocoBase 2 `https://nocobase.dsc.edu.vn` trả về HTTP 200, hoàn toàn không bị ảnh hưởng.
2. Bật lại tự lái cho các dự án đã tạm dừng (`autopilot resume`).
3. Dọn dẹp: Xoá tarball trong `incoming/`, giữ tối đa 3 bản phát hành gần nhất trong `releases/` trên VPS.

---

## 3. Quy trình quay lui (Rollback)

Nếu phát hiện lỗi nghiêm trọng sau khi triển khai lên production:

1. **Quay lui ứng dụng**:
   - Đặt lại biến `STUDIO_RELEASE=22706a8` trên Dokploy compose `studio`.
   - Bấm Deploy để Dokploy mount lại bản phát hành trước đó.
2. **Khôi phục cơ sở dữ liệu** (nếu migration `202611080001_ag_conversation_shares` đã chạy và gây xung đột):
   ```bash
   ssh -i ~/.ssh/vps_key root@217.15.160.118
   docker stop duongsinh-studio-tluxoy-app-1
   docker exec -i duongsinh-studio-tluxoy-db-1 pg_restore -U studio -d studio --clean --if-exists < /srv/duongsinh-studio/backups/studio-before-$SHA-<timestamp>.dump
   docker start duongsinh-studio-tluxoy-app-1
   ```
3. Xác nhận hệ thống hoạt động bình thường trên bản `22706a8`.

---

## 4. Rủi ro và Giải pháp kiểm soát

| Rủi ro | Mức độ | Biện pháp kiểm soát & Phòng ngừa |
| :--- | :--- | :--- |
| Registry npm hạ cấp gói lõi hoặc chuyển client library vào `dependencies` | Cao | Chạy `git diff package.json` ngay sau `pnpm install`. Phục hồi dải phiên bản trước khi tiếp tục. |
| Migration mới làm lỗi hoặc khoá bảng vật lý PostgreSQL | Trung bình | Đã phân tích mã migration: chỉ tạo 1 bảng mới độc lập `agConversationShares`. Thử nghiệm kỹ trên bản sao DB Postgres trước khi lên production. |
| Quá tải RAM VPS khi cập nhật | Trung bình | Bản phát hành được build sẵn trên máy dev (`--target linux-x64`). VPS chỉ giải nén và khởi động container `app` với giới hạn RAM 1536M. |
| Ảnh hưởng đến production NocoBase 2 (`nocobase.dsc.edu.vn`) | Cao | Tuân thủ tuyệt đối: chỉ redeploy compose `studio` trong project Dokploy `duongsinh-studio`. Không chạm vào network, volume hay compose khác. |
| Lỗi stale translation overrides vi-VN | Thấp | Chạy test `tests/client/locale-parity.test.ts` trong bộ kiểm tra tự động trước khi merge. |

---

## 5. Xếp lịch và Tương quan với kế hoạch M

- **Tách biệt hoàn toàn khỏi kế hoạch M**: Đợt nâng cấp NocoBase 3 (beta.89) là nhiệm vụ hạ tầng nền tảng, không trộn lẫn commit hoặc nhánh làm việc với kế hoạch M (hoàn thiện Studio theo tài liệu).
- **Thời điểm đề xuất**:
  - Hiện tại, đợt M đầu tiên (M0, M1, M3, M4.1) đã hoàn tất và triển khai lên production (`22706a8`), PR #30 đã merge vào `main`, cây làm việc sạch.
  - Khuyến nghị **thực hiện đợt nâng cấp NocoBase beta.89 ngay tại thời điểm này**, trước khi bắt tay vào bước M4.2 (viết driver Dokploy cho app NB3) hoặc M2 (đón cộng tác viên).
- **Hình thức triển khai production**:
  - Khuyến nghị **đưa production thành một đợt riêng biệt** (bản phát hành độc lập). Lý do: Cô lập hoàn toàn thay đổi của framework lõi với thay đổi nghiệp vụ; nếu cần quay lui thì chỉ liên quan đến bản nâng cấp thư viện, không làm mất các tính năng mới viết thêm.

---

## 6. Ước lượng công sức

| Bước | Nội dung | Thời gian ước tính (Agent) |
| :--- | :--- | :--- |
| N1 | Chuẩn bị & Tạo nhánh nâng cấp | 0,5 giờ |
| N2 | Cập nhật khai báo `package.json` | 0,5 giờ |
| N3 | Cài đặt gói, kiểm tra registry, đồng bộ skills | 1,0 giờ |
| N4 | Hợp nhất mã nguồn (5 customized + 13 new + 52 untouched) | 2,5 giờ |
| N5 | Thử nghiệm di trú DB (dev mới & bản sao production Postgres) | 2,0 giờ |
| N6 | Chạy toàn bộ cổng kiểm tra (CI, lint, typecheck, test 3 nhóm, build, e2e) | 3,0 giờ |
| N7 | Chốt mốc, tạo PR và merge vào `main` | 0,5 giờ |
| N8 | Triển khai lên VPS Production (WSL) | 1,0 giờ |
| N9 | Kiểm chứng sau triển khai & Khôi phục tự lái | 0,5 giờ |
| **Tổng cộng** | | **~11,5 giờ (~1,5 ngày làm việc)** |

---

## 7. Các câu hỏi cần chủ dự án chốt

> **Đã chốt ngày 08/11/2026:**
> - **Q1: Làm ngay sau đợt M hiện tại và đưa production riêng một đợt** (tách biệt khỏi kế hoạch M, trước khi bước vào M4.2).
> - **Q2: Ghim beta.89 ngay sau khi PR của đợt nâng cấp này được merge vào nhánh `main`**.
> - **Q3: Nâng cấp từng ứng dụng (nocoedu, nocobookshop, nocofen) trong các đợt riêng biệt** sau khi Studio vận hành ổn định trên beta.89.

### Q1: Làm ngay sau đợt M hiện tại hay gộp vào lần đưa production kế tiếp?
- **Khuyến nghị**: **Làm ngay sau đợt M hiện tại và đưa production riêng một đợt**. Cây làm việc `main` hiện đang sạch, production `22706a8` đang ổn định. Nâng nền tảng lên beta.89 trước sẽ tạo nền tảng vững chắc cho các bước M4.2 (driver Dokploy) và M2 tiếp theo.
- **Quyết định**: Đã chọn làm ngay sau đợt M và đưa production riêng một đợt.

### Q2: Dự án mới tạo từ Studio ghim beta.89 từ lúc nào?
- **Khuyến nghị**: **Ghim beta.89 ngay sau khi PR của đợt nâng cấp này merge vào `main`**. Khi `package.json` đổi `nocobase.defaultTemplateVersion` thành `1.0.0-beta.89`, logic `readTemplateRelease()` sẽ tự động áp dụng phiên bản này cho mọi issue thiết lập dự án mới.
- **Quyết định**: Ghim ngay sau khi merge PR vào `main`.

### Q3: Có nâng luôn các ứng dụng nocoedu, nocobookshop, nocofen lên beta.89 không?
- **Khuyến nghị**: **Có, nhưng tách thành từng đợt nâng cấp riêng cho mỗi ứng dụng** sau khi Dương Sinh Studio đã vận hành ổn định trên beta.89. Không nâng đồng loạt để đảm bảo an toàn vận hành và kiểm soát lỗi độc lập trên từng ứng dụng.
- **Quyết định**: Tách thành từng đợt nâng cấp riêng cho mỗi ứng dụng.

---

## 8. Tiến độ

(Mục này để trống, sẽ ghi nhận ngày, commit, kết quả cổng kiểm tra và bản phát hành production khi triển khai.)

- [ ] N1 — Chuẩn bị và tạo nhánh nâng cấp
- [ ] N2 — Cập nhật khai báo phụ thuộc trong `package.json`
- [ ] N3 — Cài đặt gói và kiểm tra Registry (`pnpm install`)
- [ ] N4 — Hợp nhất mã nguồn
- [ ] N5 — Thử nghiệm di trú DB (dev mới & bản sao production Postgres)
- [ ] N6 — Cổng kiểm tra chất lượng (Verification Gates)
- [ ] N7 — Chốt mốc, tạo Pull Request và Merge
- [ ] N8 — Triển khai lên Production VPS (WSL)
- [ ] N9 — Kiểm chứng sau triển khai & Khôi phục tự lái
