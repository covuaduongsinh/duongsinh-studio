# Kế hoạch V: Studio thuận tiện và nhanh — 12/11/2026

> Trạng thái: **chờ duyệt** (chưa viết mã). Bản thảo đã được chủ dự án duyệt về hướng; đây là bản kế hoạch chi tiết để duyệt trước khi làm.
> Tên bước dùng chữ **V** để không trùng S, AP, U, K, L, M, N, P, H. Đối chiếu với `main` = `20d20d7` (sau H3b, production `7d1625f`).
> Nguồn (chép nguyên văn vào `docs/plans/research/2026-11-12/`, thư mục này đã nằm trong `.prettierignore`):
> `KE-HOACH-V-thuan-tien-va-nhanh.md` (bản thảo), `V-A-giao-dien.md` (24 điểm ma sát giao diện, ký hiệu **A#**),
> `V-B-van-hanh.md` (23 điểm ma sát vận hành, ký hiệu **B#**, và 12 chỗ tài liệu lệch mã **T#** ở §2.8).
> Quyết định đã chốt: **đóng DS-60** (đăng ký NocoEdu thành App để chạy `import-lark`; phiên Orca dừng vì không có kênh chạy lệnh trong app);
> thay bằng V4 (kênh job) + V5.4 (nhận nuôi NocoEdu).

## 0. Kết luận

- Hướng của bản thảo đúng và được giữ nguyên phạm vi V0–V6. Kiểm chứng lại trên mã: **mọi điểm "cao"/S1 đều đúng**, trừ hai chỗ
  lệch nhỏ (B#9, B#14) và **một chỗ làm bản thảo V0.1 không thực hiện được nguyên văn** (§1.3): đặt
  `IssueCreationModeContext='manual'` thì plugin **bỏ hẳn thanh tab**, không còn chọn được "Dự thảo AI". Kế hoạch này làm theo cách khác
  (V0.1, chủ dự án đã chọn ở Q6).
- Plugin đã có sẵn gần hết cơ chế cần dùng: realtime (`pm:changes`, `agents:runs:<id>`), hook làm tươi truy vấn, khoá API giới hạn theo App
  (`objects`), hợp đồng driver `releases`, thư mục làm việc dùng chung theo tác vụ của runner. Cái phải tự viết: kênh job (daemon host),
  trang "Hôm nay", form đăng ký App, cổng RAM, sao lưu volume app. Mỗi bước dưới đây ghi **cơ chế plugin dùng trước, tự viết sau**.
- Phát hiện mới ảnh hưởng thiết kế: (1) Studio **không có publisher realtime nào** ở `server/` — nhưng không cần, vì `pm:changes` và
  `agents:runs:<id>` do chính plugin phát; chỉ `attention` của phát hành là không có topic nên giữ poll. (2) Hợp đồng driver **không có `exec`**, nên
  kênh job nằm **ngoài driver** (provider + route riêng của Studio). (3) `AppObservedStatus.lastAccessedAt` có sẵn trong hợp đồng, là chỗ đúng để
  điền "lần có request gần nhất" cho tự dừng (V5.1). (4) Runner dùng chung **đã chia sẻ một thư mục tác vụ cố định** giữa các run cùng máy
  (README agents, mục Workspace), nên "mỗi lượt `pnpm install` lại" cần **đo trước khi xây cache** (V3.4).

## 1. Kết quả kiểm chứng

Kiểm lại bằng mã hiện tại (đọc, không chạy trên VPS). Kết quả:

### 1.1 Giao diện (A) — điểm mức "cao" và các điểm V3 dựa vào

| A#  | Kết quả                        | Sự thật đã kiểm                                                                                                                                                                                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Đúng, thêm lưu ý               | 19 **liên kết** + 3 dòng tiêu đề nhóm không bấm được (`sectionDevelopment/Releases/Agents`, `navigation-transform.ts`). Tên route dự án thật là `pm-projects`.                                                                                    |
| 3   | Đúng                           | `client/pages/home/index.tsx` chỉ dùng `useMyWorkSummary` + `useWaitingDecisions`; không có chat, phát hành, agentBoard.                                                                                                                          |
| 5   | Đúng, thêm: ngưỡng mobile 768  | `issue-workspace.tsx:169-175` mặc định `split` cho `my-issues`; `issue-split-view.tsx:330` `w-80 shrink-0 … lg:w-96`; `useIsMobile` (`client/hooks/use-mobile.ts`, 768 px) **không** được dùng trong `client/pages/issues/**` hay `my-issues/**`. |
| 8   | Đúng                           | 11 khối trước `<Tabs>` (`detail/index.tsx` ~L235–453); `IssueCriteriaSection` luôn render dù rỗng (`criteria-editor.tsx:252`).                                                                                                                    |
| 9   | Đúng                           | `issue-sticky-header.tsx` chỉ có trạng thái, mã, tiêu đề, `IssueMergeButton`, về đầu trang; không có `needsYou`.                                                                                                                                  |
| 10  | Đúng, thêm                     | Tiến độ nằm ở 4 nơi (+ nơi thứ 5: tab Mã & xem thử chứa PR/preview/release).                                                                                                                                                                      |
| 13  | Đúng, **cơ chế khác bản thảo** | Xem §1.3.                                                                                                                                                                                                                                         |
| 4   | Đúng                           | `query-client.js:9` `refetchOnWindowFocus:false`; không hook Studio nào bật lại. Chu kỳ: `use-my-work` 30 s, `use-follow-ups` 60 s, `use-task-groups` 30 s, `use-issue-work` 15 s.                                                                |
| 20  | Đúng, **sửa tên API**          | Không có `useRealtime`/`useTopic`. Tên đúng, từ `@nocobase/app-client`: `useRealtimeTopic`, `useRealtimeRefresh`, `useRealtimeReadiness`, `useRealtimeConnectionState`, `refreshRealtimeQueries`; token dịch vụ `realtimeClientToken`.            |
| 21  | Đúng                           | `decisionsOn` (`server/routes/inbox.ts:264`), `DECISION_SCAN=50`, 2 truy vấn/việc; gọi bởi `/inbox/items`, `/inbox/pending`, `/inbox/waiting`, `/taskGroups/summary`, `/taskGroups/:id/decisions` và (qua `rowsOf`) 3 route `/taskGroups*`.       |
| 22  | Đúng, thêm                     | `app-layout.tsx:9-10` import tĩnh `ChatPanel`, `ChatFloatingButton`; `header-actions.tsx` cũng import tĩnh `ChatHeaderButton` — phải lazy cả hai chỗ.                                                                                             |

Các điểm A còn lại (mức vừa/thấp) giữ nguyên theo báo cáo; không có điểm nào bị bác bỏ hay đã được sửa trên `main`.

### 1.2 Vận hành (B) — điểm S1 và các điểm V0/V4/V5 dựa vào

| B#                               | Kết quả                          | Sự thật đã kiểm                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4, 5                             | Đúng                             | `dokploy-driver.ts:195` `capabilities:{logs:false,…}`; session không có `exec`; `logs()` trả `available:false`; `status()` chỉ đọc `deps.store.list()`; `check()` chỉ gọi `environmentId()`. Hợp đồng plugin (`types.d.ts`) **không có exec ở đâu cả**.                                                            |
| 6                                | Đúng                             | `nb3-compose.ts`: 3 service. `-db` chỉ nhận `POSTGRES_*`, `-init` không nhận env, `-app` nhận **toàn bộ `.env`** qua `env_file`.                                                                                                                                                                                   |
| 7                                | Đúng                             | `builds.ts:50` `CI_KEY_DAYS=365`; `issueCiKey` (`:829`) cấp `releases.apps:write` + `studio.checks:write` **không `objects`**. Plugin có sẵn preset "CI deploy" 90 ngày giới hạn App, và README xác nhận khoá có thể giới hạn bằng `objects` (nguồn `releasesKeyScopeObjects`).                                    |
| 9                                | **Sai ở ví dụ, đúng ở kết luận** | 12 mẫu trong `secret-patterns.ts`. Thử cục bộ bằng `scanSecrets`: `LARK_APP_SECRET=abcdef1234567890` → không bắt; `DB_PASSWORD=xxxxxxxxxxxx` → không bắt; khoá `ds_…` đứng một mình → không bắt. **Lệch so với báo cáo**: `x-api-key: ds_…` (≥20 ký tự) **được** bắt bởi `generic_key_assignment`.                 |
| 11                               | Đúng                             | `capacityProblem` (~`:213`) đếm trên mọi row `dsNb3Apps` đang `running`, so với `maxApps` của env đang deploy; `maxApps` ràng buộc 1..2; không cổng RAM (preview NB2 có `MIN_AVAILABLE_MB=1200` ở `previews/service.ts:34`). `sweepIdle` dừng khi `startedAt + idleStopMinutes ≤ now`; `lastAccessedAt` luôn null. |
| 14                               | **Đúng một phần**                | `backup.sh` chỉ dump DB Studio + tar `storage/` (đúng). Nhưng `remove(purgeData)` **không tự xoá volume trong file này**: nó gọi `client().remove(composeId)` — Dokploy mới xoá volume — rồi `rm -rf dataDir/<composeName>`. Kết luận (không có dump trước khi xoá) vẫn đúng.                                      |
| 19                               | Đúng                             | `!tao-app-nocobase` đòi `pnpm nocobase app:test` (không có; các topic CLI thật: `agents cli collections config db dist foundation locales package plugin scheduler secrets skills`); `!nhap-lark` đòi `tests/server/lark-sync.test.ts` (không tồn tại); `!deploy-dokploy` đòi `pnpm build`.                        |
| 20                               | Đúng                             | `ds-admin` chỉ có `view`, `read-logs`, `deploy` (+ `upload` từ `202611100002`) trên `rel.apps`; không `operate/configure/create/delete`.                                                                                                                                                                           |
| 1, 3, 8, 10, 12–13, 15–18, 21–23 | Giữ theo báo cáo                 | Không phải S1; xử lý ở bước tương ứng (bảng §3).                                                                                                                                                                                                                                                                   |

**Cập nhật 12/11 (khảo sát VPS chỉ đọc):** `.env` của Dokploy là `0644` và `/etc/dokploy` là `0777` (đọc được bởi `studio-runner`); NocoEdu nay là Postgres trong compose Dokploy và **không có sao lưu** (cron chỉ sao lưu `edu.sqlite` cũ); rclone đã có remote `gdrive-dsc`. Chi tiết: `docs/plans/2026-11-12-khao-sat-vps-nocoedu.md`.

Phần còn **chưa kiểm được từ đây** (cần VPS/Dokploy thật, ghi lại để không suy đoán): bản Dokploy đang cài có WebSocket terminal/log và API key
giới hạn project không; quyền file `/etc/dokploy/compose/nb3-*/code/.env`; `storage/` có vòng dọn artifact không; NocoEdu production ở đâu
(Q7 — đã khảo sát 12/11, xem `docs/plans/2026-11-12-khao-sat-vps-nocoedu.md`); QPS Lark Bitable; **WebSocket `/main/ws` qua Traefik trên production có chạy không** (`config.yml` hiện để khối `realtime:`
dạng chú thích; nhưng `client/components/studio-chat.tsx` đã dùng `realtimeClientToken`, nên phải xác nhận trạng thái thật trước V3.1).

### 1.3 Chỗ lệch quan trọng: V0.1 không thể làm nguyên văn

Bản thảo: "đặt `IssueCreationModeContext='manual'`; tab Dự thảo AI vẫn chọn được." Mã plugin (`app-plugin-projects/dist/client/pages/issues/new.js:45,58-64`)
và README: `manualOnly = useContext(...) === 'manual'` → `tab='manual'` và **không render `Tabs`**, bỏ qua `?tab=`, `?draft=`, `?job=` và `localStorage`.
Vậy 'manual' = chỉ còn form một việc, mất đường dự thảo AI. Thứ tự chọn tab của plugin (khi 'all'): `?tab=` hợp lệ → có `draft/job` thì `ai` →
`localStorage['pm:new-issue-tab']` → mặc định `ai`.
**Chủ dự án chọn (Q6):** mặc định Thủ công nhưng vẫn chọn được AI. Cách làm ở V0.1: bọc route `issues/new` bằng component Studio chuyển
hướng sang `?tab=manual` khi URL không có `tab`/`draft`/`job` (không dùng context).

## 2. Cơ chế plugin sẽ dùng (đọc README/skill; mọi bước ưu tiên các cơ chế này)

| Cần                     | Cơ chế                                                                                                                                                                                                                                                                                                     | Dùng ở                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Cập nhật thời gian thực | `useRealtimeRefresh(topic, refresh, {enabled, delayMs})` + `refreshRealtimeQueries(queryClient, {queryKey}, signal)`; gộp đợt sự kiện, tạm dừng khi tab ẩn, ngắt kết nối sau 10 phút ẩn (`hiddenDisconnectMs`), `onReady` đọc lại sau reconnect. Sự kiện chỉ là **báo hiệu mất hiệu lực**, không phát lại. | V1, V3                     |
| Topic có sẵn            | `pm:changes` (projects; payload có `issueIds`, hỗ trợ `announcedIssueIds`, `changedIssueSegments`, `isIssueRead` từ `client/kit`); `agents:runs:<runId>` (agents; ủy quyền theo quyền đọc run).                                                                                                            | V1, V3                     |
| Phát realtime từ Studio | `realtime.defineTopic/defineTopicFamily` (`@nocobase/realtime/server`), khai báo khi boot. **Chỉ cần nếu có sự kiện Studio tự sinh** (V3: `studio:attention`, tuỳ chọn).                                                                                                                                   | V3.1                       |
| Hộp thư                 | `notification-in-app` đã realtime; thông báo qua `createOutbound().deliver`/`sendDecisionAlerts` (đã dùng ở H).                                                                                                                                                                                            | V4.4 (nhắc hết hạn khoá)   |
| Tạo việc                | `IssueCreationModeContext` (`client/kit`) — **không dùng** (§1.3). `TABS`/`pm:new-issue-tab` là chi tiết nội bộ.                                                                                                                                                                                           | V0.1                       |
| Driver triển khai       | `DeploymentDriver`/`DriverSession` (`check, apply, start, stop, restart, remove, status, restore, logs, url, close`; `capabilities.logs`; `AppObservedStatus.lastAccessedAt`). **Không có `exec`**.                                                                                                        | V4, V5                     |
| Môi trường / App / biến | `relEnvironmentVariables`, `relAppVariables` (niêm phong, App thắng env, tên dành riêng bị từ chối `VARIABLE_RESERVED`); môi trường có `maxApps`, `defaultIdleStopMinutes`, `protected`, `approvers`.                                                                                                      | V4.2, V5.1                 |
| Khoá API                | Phạm vi `releases.apps` read/write **giới hạn theo `objects`**; preset "CI deploy" 90 ngày; khoá không được `create/configure/delete`. Quyền `rel.apps`: `view, read-logs, create, configure, upload, deploy, deploy-protected, operate, delete`.                                                          | V4.4, V5.3                 |
| Thư mục làm việc runner | Runs cùng máy **dùng chung thư mục tác vụ cố định**; runner báo trạng thái checkout (`agRunRepos`); "Clean working directory" mới checkout lại. Không có hook trước/sau run, nên "cache" phải do skill/agent làm.                                                                                          | V3.4                       |
| Biến/bí mật cho run     | `agSecrets` giao cho runner lúc claim, che trong sự kiện run. **Khác** biến của `releases`.                                                                                                                                                                                                                | V6.1 (không dùng cho Lark) |
| Playbook                | `server/playbooks/definitions.ts` (mảng `PLAYBOOK_DEFINITIONS`, cứng trong mã), `parser.ts` (`parsePlaybookInvocations`, regex `!slug key=value`), `service.ts` (`applyPlaybookToIssue`), kỹ năng `ds-pb-<slug>`.                                                                                          | V0.4, V5.3, V5.4           |

## 3. Đo trước — năm con số (làm ở V0.6, **trước V1**)

Mục đích: mỗi bước sau chứng minh được "thuận hơn" hay "nhanh hơn" bằng số, không bằng cảm giác. Ghi số vào bảng này khi đo; **hiện chưa đo**.

| #   | Số                                    | Cách lấy                                                                                                                                                                                                                                                         | Trước                                                           | Sau V3                                                             |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Giao việc → PR mở (trung vị, P90)     | Máy chủ tính: mốc việc sang `in_progress` có executor là agent (hoạt động của việc) → `dsPullRequests.createdAt` đầu tiên của việc. Mở rộng `server/reports/service.ts:129-149` (đã có cycle time tổng). 30 ngày gần nhất, theo dự án. Tên cột xác nhận khi làm. | chưa                                                            | chưa                                                               |
| 2   | Số lượt chạy mỗi việc (trung vị, P90) | Máy chủ: đếm `agRuns` theo việc đến khi PR mở. Cùng route báo cáo.                                                                                                                                                                                               | chưa                                                            | chưa                                                               |
| 3   | Số chạm: mở app → thấy "cần tôi"      | Quy ước đo tay trên điện thoại thật, 3 lần/ngày × 3 ngày, ghi trung vị; hiện theo A: 1 chạm + cuộn (quyết định), 2 (chat), 3 (phát hành), "không có đường" (run lỗi của việc không phải mình phụ trách). Mục tiêu: 0–1.                                          | chưa                                                            | chưa                                                               |
| 4   | Kích thước bundle đầu                 | Build trong WSL (`pnpm build`, không chạy trên runner); số byte (gzip) của các chunk nạp ở `/` — lấy từ `dist/client/assets` + `index.html`. Ghi cả tên chunk. Đo **trước V0** và **sau V3.3**.                                                                  | 1738 KB (529 KB gzip), bản `2a528a7`, chunk `index-BgnkxY7u.js` | 1617 KB (495 KB gzip) sau V3.3, chunk `index-Bzclsjab.js` (PR #98) |
| 5   | Tải trang việc trên 4G                | Chrome DevTools, giới hạn "Fast 4G", cache tắt, 5 lần, trung vị thời gian đến lúc khối "Cần bạn" hiển thị, trên một việc có >50 bản ghi; kèm số request (A#23: 7–9 hiện nay). Ghi dùng bản production.                                                           | chưa                                                            | chưa                                                               |

Số 1–2 hiển thị trên **Dashboard** (`client/pages/dashboard/index.tsx`) như thẻ "Nhịp giao việc"; số 3–5 nhập tay vào bảng `dsMetricSnapshots`
(V0.6) để có đường xu hướng trên cùng thẻ. Ghi lại số vào bảng trên trong cùng PR V0.6 và PR V3.

## 4. Các bước

Quy ước chung cho **mọi bước V** khi triển khai: một nhánh, một PR, CI xanh (3/3 job), commit tiếng Anh theo Conventional Commits, `git add <file>` theo
đường dẫn, kiểm tra **theo file** (không `pnpm check`/build/test toàn repo trên runner), cập nhật mục Tiến độ, production chỉ đổi khi chủ dự án
đồng ý theo `docs/trien-khai-vps.md` (sao lưu, tạm dừng tự lái, bật lại). Tên migration `YYYYMMDDNNNN_ds_<chủ đề>`, lấy số kế tiếp tại lúc làm (mới nhất
hiện là `202611110009_ds_playbook_invocations`). Mỗi trang mới/đổi có test viewport mobile 390 px, dùng helper chung `tests/client/helpers/mobile-viewport.ts`
(tạo ở V0, gói mẫu hiện rải rác: `vi.stubGlobal('innerWidth', 390)` + stub `matchMedia`, như `navigation-menu.test.tsx:416`). Mỗi route 401/403/thành công.

### V0 — Sửa nhanh (~2,25 ngày, làm trước)

**V0.1 — Tạo việc mặc định Thủ công (0,25)** — xử lý **A#13**.

- File: `client/routes.ts` (khai báo component thay route `issues/new` của plugin qua cơ chế ghi đè route component đã đăng ký, không khai lại route), `client/pages/issues/new-issue-entry.tsx` (mới), `client/locales/{vi-VN,en-US,zh-CN}.ts` (+ `overrides/vi-VN.ts` cho `newIssue.tabs.ai` = "Tách thành nhiều công việc", `newIssue.tabs.manual` = "Một công việc").
- Cơ chế: **không** dùng `IssueCreationModeContext` (§1.3). Component bọc nhận trang của plugin; nếu URL thiếu `tab`, `draft`, `job` thì `<Navigate replace to="?tab=manual">`; ngược lại render trang plugin. Bỏ qua `localStorage`. Thêm cảnh báo dưới tab AI: "Mỗi gạch đầu dòng sẽ thành một công việc" (khối của Studio đặt cạnh, không sửa plugin).
- Migration: không. Test: `tests/client/new-issue-entry.test.tsx` — không tham số → chuyển `?tab=manual`; `?tab=ai` giữ; `?job=x` giữ AI; mobile 390 px; thêm vào `tests/playwright/issue-flow.test.ts` bỏ ép `?tab=manual` (đã mặc định).
- Kiểm: vitest theo file; mở tay `/issues/new` trên bản dev. Điều kiện phải kiểm: ghi đè route component hoạt động với route do plugin khai (nếu không, phương án dự phòng là `NewIssueButton` luôn link `?tab=manual`; ghi vào `docs/chenh-lech-upstream.md`).

**V0.2 — Làm tươi khi quay lại ứng dụng (0,25)** — xử lý **A#4**.

- File: `client/hooks/use-my-work.ts`, `use-follow-ups.ts`, `use-task-groups.ts`, `use-issue-work.ts` (đặt `refetchOnWindowFocus:true`, `refetchOnReconnect:true` trên các truy vấn "cần tôi", việc, hộp thư; `staleTime` ngắn để tránh bão).
- Cơ chế: tùy chọn của `useQuery` (host đặt `false` toàn cục ở `query-client.js:9`, ghi đè theo truy vấn). Sửa chú thích sai "and when it regains focus" ở `use-my-work.ts`.
- Test: `tests/client/refetch-on-focus.test.tsx` — phát `visibilitychange`/`focus`, kỳ vọng gọi lại. Mobile: không cần (hook).

**V0.3 — Quét bí mật bắt đúng dạng thật (0,5)** — xử lý **B#9** (S2) và một phần **T**.

- File: `server/security/secret-patterns.ts`; `tests/server/secret-patterns.test.ts`.
- Mẫu mới: `\b[A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|SECRETS_KEYS?)\s*[:=]\s*['"]?[^\s'"]{12,}`; khoá Studio `\bds_[A-Za-z0-9]{20,}\b` (khớp cả đứng một mình); khoá Dokploy theo định dạng khoá (xác định khi làm, không in khoá thật vào mã/test — dùng chuỗi tổng hợp). Chuỗi tổng hợp dùng trong test phải chạy qua cùng bộ quét của CI mà không kích hoạt (dùng ghép chuỗi lúc chạy).
- Cơ chế: bộ quét H2b hiện có (che bằng `[NGHI LÀ BÍ MẬT]`, banner, `dsSecretFindings`). Chống dương tính giả: danh sách cho phép giá trị giữ chỗ (`***`, `${VAR}`, `<…>`, `changeme`).
- Test: bắt `LARK_APP_SECRET=…`, `DB_PASSWORD=…`, `SECRETS_KEYS=…`, `ds_…` đứng một mình; không bắt `LARK_APP_SECRET=${LARK_APP_SECRET}`, tên biến không có giá trị, văn bản thường.
- Ghi chú: sửa nhận định B#9 — `x-api-key: ds_…` đã được bắt từ trước.

**V0.4 — Sửa bốn playbook và chặn lỗi tái diễn (0,5)** — xử lý **B#19, T10**.

- File: `server/playbooks/definitions.ts`; `tests/server/playbooks-commands.test.ts` (mới).
- `!tao-app-nocobase`: bỏ `pnpm nocobase app:test` → tiêu chí `test`/`review` theo file (`pnpm exec vitest run <đường dẫn>` trong app đích). `!nang-template`: bỏ `pnpm typecheck` (nặng) → `pnpm exec tsc -p <tsconfig> --noEmit` theo thư mục hoặc tiêu chí `ci`. `!deploy-dokploy`: bỏ `pnpm build` → tiêu chí `ci`/`manual`, bước 1 trỏ `docs/` (sửa sau V5.2). `!nhap-lark`: bỏ test không tồn tại; trỏ lệnh `import-lark --dry-run` **chỉ khi V4 xong** — hiện tại ghi tiêu chí `manual` kèm ghi chú "chờ V4/V6.1" (không bịa lệnh).
- Cơ chế: playbook là mã (`PLAYBOOK_DEFINITIONS`) — **kỹ năng `ds-pb-*` có `revision`** (H0) nên phải nâng `revision` để `ensureBuiltinSkills` phát hành.
- Test: duyệt mọi tiêu chí `command` của mọi playbook: cấm `pnpm build|check|test|typecheck|lint` không có đường dẫn, cấm `app:test`; mọi đường dẫn test phải tồn tại ngoại trừ ngoại lệ có chú thích; kiểm `revision` đã tăng khi nội dung đổi.

**V0.5 — Một working tree, xuống dòng LF (0,25)** — xử lý **B#17**.

- File: `.gitattributes` (mới: `* text=auto eol=lf`, ngoại lệ nhị phân), `.agents/rules/duongsinh-studio.md` mục "Repository hygiene" (quy tắc: chỉ một working tree WSL `~/code/duongsinh-studio`; Orca mở qua `\\wsl.localhost\Ubuntu\home\duongsinh\code\...`; Windows `git config core.autocrlf false`; build production chỉ trong WSL), `docs/moi-truong-dev.md`.
- Test: `tests/project/gitattributes.test.ts` — file tồn tại, có dòng `eol=lf`. Kiểm: `git ls-files --eol | grep -c 'w/crlf'` = 0 (nếu có, một commit chuẩn hoá riêng). Kèm kiểm tra trong script build: từ chối khi `uname -s != Linux` (V6.3 làm đầy đủ).

**V0.6 — Đo trước (0,5 + chờ đo tay)** — nền cho mọi bước sau (§3).

- File: `database/main/migrations/2026111200NN_ds_metric_snapshots.ts` (`dsMetricSnapshots`: `metric`, `value`, `unit`, `note`, `takenAt`, `takenByUserId`), `server/routes/reports.ts` (+`GET /reports/flow` trả số 1–2; `POST /reports/metrics` ghi số 3–5, quyền `reports` của root), `server/reports/service.ts`, `client/pages/dashboard/index.tsx` (thẻ "Nhịp giao việc").
- Cơ chế: route theo luật HTTP API (`describeRoute`, `apiValidator`, `ApiError`, `auth.required()` + kiểm quyền trên đúng đường dẫn); báo cáo dùng dịch vụ có sẵn.
- Test: migration up/down; route 401/403/200; client thẻ có mobile 390 px.
- Đo: chạy các bước ở §3 trên production **trước khi V1 được merge**, ghi số vào §3.

### V1 — Trang "Hôm nay" và menu gọn (~2,5 ngày; sau V0.6)

Ràng buộc cứng: **chỉ đổi `navigation`/`parent` và nhóm trong `navigation-transform.ts`; KHÔNG đổi `name` hay `authz`** của route (page grant đang lưu; test
`page-permission-titles`, `client-routes`, `foundation-integration` giữ nguyên). Tên route sidebar phải còn nguyên:
`home, inbox, my-issues, my-sessions, dashboard, issues, follow-ups, pm-projects, knowledge, project-memory, project-setup, releases-hub, hosted-environments, agents, runtimes, skills, usage, models, settings`.

**V1.1 — Trang Hôm nay (1,5)** — xử lý **A#3, A#2** (một huy hiệu "Cần tôi"), nền cho A#14, A#17.

- File: `client/pages/home/index.tsx` (thay nội dung; route `home` giữ nguyên `/` và `authz:'skip'`), `client/hooks/use-today.ts` (mới), `client/hooks/use-follow-ups.ts` (huy hiệu đọc từ cùng cache, bỏ `BADGES_KEY` riêng), `client/pages/home/{need-me,agents-now,recent}.tsx`, `client/locales/*`.
- Cơ chế: một hook `useToday()` gộp bằng `Promise.allSettled` dưới **một** query key: `GET /api/inbox/waiting`, `/inbox/pending`, `/agents/conversationAttention` (plugin agents), `/api/attention` (phát hành), `/api/agentBoard`, `/api/reports/attention`, `/api/taskGroups` (nhóm done). Khối nào trả 403 thì tự ẩn. **Nhánh realtime**: `useRealtimeRefresh('pm:changes', …)` (việc, hoạt động) và `useRealtimeTopic('agents:runs:<id>')` cho các lượt đang hiện ở khối "Agent đang làm" (mỗi `runId` chỉ khi enabled); `refetchOnWindowFocus:true`; poll 60 s dự phòng (V3 gom tiếp). Phát hành (`/attention`) không có topic → chỉ poll + focus.
- Bố cục (một cột trên điện thoại): **Cần tôi** (tổng + ≤5 hàng, huy hiệu loại: Nghiệm thu/Trả lời/Lượt chạy lỗi/Bàn giao/Phát hành/Chat; "Xem tất cả" → `/inbox?view=todo`) → **Agent đang làm** (≤5 hàng, tên agent · DS-xx · từ khi nào · 1 dòng hoạt động cắt 80 ký tự; runner offline lấy `queue.reason`) → **Vừa xong / vừa hỏng 24 h**. Từ vựng "Cần tôi" thống nhất (A#24, §4 của A).
- Migration: không. Test: mở rộng `tests/client/home.test.tsx` (fixture thêm `agentBoard`, `attention`, `reports/attention`, `conversationAttention`); ca khối trả 403 bị ẩn; ca `Promise.allSettled` một nguồn lỗi vẫn hiện nguồn khác; **ca viewport 390 px**: ba khối xếp dọc, không có `overflow-x`; ca realtime: phát sự kiện → truy vấn bị làm mất hiệu lực.
- Kiểm: vitest theo file; mở trang trên điện thoại thật (hoặc DevTools 390 px) với dữ liệu thật.

**V1.2 — Menu 8 mục (0,5)** — xử lý **A#1, A#15, A#16, A#14** (Q4 chọn 8 mục).

- File: `client/routes.ts` (`navigation`/`parent` của các route), `client/lib/navigation-transform.ts` (bỏ 3 nhóm `sectionDevelopment/Releases/Agents`, giữ `groupFoundationNavigation`), `client/extensions/nocobase-inbox/model.ts` (mặc định `view=todo` khi có quyết định chờ; huy hiệu chỉ đếm `decision`, A#14), `client/pages/settings/` (thẻ nhóm "Agent & vận hành": Agent, Runner, Skill, Mô hình, Mức sử dụng, Playbooks, Bài học, Kiểm chứng, Phiếu review, Ngân sách, Biến & bí mật — A#19), `client/locales/*`.
- Menu: **Hôm nay** (`/`) · **Công việc** (`/issues`; `/my-issues` giữ URL, `Theo dõi` thành bộ lọc "Đang theo dõi") · **Phiên chat** (`/sessions`) · **Dự án** (`/projects`; Ghi nhớ dự án và Thiết lập dự án thành tab/nút) · **Phát hành** (`/releases`; Môi trường thành tab) · **Tri thức** · **Báo cáo** (`/dashboard`) · **Cài đặt**.
- Cơ chế: `navigation`/`parent` có sẵn; các route Agent giữ path và grant. Hộp thư thành nút chuông trên header (phần "info"). Bỏ hai icon header trùng huy hiệu trên mobile (A#2), giữ nút Chat.
- Test: `tests/client/sidebar-permissions.test.tsx` thêm ca "tổng số mục sidebar ≤ 8" với người có đủ quyền; ca người ít quyền vẫn có Hôm nay; **giữ nguyên** `client-routes.test.ts` (`settingsAuthorizations`), `foundation-integration.test.ts` (`settingsAi`), `page-permission-titles.test.ts` — nếu chúng đỏ thì dừng, không đổi `name/authz`; mobile 390 px (Sheet sidebar không cuộn mới thấy mục).

**V1.3 — Danh sách việc dùng được trên điện thoại (0,5)** — xử lý **A#5, A#6, A#7**.

- File: `client/pages/issues/issue-workspace.tsx` (dưới `md`: mặc định `list` toàn màn hình; chạm → trang việc; ẩn ToggleGroup Chia đôi/Hàng đợi; tìm + một nút "Lọc" mở Sheet), `issue-split-view.tsx` (bỏ `w-80 shrink-0` cố định dưới `lg`, ẩn chân phím tắt J/K), `issue-grouped-list.tsx` (ẩn cột Dự án/Người thực hiện dưới `md`, như `issue-table.tsx:383`).
- Cơ chế: `useIsMobile` (`client/hooks/use-mobile.ts`, 768 px); không đổi route. Test: sửa `issue-split-view.test.tsx:280` (mặc định split chỉ ≥ lg); thêm ca 390 px cho `issue-workspace` và `issue-grouped-list`.

### V2 — Trang việc đọc được trên điện thoại (~2 ngày; sau V1)

**V2.1 — "Cần bạn" ghim và thứ tự khối (0,75)** — xử lý **A#8, A#9, A#11, A#12**.

- File: `client/pages/issues/detail/issue-sticky-header.tsx` (thêm `needsYou` + nút hành động chính Nghiệm thu/Gửi lại/Trả lời, dữ liệu từ `useIssuePanels` đã có), `detail/index.tsx` (thứ tự mobile: Tiến độ + Cần bạn → Hoạt động → còn lại gập; Mô tả 3 dòng đầu gập/mở dưới tiêu đề), `client/components/criteria/criteria-editor.tsx` (`IssueCriteriaSection`: trả `null` khi rỗng và không có quyền sửa; có quyền thì một dòng "Thêm tiêu chí"; sửa chuỗi `'...'` thành khung xương), `issue-activity.tsx` (mobile: tự cuộn tới bình luận agent mới nhất khi mở tab; nút nổi "Mới nhất ↓").
- Cơ chế: dữ liệu có sẵn; không endpoint mới. Test: mở rộng `issue-detail-p2.test.tsx`, `criteria-editor.test.tsx`; **ca 390 px**: header dính hiện "Cần bạn" + nút; ca không quyền: tiêu chí rỗng không render.

**V2.2 — Một dòng thời gian (1)** — xử lý **A#10, B#18** (phần giao diện).

- File: `client/pages/issues/detail/issue-timeline.tsx` (mới, tab "Diễn biến" thay tab Hoạt động + Lượt chạy; giữ "Mô tả" và "Mã & xem thử" là tab phụ), dùng `useIssueTimeline` (plugin projects, `client/issues`), `useSubjectRuns`/`useRunWithTranscript` (plugin agents, `client/runs`), `dsPullRequests`, `dsVerifications`, `dsReviews`. Mỗi dòng: ai · làm gì · bao lâu (kể cả thời gian chờ runner và CI) · kết quả; bấm mới mở chi tiết/bản ghi. Mô tả dài gập.
- Cơ chế: **không viết lại** `issue-runs.tsx` mà tái dùng làm chi tiết; transcript giữ hook plugin (đã realtime theo `agents:runs:<id>`, poll 5 s dự phòng). Giữ nguyên `issue-progress.tsx`, `issue-needs-you.tsx` (A §5.4).
- Test: dựng từ fixture nhiều loại sự kiện, thứ tự thời gian, nhóm bản ghi hệ thống gập; mobile 390 px.

**V2.3 — Lưu thời lượng để trả lời "chậm ở đâu" (0,25 server)** — xử lý **B#18**.

- File: migration `2026111200NN_ds_checks_duration` (thêm `startedAt`, `completedAt` vào `dsReportedChecks`; kiểu tương ứng, nullable, `down` đảo ngược tường minh), nơi ghi check (`server/git/` — xác nhận khi làm), `GET /issuePanels/:id` trả thêm `queuedMs/startedAt` của run (từ `agRuns.createdAt/startedAt/finishedAt`, đã có trong API `issue-work.ts:607-609`).
- Test: migration up/down trên DB thật; route 401/403/200; client hiển thị thời gian chờ sau khi run đã bắt đầu.

### V3 — Nhanh thật (~2,5 ngày; sau V1/V2, đo ở §3)

**V3.1 — Realtime thay poll (1)** — xử lý **A#20**.

- Bước 0 (bắt buộc, ~0,25): xác nhận WebSocket `/main/ws` qua Traefik và bật `realtime:` trong `config.yml` production **nếu cần** (hiện khối này đang là chú thích; chat đã dùng `realtimeClientToken`). Không đoán — nếu không chạy, dừng và hỏi chủ dự án trước khi đổi cấu hình VPS.
- File: `client/hooks/use-realtime-invalidation.ts` (mới, bọc `useRealtimeRefresh`), các hook `use-my-work`, `use-follow-ups`, `use-task-groups`, `use-issue-work`, `use-today` đổi `refetchInterval` xuống **60 s dự phòng** (giữ, không bỏ), trang việc: `pm:changes` → `announcedIssueIds` để chỉ làm mới việc đang xem; `agents:runs:<runId>` cho run đang chạy.
- Cơ chế: `useRealtimeRefresh` + `refreshRealtimeQueries` (gộp đợt, tạm dừng khi ẩn, `onReady` đọc lại sau reconnect, tự ngắt sau 10 phút ẩn). Topic của Studio (tuỳ chọn): `studio:attention` khai bằng `defineTopic` khi boot, phát khi yêu cầu phát hành/cảnh báo đổi; chỉ làm nếu phát hành chậm cảm nhận được.
- Test: truy vấn bị làm mất hiệu lực khi có sự kiện; poll 60 s vẫn chạy khi mất kết nối; không đăng ký khi tab ẩn/`enabled:false`.

**V3.2 — Rẻ phía máy chủ (0,5)** — xử lý **A#21, A#23**.

- File: `server/routes/inbox.ts` (`decisionsOn`: tính một lần mỗi yêu cầu, cache trong bộ nhớ 15 s theo người dùng, vô hiệu khi `pm:changes`/ghi hoạt động; các route `/inbox/*` và `/taskGroups*` dùng chung), tuỳ chọn route `GET /api/me/today` gộp ba khối cho `useToday` (chỉ nếu đo thấy còn chậm — tránh thêm bề mặt API không cần), `GET /issuePanels/:id` gộp tiêu chí + secret-findings + kb offers (hoặc `staleTime` 15 s ở client).
- Test: số truy vấn cơ sở dữ liệu giảm (đếm bằng spy); 401/403/200; hiệu lực cache theo người dùng (không rò giữa hai người); cache vô hiệu sau cập nhật.

**V3.3 — Bundle đầu nhỏ (0,5)** — xử lý **A#22**. Đo số 4 §3 trước/sau.

- File: `client/layouts/app-layout.tsx` (`React.lazy` cho `ChatPanel`, `ChatFloatingButton`), `client/layouts/components/header-actions.tsx` (`ChatHeaderButton`), `client/pages/issues/detail/*` (lazy lịch sử lượt chạy), `client/components/markdown-view.tsx` (nạp `react-markdown` khi dùng lần đầu).
- Test: `tests/client/app-layout-routes.test.tsx` vẫn xanh; ca render lazy hiển thị nút chat trước khi chunk về (khung giữ chỗ); đo bằng build WSL ghi số vào §3.

**V3.4 — Runner: đo trước, rồi mới cache (0,5)** — xử lý chuỗi 5–7 lượt/việc.

- Đo (không viết mã): trên 5 việc gần nhất, ghi thời gian `pnpm install` mỗi lượt, `pnpm store` hiện ở đâu, thư mục tác vụ có được dùng lại không. **README agents nói runs cùng máy dùng chung thư mục tác vụ cố định**, nên có thể `node_modules` đã dùng lại và bản thảo "mỗi lượt cài lại" chỉ đúng khi "Clean working directory" hoặc checkout mới. Chỉ khi đo thấy cài lại thật mới làm tiếp.
- Nếu cần: (a) pnpm store dùng chung trên runner (`store-dir` trong `~/.local/share` của user `studio-runner`, thiết lập qua `.npmrc` của user; cần chủ dự án làm trên VPS — **không đụng VPS trong phiên lập kế hoạch**), (b) skill `ds-development` (revision tăng) dặn: không xoá `node_modules`, `pnpm install --offline --prefer-offline` trước, (c) gộp lượt kiểm chứng vào cuối lượt code (đổi lời dặn trong `issue-subject.ts`/`ds-development`, vì cổng `mayMove` đã ép kiểm chứng ở H1b), (d) **review chéo song song với CI, merge cần cả hai**: đổi `stageMergeAllowed` / `server/autopilot/evaluator.ts` để review khởi động ngay khi PR mở (không đợi CI xanh) và merge chỉ khi **cả hai** đạt — H1d hiện đòi CI xanh trước khi mở phiếu review nên phải sửa cổng, ghi rủi ro ở §7.
- Test: `tests/server/autopilot-evaluator.test.ts` — review chạy trong lúc CI chưa xong thì không merge; chỉ merge khi cả hai; CI đỏ thì không merge dù review approve; review reject thì không merge dù CI xanh. Đo số 1–2 trên Dashboard sau 2 tuần.

### V4 — Kênh chạy lệnh trong app và bí mật theo job (~5 ngày, nặng nhất)

**Thiết kế trước, HỎI chủ dự án rồi mới code.** Bước này chia hai PR: **V4.0 thiết kế + mô hình đe doạ (đã nằm trong kế hoạch này, §5)** — chủ dự án duyệt — rồi **V4.1–V4.5**.
Q1 đã chọn: daemon host + unix socket. **Việc của chủ dự án trên VPS (không phải agent):** cài daemon (service systemd root) và tạo `jobs/<app>.env` 0600. Agent không `ssh` vào VPS trong bất kỳ phiên nào của V4 nếu không được bảo.

**V4.1 — Daemon `ds-nb3-exec` (1,5)** — xử lý **B#4, B#5**.

- File: `deploy/nb3-exec/ds-nb3-exec.ts` (Node, không phụ thuộc ngoài; ~200 dòng), `deploy/nb3-exec/ds-nb3-exec.service` (systemd), `deploy/nb3-exec/README.md`, `deploy/dokploy/docker-compose.yml` (thêm mount **chỉ đọc** `/run/ds-nb3/exec.sock:/run/ds-nb3/exec.sock:ro` cho service `app` của Studio).
- Hành vi: nghe `/run/ds-nb3/exec.sock` (mode 0660, nhóm `studio-sock`, uid 1000 của container Studio được đọc/ghi qua nhóm). Nhận JSON dòng `{op, composeName, args, jobId}`; `op ∈ {run, logs, inspect, secret-set}`. Chỉ chấp nhận `composeName` khớp `^nb3-[a-z0-9-]+$` **và** có trong danh sách App Studio gửi kèm chữ ký HMAC (khoá chia sẻ `0600`, tạo khi cài; chống gọi từ tiến trình lạ trong cùng nhóm). `run` chạy bằng `execFile` (không shell): `docker compose -p <project> run --rm --no-deps [-e JOB=1] --env-file /srv/duongsinh-studio/jobs/<app>.env <svc> node dist/cli/index.js <topic> <cmd> [args]`, với `<topic> <cmd>` chỉ nằm trong allowlist theo App tải từ `/etc/ds-nb3-exec/allow.json` (root, 0600).
- Allowlist mặc định: `db migrate`/`apply` (qua `nocobase db …` của app), `db seed`, `edu import-lark --dry-run`, `edu import-lark --commit`, `edu …` (tập con liệt kê tên, không ký tự đại diện). Cờ `--commit`, `migrate`, `seed` là lệnh **ghi**.
- Giới hạn: thời gian tối đa mỗi job (mặc định 15 phút), 1 job/App tại một thời điểm, RAM `--memory` của container job = giới hạn của service `app`; log: cuốn vòng giữ **20 KB cuối**, che bí mật (giá trị trong `jobs/<app>.env` và mẫu của V0.3) trước khi rời daemon; trả mã thoát.
- Test (trong repo): `tests/deploy/nb3-exec.test.ts` chạy daemon với `docker` giả (script trong `tests/fixtures`) — từ chối `composeName` sai, lệnh ngoài allowlist, chữ ký sai, đường dẫn lạ trong `args`, ký tự điều khiển; che log; timeout; một job một lúc. **Không** chạy docker thật trong CI.
- Kiểm trên VPS: do chủ dự án cài và chạy checklist trong README (dry-run trên một App thử). Không đụng NocoEdu/`nocobase.dsc.edu.vn`.

**V4.2 — Bí mật theo job, compose hai service (1)** — xử lý **B#6, B#8**, nền cho V6.1.

- File: `server/releases/nb3-compose.ts` (sinh hai service từ cùng ảnh: `<name>-app` (web) và `<name>-job` (profile `job`, không khởi động theo mặc định)), `server/releases/dokploy-driver.ts` (`nb3ComposeEnv`: phân biến theo cờ), `server/providers/nb3-apps.ts`.
- Cơ chế plugin: biến App/Env của `releases` vẫn là nguồn sự thật; thêm **tiền tố quy ước `JOB_ONLY_`** (không đổi phía plugin) — biến có tiền tố này **không** vào `.env` của web; driver ghi chúng vào một **file riêng** `jobs/<app>.env` chỉ qua daemon (`secret-set`, đọc từ stdin, không qua Dokploy). `env_file` của `-app` chỉ liệt kê `.env`; `-job` thêm `jobs/<app>.env`. Cấm đặt `LARK_*`/`JOB_ONLY_*` ở tab Biến của App nếu không qua đường này (kiểm tên trong `nb3ComposeEnv`, trả lỗi rõ, không in giá trị).
- `.env` của compose: ghi `0600` bởi driver (Dokploy tạo file; xác nhận quyền thật — **chưa kiểm**, §1.2). Dokploy vẫn giữ `.env` web trong DB của nó (B#8 chấp nhận), nhưng không giữ bí mật job.
- Migration: không (bảng `dsNb3Apps` giữ nguyên). Test: `tests/server/nb3-compose.test.ts` — web không có biến job; job có; `-db` chỉ `POSTGRES_*`; từ chối `LARK_APP_SECRET` ở tab Biến; vẫn từ chối tên dành riêng.

**V4.3 — Route job và nhật ký (1)** — xử lý **B#4**.

- File: `server/providers/nb3-jobs.ts` (client của daemon qua unix socket, ký HMAC, dịch lỗi), `server/routes/nb3-jobs.ts`, migration `2026111200NN_ds_nb3_jobs` (`dsNb3Jobs`: `id`, `appId`, `command` (cụm lệnh đã chuẩn hoá), `args` (đã che), `dryRun`, `actorType/Id`, `issueId?`, `runId?`, `status` (`queued|running|succeeded|failed|timeout|denied`), `exitCode`, `startedAt`, `finishedAt`, `logTail` (20 KB đã che), `logSha256`), `server/agents/actions.ts` (action cho run).
- API: `POST /api/releases/apps/{appId}/jobs` `{command, args, dryRun}` → 202 `{data:{id}}`; `GET /api/releases/apps/{appId}/jobs/{id}` → trạng thái, mã thoát, `logTail`; `GET /api/releases/apps/{appId}/jobs` (danh sách có phân trang). camelCase, `{data}` thành công, `ApiError`, `apiValidator()`, `describeRoute()` kèm `cliRoute` (`ds-studio nb3 job run|get`). Middleware chỉ trên đường dẫn của route, không `use('*')`.
- Quyền: **`rel.apps/operate`** (theo bản thảo). Phân biệt thêm trong mã: lệnh **đọc** (`--dry-run`, `logs`) cần `operate`; lệnh **ghi** (`--commit`, `migrate`, `seed`) cần `operate` **và** là root/owner; agent chạy (run token) chỉ được `dryRun=true` khi việc có playbook `!nhap-lark` (khớp ý B §2.3). Cấp `operate.all` cho `ds-admin` bằng **seed mới** `2026111200NN_ds_roles_operate` (seed đã merge là lịch sử, không sửa seed cũ) — xử lý **B#20** — nhưng lệnh ghi chỉ root (Q8 đã chốt).
- Dữ liệu học viên: log job không được in bản ghi (chỉ đếm/diff cột) — đưa vào tiêu chí `!nhap-lark`. Log giữ 14 ngày (job dọn bằng tác vụ theo lịch).
- Test: route 401/403 (người thiếu `operate`, khoá API thiếu phạm vi, run token không có playbook)/202/200/409 (đã có job chạy)/429; migration up/down; client daemon giả: chữ ký, timeout, daemon sập → `503` có thông điệp rõ, không treo; lệnh ngoài allowlist → `denied` ghi nhật ký.

**V4.4 — Trạng thái thật, log thật, khoá CI hẹp (1)** — xử lý **B#5, B#7**, nền cho **B#11**.

- `dokploy-driver.ts`: `capabilities.logs=true`; `logs(appId, query)` gọi daemon `logs` (`docker logs --since`, che bí mật), trả `JournalPage`; `status()` gọi daemon `inspect` (`docker inspect` các container compose) — container chết/OOM → `failed`/`stopped` và **giải phóng suất** `capacityProblem`; điền `lastAccessedAt` (xem V5.1). Nếu daemon không tới được → rơi về hành vi cũ (đọc bảng) và gắn `unknown` thay vì `running` giả; không chặn deploy.
- `server/routes/builds.ts` (`issueCiKey`): `objects: [appIds của repo]`, `CI_KEY_DAYS = 90`; xoay khi gỡ App (`DELETE /ci/apps/:appId`); nhắc hết hạn vào Hộp thư 14 ngày trước bằng `createOutbound().deliver` + tác vụ theo lịch (cũng đóng dòng M5 "nhắc khoá CI"). Khoá cũ 365 ngày: liệt kê và đề nghị xoay (không tự xoay trên production). Dùng đúng phạm vi plugin (`releases.apps` write giới hạn `objects`), không phát minh quyền.
- Test: khoá chỉ thấy đúng App của repo (khoá repo A không đụng App của repo B → 403); `status()` phản ánh container chết; `logs()` phân trang; khoá không có `objects` bị từ chối khi cấp.

**V4.5 — Tài liệu (0,5)**: `docs/trien-khai-vps.md` mục "Kênh job" (cài daemon, quyền, xoay HMAC, kiểm tra), `docs/chenh-lech-upstream.md` (driver Studio vượt hợp đồng: logs/status qua daemon; `JOB_ONLY_`), `.agents/rules/duongsinh-studio.md` (sửa T9: App Hosts nay có driver `dokploy` + env `external`).

### V5 — Dung lượng, sao lưu, đăng ký app (~4 ngày; sau V4)

**V5.1 — Suất theo môi trường, cổng RAM, tự dừng thật (1,5)** — xử lý **B#11, B#12, B#13, B#21–23, T4, T5**.

- File: `server/releases/dokploy-driver.ts` (`capacityProblem` đếm **theo môi trường** của chính row; production không chiếm suất preview; trần cứng 2 đổi thành cấu hình nhưng **chỉ khi cổng RAM bật**), `server/releases/host-memory.ts` (mới, đọc `/proc/meminfo` — dùng lại `hostAvailableMb()` có sẵn; ngưỡng `NB3_MIN_AVAILABLE_MB` trong `server/config/` đã khai biến; mặc định 1200 như preview NB2), `sweepIdle` (điều kiện dừng: **N phút không có request**, `lastAccessedAt` lấy từ daemon bằng cách đọc access log Traefik của host theo tên miền App, hoặc probe `/api/healthz`/đếm hit; fallback: không dừng nếu không có dữ liệu — an toàn hơn dừng nhầm), `check()` (thử `mkdir`+ghi vào `dataDir`, phân giải DNS các `hosts` về IP VPS, báo từng mục — B#21), `start()` không giữ `idleStopMinutes` khi bật tay (hoặc đặt lại bộ đếm), sinh `DB_PASSWORD` lười ở `apply()` (B#22), giữ 2 bản `dist` mỗi App (bản chạy + 1 rollback) (B#23), `database/main/seeds/` thêm seed sửa môi trường cũ (preview NB2 `maxApps 2`, wildcard `pr-{number}`) — seed **mới**, không sửa seed cũ.
- UI: thẻ "Máy chủ" trên trang Phát hành (`client/pages/releases/`): RAM còn trống, App đang chạy + giới hạn RAM, runner bận/rảnh (đọc `GET /api/runner/recommendations`, gỡ hằng `estimatedPeakMemoryMb:1850` bằng số đo `memory.peak` của `user-1002.slice` qua daemon `inspect-host`, thêm sau) — mobile 390 px.
- Tài liệu: sửa T4/T5 và đổi chữ "tự dừng sau N phút kể từ lúc bật" **trong khi** hành vi mới chưa lên; khi lên thì sửa lại thành "không có request".
- Test: capacity đếm theo môi trường (production + preview + một app thử cùng lúc); RAM dưới ngưỡng → từ chối `start/apply` với lý do rõ; `sweepIdle` không dừng app có request gần đây, không dừng khi thiếu dữ liệu; `check()` báo `EACCES`; migration/seed up/down.

**V5.2 — Sao lưu mọi app, dump trước khi xoá (1)** — xử lý **B#14, B#15** (phần dữ liệu); đóng dòng M5 "sao lưu ra Drive" cho phần app.

- File: `deploy/dokploy/backup.sh` (mở rộng: với mỗi project Docker `nb3-*` có container `-db` → `pg_dump -Fc` vào `backups/nb3/<app>-<ngày>.dump`; với App SQLite → `sqlite3 .backup` (hoặc dừng ngắn/WAL) + tar volume `storage` của app; loại `storage/nb3-apps/*/dist` khỏi tar Studio ~80 MB/bản; `umask 077`; giữ **14 ngày** (Q3), dọn cũ; ghi `backup.log`), `deploy/dokploy/backup-nb3-restore.md`, `server/releases/dokploy-driver.ts` (`remove(purgeData)` **gọi daemon `dump` trước** và ghi `backupRef`; thất bại dump → **từ chối xoá**), nhãn `backupRef` vào deployment labels khi deploy production (dump trước migration), `docs/trien-khai-vps.md` mục "Sao lưu và khôi phục app NB3 / rollback dữ liệu".
- Đẩy ra ngoài: rclone sang Drive hằng đêm (K0.3/M5 còn nợ) — **chờ chủ dự án cấp quyền**; V5.2 không coi là xong cho tới khi bật được (ghi rõ trong Tiến độ), nhưng phần dump cục bộ có thể merge trước.
- Test: `tests/deploy/backup-nb3.test.ts` chạy script với `docker`/`pg_dump` giả (dò cờ, tên file, quyền 0600, dọn >14 ngày, không dump app ngoài `nb3-*`); `remove(purge)` không xoá khi dump lỗi; khôi phục thử ở chỗ riêng (chủ dự án thực hiện).
- Kiểm: chạy thử trên VPS **do chủ dự án bảo**; khôi phục vào DB tạm.

**V5.3 — Playbook `!noi-app-nb3` và form đăng ký (1)** — xử lý **B#1, B#2**, hợp nhất workflow (T6, T7).

- **Xếp lịch**: V5.3 và M4.3 cùng chạm mẫu workflow preview; **không bắt đầu V5.3 khi M4.3 chưa đóng** hoặc chủ dự án chưa nói V thay thế M4.3 (tránh ba mẫu workflow).
- File: `server/routes/nb3-apps-register.ts` (`POST /api/nb3Apps/register {repositoryId, appId, host, role, database}`, root; làm trong một giao dịch: tạo/gán môi trường (form thay JSON), tạo App, gán `dsRepositoryApps`, cấp khoá CI hẹp theo V4.4, sinh workflow), `server/setups/ci-workflow.ts` + `server/routes/builds.ts` (một mẫu duy nhất: ticket `/api/releases/apps/{appId}/uploadTickets` + `X-Release-Deploy` + `--exclude '*/.bin' --exclude dist/.env`; bỏ `/api/builds/deploy` trả `APP_HOST_OFF`; **xác nhận trên `<studio>/api/swagger` thật**), `client/pages/releases/register-app.tsx` (checklist còn lại: DNS (nút "Kiểm DNS" phân giải host ↔ IP VPS), secret GitHub `STUDIO_URL`/`STUDIO_API_KEY`, đẩy workflow bằng token cá nhân có quyền Workflows), `server/playbooks/definitions.ts` (`!noi-app-nb3`, `ds-pb-noi-app-nb3`, revision), `server/routes/project-setups.ts` (`deploy:true` nay tạo App xem thử thật thay vì `deployLater`, B#2).
- Test: route 401/403/200/409 (App/repo trùng); lỗi giữa chừng không để App nửa vời (giao dịch); workflow sinh ra khớp snapshot; form mobile 390 px; playbook gọi bằng `!noi-app-nb3 repo=… app=…` (parser).
- Không làm: không tự thêm DNS hay secret GitHub (không thuộc hệ của Studio).

**V5.4 — Nhận nuôi NocoEdu: `!don-app-nb3` (0,5 kế hoạch + chạy thật chờ người)** — xử lý **B#3**, DS-60 (đã đóng).

- **Dừng chờ trước khi viết**: đã có khảo sát chỉ đọc (12/11, `docs/plans/2026-11-12-khao-sat-vps-nocoedu.md`): NocoEdu chạy ở project Dokploy `nocoedu`, compose `compose-synthesize-online-firewall-897jlk` (ảnh build từ GitHub, Postgres 16 15 MB, volume `…_nocoedu-pg` và `…_nocoedu-storage`), miền `nocoedu.dsc.edu.vn`. **Thiết kế V5.4 phải đổi so với bản thảo:** đích không còn là compose `nb3-nocoedu` mới có volume trống, và đây có thể đã là bản sau di dời từ SQLite (12/11). Việc đầu tiên là hỏi chủ dự án: giữ compose này (build từ source) hay chuyển sang `dist` archive của plugin `releases`? Trước đó cần có sao lưu Postgres (khảo sát §2.1). V5.4 chưa bắt đầu.
- Thiết kế (không đổi sau khi có Q7): playbook `!don-app-nb3` có các bước **dừng chờ người** — (1) sao lưu compose cũ (pg_dump/tar) và xác nhận kích thước; (2) tạo App `nocoedu` mới trong env `dokploy` → compose `nb3-nocoedu` do Studio quản (volume trống); (3) `pg_dump` compose cũ → restore vào mới qua kênh job (`db restore` nằm trong allowlist riêng, root); (4) kiểm: đếm bảng, `healthz`, đăng nhập thử, so số bản ghi; (5) **chủ dự án đổi DNS**; (6) giữ compose cũ ở trạng thái dừng 14 ngày rồi mới xoá (chủ dự án xoá). Mỗi bước ghi tiêu chí `manual`/`command` rõ; không bước nào chạm `nocobase.dsc.edu.vn`.
- Phụ thuộc: V4 (kênh job), V5.2 (sao lưu). Thứ tự khớp Q2: sau V4, trước nhập Lark thật.

### V6 — Lark, tài liệu, phát hành (~1,5 ngày; sau V5)

**V6.1 — Lark qua tenant token, chạy trên kênh job (0,5)** — xử lý **B#10, T12**.

- Không cài `lark-cli` lên runner; `lark-cli` chỉ dùng trên máy Thầy để khảo sát. Lệnh `import-lark` nằm **trong NocoEdu** (repo NocoEdu, không phải repo này): lấy `tenant_access_token` từ `LARK_APP_ID`/`LARK_APP_SECRET`, đọc `bitable` bằng phân trang ≤500 bản ghi, ghi tuần tự (batch ≤500, một lệnh ghi tại một thời điểm trên cùng một Base), thử lại 429 với backoff mũ. Bí mật đi theo V4.2 (`jobs/<app>.env`), **không** qua tab Biến.
- Repo này: playbook `!nhap-lark` trỏ `ds-studio nb3 job run edu import-lark --dry-run` và test thật của NocoEdu; `docs/lark-cho-dsc.md` (mới: app Lark nào, scope `bitable:app:readonly`, ai giữ secret, bảng nguồn, giới hạn API, QPS "chưa tra" ghi rõ), `server/runner/service.ts` giữ `open.larksuite.com` trong allowlist đề xuất (runner chưa bị giới hạn mạng).
- Test: playbook-commands (V0.4) xanh với lệnh mới; không có test Lark trong repo này (thuộc NocoEdu).

**V6.2 — Dọn tài liệu và ngôn từ (0,5)** — xử lý **T1–T12, A#24, A#18, A#20 (hằng chuỗi), §4 của A**.

- Sửa 12 chỗ lệch (danh sách B §2.8): T1 `trien-khai-vps.md:127` (đã có UI tạo khoá); T2 `:143` (GitHub App đã "All repositories"); T3 `:98-99` (cron backup); T4 `:186`, `xem-thu-app-nb3.md:4`; T5 `xem-thu-app-nb3.md:3-5` và seed; T6 `:21`; T7 `:53-66`; T8 `AGENTS.md` (bỏ `cli/commands/` hoặc ghi "thư mục chưa có") — **AGENTS.md là file của template; chỉ sửa dòng này và ghi vào `chenh-lech-upstream.md`**; T9 rule; T10 playbook (V0.4); T11 `runner-resource-limits-proposal.md:30`; T12 `moi-truong-dev.md`.
- Thống nhất từ theo `docs/thuat-ngu.md`: bộ trạng thái **Chờ làm / Đang làm / Đang vướng / Chờ nghiệm thu / Xong** cho `issues.groups.*`, `followUps.group.*`; "Cần tôi" cho bốn cách gọi cùng một thứ; "Lỗi" cho lượt chạy, "Không đạt" cho kiểm chứng/bench; "Huỷ"/"Xoá". Đè **20 chuỗi** theo bảng A §4 bằng `client/locales/overrides/vi-VN.ts`; hai placeholder mã cứng chuyển vào khoá dịch (`lessons.tagPlaceholder`, `issuePrefix.placeholder`); `propose-lesson-dialog.tsx:105`, `projects-general.tsx:121`. Bảng playbook/kiểm chứng in `identifier` + liên kết (A#18).
- Test: `tests/client/vi-plugin-overrides.test.ts` (mở rộng: cấm "Vấn đề/đặc vụ/thi hành/Đại tướng/Chia tay lần nữa" ở khoá hiển thị); `locale-parity.test.ts`, `app-locale-coverage.test.ts` xanh; thêm ca chặn "Hủy/Xóa".

**V6.3 — Phát hành Studio bằng GitHub Actions (0,5 + thiết lập của chủ dự án)** — xử lý **B#16, B#17**; Q5 đã đồng ý (khoá riêng chỉ cho deploy, xoay 90 ngày). Đóng dòng M5 "tự động build bản phát hành".

- File: `.github/workflows/release.yml` (trigger tag `v*`; Ubuntu runner; `pnpm install --frozen-lockfile`; `pnpm build --target linux-x64 --node-version 24`; `pnpm nocobase dist check`; đóng gói tarball `studio-<sha>.tar.gz` làm Release asset; **không** SSH từ Actions — chỉ tải lên Release), `deploy/dokploy/release.sh <tag|sha>` (chạy **trên VPS bởi chủ dự án** hoặc cron: tải asset bằng token chỉ-đọc, kiểm SHA-256, giải nén, `chown 1000:1000`, đổi `STUDIO_RELEASE`, dọn còn 3 bản, in hướng dẫn "chờ không còn run", tạm dừng tự lái bật/tắt theo `docs/trien-khai-vps.md`), script build từ chối khi `uname -s != Linux`, cây làm việc bẩn, hoặc `HEAD != origin/main`.
- Quyết định mở (không cần khoá SSH trong secret nếu kéo bằng `release.sh`): Q5 cho phép khoá deploy trong secret; thiết kế này **chưa cần** dùng nó — chỉ cần khi muốn Actions tự đẩy. Mặc định: Actions chỉ dựng, VPS tự kéo. Nếu chủ dự án muốn Actions tự đẩy thì mới dùng khoá riêng xoay 90 ngày.
- Test: `tests/project/release-workflow.test.ts` (workflow có `linux-x64`, `dist check`, không có `echo` secret); `shellcheck` + bats-giả cho `release.sh` (kiểm SHA sai → thoát khác 0). Production: chỉ đổi khi chủ dự án đồng ý, theo quy trình hiện có.

## 5. Mô hình đe doạ của kênh job (V4) — ngắn

**Tài sản:** dữ liệu học viên (trẻ em) trong DB app; bí mật tích hợp (`LARK_APP_SECRET`); quyền root trên VPS đang chạy production NB2.

| Câu hỏi                      | Trả lời                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ai gọi được daemon?**      | Chỉ tiến trình có quyền ghi vào `/run/ds-nb3/exec.sock` (nhóm `studio-sock`, mount chỉ vào container Studio) **và** biết khoá HMAC trong `/etc/ds-nb3-exec/hmac.key` (0600, Studio đọc qua secret của nó). Người dùng/agent không gọi trực tiếp: phải qua route Studio có `auth.required()` + `rel.apps/operate` (+ root cho lệnh ghi). `studio-runner` (user 1002) và agent **không** có đường tới socket.                                                   |
| **Daemon từ chối gì?**       | `composeName` không khớp `^nb3-[a-z0-9-]+$`; App không có trong allowlist; lệnh không có trong `allow.json` của App; đối số có ký tự điều khiển, `..`, `/`, `-v`, `--volume`, `--env`, `-e`, `--entrypoint`, `-u/--user`, `--privileged`; chữ ký sai/lặp (nonce + thời gian ±60 s); job thứ hai khi đã có job chạy trên App; quá thời gian; `docker` khác `compose run/logs/inspect/cp-dump`. Không bao giờ qua shell; không `docker exec`; không mount thêm. |
| **Studio bị chiếm thì sao?** | Kẻ tấn công trong Studio chỉ chạy được lệnh trong allowlist trên các App đã đăng ký, mỗi lệnh bị chặn bởi giới hạn thời gian/RAM/một-job; không đọc được `jobs/<app>.env` (chỉ `secret-set` ghi, không có `secret-get`); **không có Docker socket** và **không có khoá Dokploy dùng cho exec**. Rủi ro còn lại: chạy `import-lark --commit`/`migrate` ngoài ý — giảm bằng root-only cho lệnh ghi, nhật ký, sao lưu trước lệnh ghi (V5.2).                     |
| **Log có thể chứa gì?**      | Log do chính lệnh app in ra: có thể có tên/ID học viên nếu lệnh in bản ghi. Giảm: lệnh import in **đếm/diff cột**, không in bản ghi (tiêu chí playbook); daemon che giá trị trong `jobs/<app>.env` + mẫu bí mật V0.3; chỉ giữ **20 KB cuối** + băm toàn bộ; xoá sau 14 ngày; `logTail` chỉ trả cho người có `operate`.                                                                                                                                        |
| **Daemon sập/bị ngắt?**      | Route trả `503 NB3_JOB_CHANNEL_DOWN`, không chạy job; `status()` về `unknown`; deploy/stop/start vẫn chạy qua driver cũ.                                                                                                                                                                                                                                                                                                                                      |
| **Khoá HMAC lộ?**            | Xoay bằng `ds-nb3-exec rotate-key` (chủ dự án chạy trên VPS) + cập nhật secret Studio; daemon từ chối chữ ký cũ ngay.                                                                                                                                                                                                                                                                                                                                         |
| **Không làm**                | Mount Docker socket vào Studio; thêm `studio-runner` vào nhóm `docker`; exec qua khoá Dokploy (khoá toàn tài khoản); SSH từ job; để daemon nhận lệnh tuỳ ý.                                                                                                                                                                                                                                                                                                   |

Giới hạn thừa nhận: SQLite + `compose run` song song → `SQLITE_BUSY`; với App SQLite, job phải dừng app trước hoặc bật WAL (ghi vào tài liệu V4.5).

## 6. Thứ tự, công sức và xếp lịch

Thứ tự: **V0 → V1 → V2 → V3 → V4 → V5 → V6**. V2 và V4 khác nhánh, khác file nên chạy song song được nếu có hai agent/người. Bản thảo đặt V4 trước V3; kế hoạch này đặt V3 trước vì V3.1 cần xác nhận WebSocket và V3 dùng chung file hook với V1. Ước lượng:

| Bước | Ngày    | Ghi chú                                                                    |
| ---- | ------- | -------------------------------------------------------------------------- |
| V0   | 2,25    | Đo trước (V0.6) chặn V1                                                    |
| V1   | 2,5     |                                                                            |
| V2   | 2       |                                                                            |
| V3   | 2,5     | V3.4 có thể giảm còn 0,5 nếu đo cho thấy `node_modules` đã được dùng lại   |
| V4   | 5       | + ~0,5 ngày chủ dự án cài daemon; **chờ duyệt thiết kế §5 trước khi code** |
| V5   | 4       | V5.3 chờ M4.3 đóng; V5.4 xong (giữ compose); rclone chờ chủ dự án                      |
| V6   | 1,5     | V6.3 cần chủ dự án thiết lập Release asset/token đọc                       |
| Tổng | ≈ 19,75 | ngày agent, rải 3–4 tuần                                                   |

**Xếp lịch với việc M4/M5 còn dở** (không trộn): các việc mở theo `docs/plans/2026-11-08-studio-hoan-thien-theo-tai-lieu.md` và nhật ký 09/11 là
**M4.3** (preview PR cho app NB3; một phần đã có tài liệu `xem-thu-app-nb3.md`, workflow "chưa kiểm trên GitHub thật"), **M4.4** (phát hành theo version), **M4.5** (giao diện nguồn check),
**M5** (rclone, token GitHub có Workflows, Gmail, xoá khoá Dokploy cũ, nhắc khoá CI, build tự động bản phát hành). Nguyên tắc:

- M4.3–M4.5 và M5 **không được gộp vào PR V**. Mỗi việc một nhánh riêng.
- V chỉ **thay** các dòng M5 sau khi chủ dự án đồng ý: "nhắc khoá CI" ← V4.4; "build bản phát hành bằng Actions" ← V6.3; "sao lưu ra Drive" ← V5.2 (phần app; phần Studio vẫn M5). Khi V làm xong thì đánh dấu dòng M5 tương ứng "đã làm ở V".
- Va chạm file: M4.3 và V5.3 (mẫu workflow, `ci-workflow.ts`, `builds.ts`) → làm M4.3 trước; V4.4 và M4.3 cùng chạm `issueCiKey` → V4.4 rebase trên M4.3 nếu M4.3 đang mở. Chạm `client/routes.ts`: V1 và bất kỳ trang mới của M4.5 → một PR merge trước, PR sau rebase.
- Việc phải **dừng chờ người** (không agent tự làm): cài daemon; rclone/Drive; token GitHub Workflows; DNS; Q7; đổi `config.yml`/Traefik/Dokploy trên VPS; mọi deploy production.

## 7. Rủi ro và va chạm

| Rủi ro                                               | Mức  | Cách giảm                                                                                                                          |
| ---------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| V1 đổi nav làm lệch page grant                       | cao  | Không đổi `name`/`authz`; chạy `client-routes`, `foundation-integration`, `page-permission-titles` mỗi PR; dừng nếu đỏ             |
| V0.1 ghi đè route plugin không được                  | vừa  | Phương án dự phòng: `NewIssueButton` link `?tab=manual`; ghi vào `chenh-lech-upstream.md`                                          |
| WebSocket không qua Traefik                          | vừa  | V3.1 bước 0; giữ poll 60 s; không đổi VPS khi chưa hỏi                                                                             |
| V3.4(d) review song song làm tăng chi phí/tiền model | vừa  | Đo số 2 và chi phí run trước/sau; có cờ tắt trong cấu hình; H1d (cổng tất định) vẫn chạy trước khi merge                           |
| V4.1 daemon root là bề mặt tấn công mới              | cao  | Thiết kế §5; code ngắn, không phụ thuộc, test với `docker` giả; chủ dự án duyệt trước khi cài; không mở rộng allowlist mà không PR |
| V4.2 sinh hai service làm app đang chạy phải tạo lại | vừa  | Chỉ áp dụng cho deploy mới; NocoLMS/NocoEdu hiện có đổi khi chủ dự án đồng ý, kèm sao lưu                                          |
| V5.1 đổi cách đếm `maxApps` làm vượt RAM             | cao  | Cổng RAM bật **cùng lúc** với đổi cách đếm; ngưỡng cấu hình; VPS đã dùng 8,6 GiB swap (`m4-1`)                                     |
| V5.2 dump SQLite khi app đang ghi                    | vừa  | `.backup` của SQLite hoặc dừng ngắn; ghi vào tài liệu; khôi phục thử                                                               |
| V5.4 mất dữ liệu khi di dời                          | cao  | Sao lưu trước, giữ compose cũ 14 ngày, bước dừng chờ người, kiểm đếm bản ghi                                                       |
| Bí mật in ra phiên (đã xảy ra)                       | vừa  | Đọc vào biến/`--api-key-stdin`; V0.3; không in khoá trong log kế hoạch hay test                                                    |
| Chạm file `AGENTS.md` làm khó nâng cấp template      | thấp | Chỉ sửa một dòng, ghi vào `chenh-lech-upstream.md`                                                                                 |

## 8. Không làm

Docker socket trong container Studio; exec qua khoá Dokploy; OAuth Lark trên runner; cài `lark-cli` lên runner; thêm runner/vendor model trong đợt này; đổi `name`/`authz`
route; viết lại trang Phiên chat và Hộp thư của plugin (đã mobile + realtime, dùng làm mẫu); tìm kiếm ngữ nghĩa; đặt `idleStopMinutes` cho App production;
nâng trần `maxApps` mà chưa có cổng RAM; `IssueCreationModeContext='manual'` (mất tab AI); chạm `nocobase.dsc.edu.vn`; chạy lệnh trên VPS trong phiên lập kế hoạch.

## 9. Câu hỏi đã hỏi chủ dự án và câu trả lời (12/11/2026)

| #   | Câu hỏi                                                                 | Khuyến nghị                                 | **Trả lời**                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Kênh job (V4): daemon host hay job qua GitHub Actions?                  | Daemon host + unix socket                   | **Daemon host + unix socket**                                                                                                                                                                 |
| Q2  | Nhận nuôi NocoEdu (V5.4) ngay sau V4 hay sau nhập Lark?                 | Sau V4, trước nhập Lark thật                | **Sau V4, trước nhập Lark thật**                                                                                                                                                              |
| Q3  | Giữ dump app NB3 trên VPS bao lâu trước khi đẩy ra ngoài?               | 14 ngày, đẩy Drive hằng đêm                 | **14 ngày, đẩy Drive hằng đêm** (rclone chờ chủ dự án cấp quyền)                                                                                                                              |
| Q4  | Menu: 8 mục hay giữ Agent/Runner ở cấp 1?                               | 8 mục                                       | **8 mục**                                                                                                                                                                                     |
| Q5  | Cho phép khoá deploy trong secret của Actions?                          | Có, khoá riêng chỉ cho deploy, xoay 90 ngày | **Có**, khoá riêng chỉ cho deploy, xoay 90 ngày (thiết kế V6.3 mặc định chưa cần tới)                                                                                                         |
| Q6  | (mới) V0.1: không dùng được `'manual'` nếu muốn giữ tab AI — chọn cách? | Mặc định Thủ công, vẫn chọn được AI         | **Mặc định Thủ công, vẫn chọn được AI** (chuyển hướng `?tab=manual`, không dùng context)                                                                                                      |
| Q7  | NocoEdu production ở compose/project Dokploy nào, DB gì, miền nào?      | —                                           | **Đủ (khảo sát 12/11):** project `nocoedu`, compose `compose-synthesize-online-firewall-897jlk`, Postgres 16, miền `nocoedu.dsc.edu.vn`. Còn hỏi: giữ build-từ-source hay chuyển sang `dist`? |

Đã chốt khi duyệt kế hoạch (12/11/2026):

- **Q8** — Lệnh ghi qua kênh job (`--commit`, `migrate`, `seed`): **chỉ root**. `ds-admin` (có `operate`) chỉ chạy dry-run và đọc log.
- **Q9** — V3.4(d): **có** đổi cổng merge để review chạy song song với CI, kèm cờ tắt; đo chi phí sau 2 tuần.
- **Q10** — **Làm M4.3 trước V5.3**; V5.3 không bắt đầu khi M4.3 chưa đóng.

## 10. Ghi vào `docs/chenh-lech-upstream.md` khi làm

V0.1 (route ghi đè, tại sao không dùng `IssueCreationModeContext`); V3.1 (cấu hình realtime, topic `studio:attention` nếu có); V4 (daemon ngoài hợp đồng driver; `logs/status` driver Studio vượt mặc định;
`JOB_ONLY_`); V5.1 (`lastAccessedAt` do daemon điền; đếm suất theo môi trường); sửa nhận định B#9, B#14 (đã ghi ở §1.2).

## 11. Tiến độ

- [x] V0 — Sửa nhanh (mã đã merge 12/11/2026; chưa deploy production, năm con số §3 chưa đo)
  - [x] V0.1 tạo việc mặc định Thủ công (#81)
  - [x] V0.2 làm tươi khi quay lại (#82)
  - [x] V0.3 quét bí mật (#83; còn thiếu mẫu khoá `ds_…`/Dokploy, chờ định dạng khoá)
  - [x] V0.4 sửa playbook (#84)
  - [x] V0.5 `.gitattributes` và quy tắc một working tree (#85)
  - [x] V0.6 đo trước (#86; số liệu chưa đo)
- [x] V1 — Hôm nay và menu (mã đã merge 12/11/2026; chưa deploy production)
  - [x] V1.1 trang Hôm nay (#89)
  - [x] V1.2 menu 8 mục (#90)
  - [x] V1.3 danh sách việc trên điện thoại (#91)
- [x] V2 — Trang việc (mã đã merge; chưa deploy)
  - [x] V2.1 "Cần bạn" ghim, thứ tự khối (#92)
  - [x] V2.2 dòng thời gian (#93)
  - [x] V2.3 lưu thời lượng (#94 migration `202611120002`, #95 hiển thị)
- [x] V3 — Nhanh thật (mã đã merge; chưa deploy; V3.4 không cần cache, xem dưới)
  - [x] V3.1 realtime (#96; **chưa kiểm WebSocket đăng nhập trên production**; `/main/ws` trả 426 khi chưa xác thực qua Traefik)
  - [x] V3.2 chia sẻ `decisionsOn` khi chạy chồng nhau (#97; không giữ kết quả sau khi xong, xem PR)
  - [x] V3.3 bundle đầu (#98; 1738 → 1617 KB, gzip 529 → 495 KB)
  - [x] V3.4 runner (#100): **không làm cache `node_modules`** vì đo thực tế 12/11 cho thấy 0/40 lượt gần nhất có `pnpm install`, thư mục tác vụ giữ `node_modules` và kho pnpm 1,1 GB đã dùng chung; chỉ làm review chạy song song với CI (Q9, công tắc `REVIEW_PARALLEL_WITH_CI`)
- [x] V4 — Kênh job và bí mật (mã xong; **daemon chưa cài lên VPS**: chủ dự án làm theo `docs/trien-khai-vps.md` "Kênh job", đến lúc đó route job trả 503)
  - [x] V4.1 daemon (#105)
  - [x] V4.2 bí mật theo job, compose hai service (#109)
  - [x] V4.3 route job và nhật ký (#106)
  - [x] V4.4 trạng thái/log thật (#107), nhắc khoá CI (#108), khoá CI hẹp theo App 90 ngày (#101)
  - [x] V4.5 tài liệu (PR này)
- [ ] V5 — Dung lượng, sao lưu, đăng ký app
  - [x] V5.1 suất, RAM, tự dừng (#111 lõi: suất theo môi trường, cổng RAM, `check()`; V5.1b PR này: tự dừng theo request qua op `lastAccess` của daemon, thẻ "Máy chủ" + `GET /api/hostLoad`, seed gán môi trường cho dòng cũ, `DB_PASSWORD` sinh lười, giữ 2 bản `dist`. **Cần chủ dự án**: bật nhật ký Traefik JSON và đặt `accessLog`/`hosts` trong config daemon, nếu không vẫn dừng theo "kể từ lúc bật". Chưa làm: runner bận/rảnh trên thẻ, `inspect-host`)
  - [x] V5.2 sao lưu mọi app (#102: `backup-nb3.sh`; **chưa cài lên VPS**; dump trước `remove(purgeData)` xong ở V5.2b qua op `dump` của daemon: lỗi thì từ chối xoá; app SQLite cũng bị từ chối purge. **Cần chủ dự án**: thêm `dbService`/`dumpDir` vào config daemon)
  - [x] V5.3 `!noi-app-nb3` (PR này, sau khi chủ dự án xác nhận M4.3 đã đóng 13/11): `POST /api/nb3Apps/register` (owner), form `client/pages/releases/register-app.tsx`, một mẫu workflow `nb3AppWorkflow` (đường dẫn vé đối chiếu với nguồn plugin), bỏ `/api/builds/deploy`. **Không làm**: `deploy:true` của project-setups tạo App xem thử thật (cần DNS do chủ dự án cấp); nút "Kiểm DNS" dùng route kiểm môi trường của plugin. **Chủ dự án**: DNS, `ci/setup` + secret GitHub, đẩy workflow bằng token có quyền Workflows; chưa thử trên GitHub thật)
  - [x] V5.4 `!don-app-nb3` (13/11: chủ dự án quyết **giữ compose build từ source**, nên không tạo compose `nb3-nocoedu`, không restore; playbook chỉ gom sao lưu, ghi nhận, kiểm sức khoẻ và việc của chủ dự án; xem `docs/nhan-nuoi-nocoedu.md`)
- [ ] V6 — Lark, tài liệu, phát hành
  - [x] V6.1 Lark qua tenant token (phần repo này: playbook `!nhap-lark` qua kênh job, agent chỉ dry-run; `docs/lark-cho-dsc.md`. Lệnh `import-lark` và test của nó thuộc repo NocoEdu; QPS Lark còn "chưa tra")
  - [x] V6.2 dọn tài liệu và ngôn từ (#103)
  - [x] V6.3 phát hành bằng Actions (`release.yml` khi đẩy tag `v*`, `build-release.sh` có chốt chặn, `release.sh` trên VPS; Actions chỉ dựng, không SSH. **Cần chủ dự án**: token chỉ-đọc Releases cho `release.sh`, thử một tag thật)
