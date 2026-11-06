# Kế hoạch: rà soát demo NocoBase Studio & cập nhật Dương Sinh Studio theo NocoBase 3 mới — 06/11/2026

> Trạng thái: **đã duyệt 06/11/2026** (chủ dự án chốt: nâng gói trước rồi bù tính năng; gộp phần S6 còn dở vào chuỗi
> U1→U8; kế hoạch đặt trong `docs/plans/` của repo studio). Chưa sửa mã. Prompt cho phiên triển khai:
> `docs/plans/2026-11-06-prompt-trien-khai-studio-cap-nhat.md`.
> Liên quan (repo `D:\code\nocobase`, chỉ đọc): kế hoạch tổng `docs/plans/2026-11-01-nocobase-studio-ke-hoach-phat-trien.md`
> (mục 10 Tiến độ), đặc tả demo `2026-11-01-nocobase-studio-dac-ta-demo-api.md`, phụ lục `2026-11-01-nocobase-studio-phu-luc-api-cli.md`,
> kế hoạch S6 `2026-11-03-nocobase-studio-s6-hoan-thien.md` (nay chỉ là tham chiếu), autopilot `2026-11-04-studio-autopilot.md`.

## 0. Bối cảnh

- Chủ dự án báo `nocobase` v3 ở repo gốc đã cập nhật và đã kéo về fork (`D:\code\nocobase`, `upstream/v3-develop` nay ở
  `7c25f885`, trước là `04922adec1` ngày 31/10). Yêu cầu: dùng REA (`D:\code\rea`, MCP `rea`) giải mã lại demo
  https://studio.demo.nocobase.com/ xem Studio thương mại có gì mới, rồi lập kế hoạch cập nhật Dương Sinh Studio.
- Cách rà soát (chỉ đọc, không tạo dữ liệu trên demo): REA `capture_browser_scenario` (Chrome headless, hai kịch bản) mở
  demo → demo tự đăng nhập `POST /main/api/demoMode/accounts/signInDefault` → đọc `GET /main/api/swagger`,
  `/main/api/cli/manifest`, `/main/api/projectManager`, `/main/api/access/catalog` + cây accessibility trang My issues;
  WebFetch registry npm (dist-tags, `time`), GitHub compare API `04922adec1...7c25f885`, CHANGELOG trên unpkg; đọc mã thật
  của Studio trong WSL `~/code/duongsinh-studio`.

## 1. Kết quả rà soát

### 1.1 Demo công khai **chưa đổi** so với lần giải mã 01/11

| Mốc            | 01/11/2026                   | 06/11/2026 (REA)                                     |
| -------------- | ---------------------------- | ---------------------------------------------------- |
| `app.version`  | 1.0.0-beta.71                | **1.0.0-beta.71** (OpenAPI `info.version` trùng)     |
| Bundle         | `index-CpW26rPb.js`          | `index-CpW26rPb.js` (+ chunk `index-nvyy5oSg.js`)    |
| OpenAPI        | 653 thao tác, thẻ Studio 186 | cùng tập path (551 path), nhóm Studio không thêm/bớt |
| CLI manifest   | v4, 389 lệnh, 10 withheld    | v4, cùng bộ lệnh (22 access, 24 issue, 17 studio…)   |
| Tài khoản demo | 7                            | 7 (root, alex, lisa, wendy, leo, chloe, zach)        |

Kết luận: đặc tả demo 01/11 + phụ lục **vẫn là hợp đồng đối chiếu đúng**; không cần viết lại đặc tả, 14 ảnh màn hình cũ
vẫn đúng bố cục. Demo chỉ thêm tự đăng nhập cho deep link (`b3b3252`), không liên quan Studio Dương Sinh.

### 1.2 Cái đã đổi: gói trên npm (dist-tag `beta`, 06/11/2026)

| Gói                                   | Đang lắp (WSL) | Mới nhất          | Phát hành | Ghi chú                                                                                                                                                                                                                                                                              |
| ------------------------------------- | -------------- | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@nocobase/app-template-default`      | 1.0.0-beta.86  | **1.0.0-beta.88** | 05/11     | kéo theo `app-server ^5.0.0-beta.1`, `app-client ^4.0.0-beta.8`, `caching ^1.0.0-beta.4` (major), `app-plugin-concurrency ^0.1.0-beta.2`, `app-skills 0.1.0-beta.59`, `app-cli ^1.0.0-beta.32`, mọi plugin lõi +1–2 beta                                                              |
| `@nocobase/app-server`                | ^4.0.0-beta.0  | **5.0.0-beta.1**  | 03–05/11  | **breaking**: bỏ `@nocobase/app-server/mailer`; `MailExecutions.close/drain` → `stop/wait`; sender ở `app-server/mailers`; config notification từ `app-plugin-notification-providers/config`; mặc định `mailers.default: system` + `MAILERS_SYSTEM_*`                                  |
| `@nocobase/app-plugin-agents`         | 2.0.0-beta.1   | **2.0.0-beta.5**  | 05/11     | beta.2: wait `toolQuota` kèm `until` (giờ hồi hạn mức), lý do chờ dạng mã `runWait.reasons.*`; beta.3: **admission cho run theo chính sách của app** (`9933a9a`), rút lượt đầu chưa claim; beta.4: DeepSeek Harness, kết nối nền tự khởi động lại sau cài CLI; beta.5: app yêu cầu tool session mới + tóm tắt lượt terminal gần nhất cho hand-over |
| `@nocobase/app-plugin-projects`       | 0.1.0-beta.23  | **0.1.0-beta.25** | 05/11     | beta.24: `POST comments` trả `skipped` (limited/blocked/dormant); beta.25: admission run (tạo project, đọc activity/label, upload, resources; sửa/xoá comment chỉ run đã tạo), kiểm visibility trước rehearsal plan                                                                      |
| `@nocobase/app-plugin-releases`       | 0.1.0-beta.16  | **0.1.0-beta.18** | 05/11     | hàng đợi deploy huỷ được, cách ly archive (`9417357`); giới hạn RAM host preview (`215795d`) — Studio DS dùng preview ngoài nên ít ảnh hưởng                                                                                                                                              |
| `@nocobase/app-plugin-agent-sessions` | 1.0.0-beta.15  | **1.0.0-beta.18** | 05/11     | header hội thoại dùng chung, usage trong chi tiết phiên, Enter trên điện thoại                                                                                                                                                                                                         |
| `@nocobase/app-plugin-knowledge`      | ^0.1.0-beta.16 | **0.1.0-beta.17** | 04/11     | admission run + mailer breaking (kéo theo)                                                                                                                                                                                                                                           |
| `@nocobase/agent-runner`              | 0.1.0-beta.22  | **0.1.0-beta.23** | 05/11     | DeepSeek Harness (`bfddb40`), Gitea CLI (`4d08c21`) — cần nâng runner VPS + runner máy dev                                                                                                                                                                                             |
| `@nocobase/app-plugin-users`          | ^2.0.0-beta.12 | 2.0.0-beta.15     | 02–05/11  | nhận lời mời không cần username (`5a4ebe0`) → test mời của Studio phải chạy lại                                                                                                                                                                                                       |

### 1.3 Upstream `v3-develop` 04922adec1 → 7c25f885: 59 commit (01/11–06/11), 2 bản phát hành (02/11, 04/11)

Liên quan trực tiếp tới Studio Dương Sinh: `a71b814` held-work reasons khi tạo comment · `f206179` giải thích run xếp hàng
vì quota · `a54cf2c`/`de91b90`/`c26c3c8`/`7fd2138` link + panel hội thoại dùng chung (ui-library) · `4411984` mailers cấu
hình một lần · `9933a9a` **admit run commands through application policy** · `1f0b3ba` lý do chờ của hội thoại + rút lượt
· `bfddb40` DeepSeek Harness · `c36beac` theme settings vào menu tài khoản (template) · `550dd55` slogan sidebar ·
`ca21461` điều hướng cha của trang chi tiết · `4676817` footer dialog · `3d28bff` bỏ nút refresh mặc định của trang ·
`7c25f88` pending feedback chuẩn (app-client) · `9417357`/`215795d` releases · `2bef509`/`e800687`/`4f0370e` agent-sessions
· `5934070` caching tách driver theo app (major `caching` 0.1 → 1.0) · `5a4ebe0` users (lời mời).

### 1.4 Trạng thái mã Studio Dương Sinh

- Bản gốc: WSL `~/code/duongsinh-studio`, `main` = `729a59a` (47 commit): S0–S5 xong, S6.1 xong (vi-VN + nhận diện), Autopilot
  AP1–AP6 xong (04/11), production `https://studio.dsc.edu.vn` chạy `cd6421a`.
- **Bản mirror `D:\code\duongsinh-studio` dừng ở `9a83caf` (S1, 01/11)** — lệch 38 commit; phải `git pull` trước khi dùng.
- Lớp Studio hiện có (`server/routes`): `access`, `projectManager`, `git/*` + `projects/{id}/codeLocations` + `webhooks/github`,
  `reviews`, `autopilot`, `projectMemory`, `kb` + `knowledgeDirectory`, `deploys/*` + `attention`, `previews/*`. Client:
  issues/board/issue page, my-issues, projects (detail, code, autopilot), project-memory, knowledge, releases, environments,
  chat, inbox (feed của notification + production marks), settings (users/roles/git/prefix/labels).

### 1.5 Ma trận 186 route Studio của demo ↔ Dương Sinh Studio (tóm tắt; từ U3 lấp phần "Chưa có")

| Nhóm demo (số thao tác)                                                                                                                                                  | Trạng thái DS                                                                                                                                                                                                                                                  | Bước          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `access/*` (12)                                                                                                                                                          | **Đã có** đúng hợp đồng                                                                                                                                                                                                                                        | —             |
| `projectManager` GET/PATCH (2) · `projectManager/issues/{id}/start` (1)                                                                                                  | Đã có 2 · chưa có `start`                                                                                                                                                                                                                                      | U3            |
| `git/connections*` (8), `git/pullRequests*` (10), `git/projects/{id}` (+cards) (3), `git/marks`, `git/status`, `webhooks/connections`                                    | Đã có phần lõi (token + App, PR mở/merge/refresh, cards); **khác hợp đồng**: `POST git/pullRequests` = mở PR (demo = link); thiếu `suggestion`, `checks`, `checkMerge`/`markMerged` (kiểm lại), `PATCH/DELETE pullRequests/{id}`, `reach/usage`, tạo repo trên host | U6            |
| `git/resources/*` (4), `git/authorizations/*` (6), `git/checks`, `git/commitChecks`, `webhooks/repositories/{id}`                                                        | **Chưa có** (DS dùng `git/repositories` riêng)                                                                                                                                                                                                                 | U6            |
| `projectMemory/*` (3), `kb/search`, `kb/docs/{doc}`, `kb/tree`, `knowledgeDirectory/*` (2)                                                                               | Đã có                                                                                                                                                                                                                                                          | —             |
| `kb/docs` list, `kb/docs/{doc}/file`, `kb/offers/*` (3)                                                                                                                  | Chưa có (`offers` = agent đề xuất tri thức)                                                                                                                                                                                                                    | U6            |
| `deploys/*` (23)                                                                                                                                                         | Đã có ~14 (versions, tasks, pipelines, pending, hubCounts, marks, environments, releaseLines GET/PUT, deploymentRecords, productionMarks, reopenSuggestions, unreleasedTasks); thiếu `releases*`, `versionArtifacts`, `versions/{id}/artifacts\|deployments`, `publishTarget`, `tags`, `versionEnvironments\|Pipelines\|Progress`, `apps/{id}/versionSummary` | U6 (phần hợp lý cho repo NocoBase 2); phần app-host hoãn |
| `previews/*` (7)                                                                                                                                                         | Có bộ riêng (Dokploy, S5.6) — giữ, chỉ bổ sung `preference`/`variables` nếu thiếu                                                                                                                                                                              | U6            |
| `attention` (1)                                                                                                                                                          | Có route, **chưa có badge** trên menu                                                                                                                                                                                                                          | U4            |
| `agentBoard/*` (4), `issueRuns/*` (3), `issueProgress`, `issuePanels`, `issueCommentRuns/*` (2), `failedRuns/*` (3), `issues/{id}/sendBack`, `issueOwnerHandoffs/*` (3) | **Chưa có** (Hiện tại/Kế tiếp/Cần bạn, hàng đợi agent, tab Lượt chạy, thẻ run lỗi, Gửi lại, bàn giao owner)                                                                                                                                                    | U3            |
| `inbox/*` (6), `followUps/*` (7), `taskGroups/*` (5)                                                                                                                     | Chưa có (inbox hiện là feed của plugin notification + production marks)                                                                                                                                                                                        | U4            |
| `reports/*` (6)                                                                                                                                                          | Chưa có (Dashboard)                                                                                                                                                                                                                                            | U5            |
| `organizationKeys/*` (11), `projectSetups/*` (2), `projectDefaultSkills` (2), `agentSessions/sessions/{id}/context`                                                      | Chưa có                                                                                                                                                                                                                                                        | U6            |
| `delegations/*` (3), `intakeDrafts` (1)                                                                                                                                  | Chưa có (uỷ quyền từ hội thoại; nháp intake của run)                                                                                                                                                                                                           | U6 (tuỳ chọn) |
| `repositoryDeployments/*` (12), `builds/*` (5), `releaseDownloads/{token}`                                                                                               | Chưa có — chỉ cần khi app NocoBase 3 của Dương Sinh chạy trong `app-host`                                                                                                                                                                                      | Hoãn          |
| (DS thêm ngoài demo) `reviews`, `autopilot/*`, `git/connections/appManifest/*`, `previews/{id}/open`                                                                     | Giữ, ghi rõ trong `docs/chenh-lech-upstream.md`                                                                                                                                                                                                                | —             |

## 2. Mục tiêu, phạm vi, nguyên tắc

- Mục tiêu đợt này: (a) đưa Studio lên nền gói NocoBase 3 mới nhất mà không mất tuỳ biến; (b) dùng cơ chế mới của plugin
  thay cho phần Studio tự vá; (c) lấp các route/trang còn thiếu so với demo theo thứ tự chủ dự án nhìn thấy mỗi ngày.
- Không nằm trong phạm vi: hosting app NocoBase 3 trong `app-host` (repositoryDeployments/builds), menu Testing, Zalo OA,
  tìm kiếm ngữ nghĩa KB (cần quyết định embedding), thay đổi production NocoBase 2.
- Nguyên tắc (giữ nguyên từ S5/S6/AP): không đụng `nocobase.dsc.edu.vn` và stack khác trên VPS; bí mật không in/không commit;
  máy dev 12 GB → lệnh nặng chạy foreground, test chia 3 nhóm; migration tự chứa có `down`; mọi route `describeRoute` +
  kiểm quyền, route chỉ-người từ chối run token; i18n vi-VN/en-US/zh-CN theo `docs/thuat-ngu.md`; lệch README ghi
  `docs/chenh-lech-upstream.md`; sao lưu DB trước mỗi lần đổi production; dùng lại plugin/UI Library trước khi tự viết.

## 3. Các bước

### U1 — Nâng template + gói lên bản beta 06/11 (~2–3 ngày)

Theo skill `.agents/skills/nocobase-app-upgrade/SKILL.md` (BASE `1.0.0-beta.86` → TARGET `1.0.0-beta.88`, kênh `beta`):

1. Cây sạch, nhánh `template-upgrade-1.0.0-beta.88`; `npm pack` hai bản template, đọc `AGENTS.md`/`README.MD` của TARGET và
   `@nocobase/app-skills@0.1.0-beta.59` (`skills/nocobase-app-upgrade/*`); `diff -rq` BASE/TARGET, phân loại từng file theo
   "modified/untouched/gone" đối với project; **không** chép đè, **không** `git checkout --`/`reset --hard`.
2. Phụ thuộc: theo manifest TARGET (`app-server ^5.0.0-beta.1`, `app-client ^4.0.0-beta.8`, `caching ^1.0.0-beta.4`,
   `app-plugin-concurrency ^0.1.0-beta.2`, plugin lõi mới), cộng các plugin Studio ghim: `agents 2.0.0-beta.5`,
   `projects 0.1.0-beta.25`, `releases 0.1.0-beta.18`, `agent-sessions 1.0.0-beta.18`, `knowledge 0.1.0-beta.17`,
   `agent-runner 0.1.0-beta.23`, `app-cli-client`/`app-cli` theo tag `beta`. Sau `pnpm install`: `git diff package.json`
   (luật `.agents/rules/duongsinh-studio.md`: không để registry hạ cấp lõi, client lib ở `devDependencies`);
   `pnpm nocobase skills sync`.
3. **Mailer (breaking)**: `server/config/mail.ts` (hiện `mailConfig` của plugin mail) và `server/config/notification.ts`
   (`defineMailChannelsConfig`, kênh `inbox` mặc định) đối chiếu với TARGET (`mailers.default: system`,
   `MAILERS_SYSTEM_*`, config notification từ `@nocobase/app-plugin-notification-providers/config`); quét mã Studio có
   import `app-server/mailer`/`MailExecutions` (dự kiến không có; `server/releases/service.ts`, `server/autopilot/digest.ts`
   gửi qua plugin notification). Cập nhật `config.example.yml` + `deploy/dokploy/config.yml` (giữ `i18n.defaultLocale: vi-VN`).
4. Template client (copied sources): hợp nhất `c36beac` (theme vào menu tài khoản), `550dd55` (slogan sidebar — giữ nhận
   diện Dương Sinh ở `client/layouts`, logo SVG, token `--primary`), `ca21461` (điều hướng cha), `4676817` (footer dialog),
   `3d28bff` (bỏ refresh mặc định), `7c25f88` (pending feedback) — theo các reference `list-navigation-upgrade.md`,
   `form-feedback-upgrade.md`, `edge-cases.md` của skill. Giữ `StudioChatProvider`, `ChatPanel`, trang đăng nhập navy.
5. DB: đọc `references/database-upgrades.md`; liệt kê migration mới của plugin (agents/projects/releases/users); chạy
   `pnpm nocobase db migrate` trên DB dev **mới** và trên bản sao DB production (Postgres) để thử trước.
6. Cập nhật `nocobase.defaultTemplateVersion = 1.0.0-beta.88`, `docs/chenh-lech-upstream.md` (mục mới: mailer, admission,
   gói nào lệch README), `docs/moi-truong-dev.md` nếu toolchain đổi; thêm `docs/plans/` vào `.agents/rules/duongsinh-studio.md`
   (kế hoạch đợt này nằm trong repo) và `docs/nang-cap.md` (quy trình nâng beta: đọc CHANGELOG → nhánh → test → sao lưu →
   đổi bản; thay cho mục S6.6 cũ).
7. Cổng kiểm tra: `pnpm lint`, `typecheck`, test 3 nhóm, `build`, `pnpm nocobase locales check`, test
   `tests/server/authorization-assignment-safety.test.ts`, `tests/client/locale-parity.test.ts` (override vi-VN còn khớp
   plugin mới — chỉnh `client/locales/overrides/vi-VN.ts`, `server/locales/overrides/vi-VN.ts`), e2e Playwright đăng nhập →
   tạo việc → board; dev server mở trình duyệt: Công việc của tôi, chi tiết công việc, Phát hành, Tri thức, Agent, Chat.
8. Runner: nâng `nocobase-runner` beta.23 trên VPS (user `studio-runner`, `systemctl --user restart nocobase-runner`) và
   runner máy dev (đang dừng) **sau khi** server production đã lên bản mới (protocol: kiểm `PROTOCOL_VERSION` trong
   `tests/server/run-actor.test.ts` còn đúng).
9. Production: theo `docs/trien-khai-vps.md` mục "Cập nhật" — sao lưu DB, build `--target linux-x64`, tải lên, đổi
   `STUDIO_RELEASE`, chỉ redeploy compose `studio`; kiểm healthz/đăng nhập/WebSocket 101/manifest CLI/`nocobase.dsc.edu.vn` 200.
   Merge nhánh vào `main`, push; `git pull` ở `D:\code\duongsinh-studio`.

### U2 — Dùng cơ chế mới của plugin thay phần tự vá (~1,5 ngày)

1. **Admission cho run** (`9933a9a`, agents beta.3 + projects beta.25): đọc README/skill mới của hai plugin
   (`node_modules/@nocobase/app-plugin-agents/README.md`, `skills/`, `server/tokens.d.ts`; projects `shared/access.d.ts`),
   tìm API "admit run commands through application policy" / issued-credential admission. Đối chiếu với
   `server/providers/agent-actions.ts` (`runKeyScope` + `authz.use(...)` thu hẹp quyền run, `createStudioGate`,
   `requestActorOf`). Nếu plugin đã bao phủ: chuyển sang cơ chế chính thức, bỏ `runKeyScope`, giữ test
   `tests/server/agent-gate.test.ts`, `run-actor.test.ts`, `git-open-pr.test.ts` làm hợp đồng; nếu chỉ bao một phần: giữ
   `runKeyScope` cho phần còn lại, ghi rõ vào `docs/chenh-lech-upstream.md` (mục 9 cập nhật). Route run-authenticated mới của
   projects (tạo project, activity/label, upload, resources) → mở cho agent những gì `STUDIO_ACTIONS` cho phép.
2. **Hạn mức tool** (agents beta.2): `server/autopilot/stall.ts` dùng `until`/`params.until` của wait `toolQuota` từ
   `runs.workload` thay cho backoff đoán 30 phút → 2 giờ (giữ backoff khi `until` null); chuỗi lý do chờ
   `runWait.reasons.*` dịch vi-VN qua override; hiển thị lý do chờ trên trang công việc/queue (chuẩn bị cho U3).
3. **Comment `skipped`** (projects beta.24): handler kind `agent` (`server/providers/agent-executor.ts`) trả `skipped:
   'limited'` → client hiện "bị giữ vì giới hạn 20 lượt/24 h" (nền cho `issueCommentRuns` ở U3).
4. **Hội thoại**: rút lượt đầu chưa claim + lý do chờ (beta.3) và tóm tắt lượt terminal cho hand-over (beta.5): dùng trong
   nguyên tắc trưởng nhóm agent (`server/agents/project-manager-principles.ts`) khi giao lại việc đứng (bài học DS-4);
   "tool session mới" cho lượt review read-only (phiếu `dsReviews` đòi khác workspace).
5. Agent-sessions beta.17/18: kiểm trang My agents (`/agent-sessions`) sau nâng cấp, header dùng chung + usage; sửa
   override vi-VN.
6. (Hỏi chủ dự án) DeepSeek Harness làm agent review chéo rẻ: chỉ khi có API key DeepSeek; mặc định **không** bật.
7. Kiểm chứng: test gate/run-actor/git-open-pr xanh; ca sống trên dev: run token gọi thẳng API ngoài gate → 403; lượt quota
   giả lập có `until` → autopilot lên lịch đúng giờ hồi.

### U3 — Tiến độ công việc, hàng đợi agent, quyết định khi run lỗi (~3 ngày)

Route mới (hợp đồng demo, phụ lục mục "Studio"; schema `StudioIssueProgress`, `StudioAgentBoardRow`, `StudioIssueRun` ở phụ
lục C): `GET issueProgress/{issueId}` (state `working|queued|checksPending|needsDecision|waitingForContinuation|inReview|
notStarted|finished|idle`, `agent`, `step`, `since`, `runner`, `pullRequest`, `needsYou`, `next`, `explanationCommentId`,
`handOver`, `managerWait`), `GET issueRuns`/`{runId}`/`{runId}/events` (từ `agRuns`/events của plugin agents, lọc theo
subject issue + quyền xem issue), `GET agentBoard` + `POST agentBoard/issueWork` + `GET …/wait` + `POST …/start`,
`GET/POST issueCommentRuns/{issueId}[/continue]`, `POST failedRuns/{runId}/decide|dispatch`, `POST failedRuns/confirmHandoff`,
`POST issues/{issueId}/sendBack`, `GET/POST issueOwnerHandoffs/{issueId}[/accept|reject]`, `POST projectManager/issues/{id}/start`,
`GET issuePanels/{issueId}` (snapshot panel được phép: PR, preview, release, review, autopilot).

- Server: `server/progress/service.ts` (tính progress từ run + comment hand-over + PR + review + autopilot flag, cache
  ngắn), `server/routes/issue-work.ts`; bảng mới chỉ khi cần (`dsOwnerHandoffs`, `dsFailedRunDecisions`); migration tự chứa.
- Client: trang công việc thêm khối **Hiện tại / Kế tiếp / Cần bạn** + nút Merge/Gửi lại/Xem thay đổi (phần Merge đã có), tab
  **Lượt chạy** (transcript), thẻ "Lượt chạy lỗi — giao lại/thử lại/dừng", "Tiếp tục" khi quá 20 lượt; trang `/issues` thêm
  chế độ **Hàng đợi agent** (list/board/agent queue như demo); My issues hiện nhãn phụ ("Cần bạn nghiệm thu", "Agent đang
  làm"). Thuật ngữ theo `docs/thuat-ngu.md`.
- CLI: lệnh `issue progress`, `issue runs`, `board get|start|wait`, `issue failed-run:*` (chỉ run), `issue handoff:*`.
- Kiểm chứng: test quyền (contributor chỉ thấy issue related), e2e: run lỗi giả lập → thẻ quyết định → giao lại; progress
  đúng cho PM-8/DS-2 lịch sử trên dev.

### U4 — Inbox hợp nhất, badge, Follow-ups, nhóm việc (S6.2 cũ, ~2,5 ngày)

- `inbox/items|notices|pending|unreadCount|waiting|reconcile` hợp nhất: nghiệm thu (`accept`), đề nghị production mark
  (đã có feed), plan chờ duyệt, run lỗi cần quyết định (U3), mention, PR merged/closed, tự lái đã merge/đứng việc, digest
  21:00 — hai nhóm **Cần tôi quyết định** / **Thông báo**; `attention` (đã có) → badge trên My issues, Inbox, Phát hành;
  đánh dấu đã xem đồng bộ. Trang `/inbox` viết lại theo bố cục demo (tab To decide · Notifications · All, chi tiết bên phải).
- `followUps` (7 route) + trang `/follow-ups`; `taskGroups` (5 route) cho bảng nhóm "Chờ bạn / Đang làm / Backlog / Xong"
  với summary `{mine:{open,waiting}, waiting}` dùng ở My issues.
- Web push giữ cho U7; ở U4 chỉ in-app.
- Kiểm chứng: test từng nguồn vào đúng nhóm; badge giảm khi xem; contributor không thấy quyết định của owner.

### U5 — Dashboard (S6.3 cũ, ~2,5 ngày)

- 6 route `reports/delivery|agents|metrics|attention|projects|usage` đúng hình dữ liệu demo (bucket 3 ngày, so kỳ trước,
  `groupBy agent/trigger/subject/model/tool/day`), quyền `studio.reports/read` (owner/admin toàn bộ; contributor project
  mình). Dữ liệu từ `pmIssues`/activities, `agRuns`/usage, `dsReviews`, `dsAutopilotEvents`, `dsPullRequests`.
- Trang `/dashboard` (menu đầu, như demo): 4 thẻ KPI có sparkline (việc hoàn thành, chu kỳ trung vị, tỷ lệ agent làm,
  **token/việc** thay USD vì gói thuê bao), khối hiệu quả agent, biểu đồ lượt chạy theo kết quả (skill `dataviz`,
  `echarts` đã có), mục Cần chú ý (từ `reports/attention`). Bộ chọn 7/30/90 ngày.
- Kiểm chứng: fixture cố định cho từng route; so tay với DS-1/DS-2/Sandbox; báo cáo tuần sáng thứ Hai gửi inbox (email ở U7).

### U6 — Thiết lập dự án, khoá tổ chức, git cá nhân, tri thức do agent đề xuất, nợ S6.7 (~3 ngày)

1. `projectSetups` (tạo project kèm repo + issue "Khởi tạo dự án" giao trưởng nhóm agent), `projectDefaultSkills` GET/PUT
   (+ 4 skill `ds-workflow/development/approach/review` đính mặc định, `ds-comment-style` global — nếu chưa có thì viết
   theo cấu trúc mục 4 đặc tả demo), `projectManager/issues/{id}/start`.
2. `organizationKeys/*` (11): khoá API tổ chức có scope, rotate, events — nền cho CI/`git/checks`; trang Settings → API keys
   tổ chức.
3. Git theo hợp đồng demo: `git/resources/{id}` (alias/đổi tên từ `git/repositories`: branchRules, wakeOn*, checksSource,
   webhookMode, pollSeconds), `reportedChecks`, `repairWebhook`, `git/checks` + `git/commitChecks` (agent/CI tự báo check
   cho repo NocoBase 2 qua `ds-studio check report`), `git/authorizations/*` (token cá nhân `useToken`; OAuth/device flow
   hoãn), `pullRequests/{id}` PATCH/DELETE + `suggestion` + `checks` + `checkMerge`/`markMerged` nếu thiếu, `git/connections/{id}/reach|usage`,
   `webhooks/{provider}/repositories/{id}`; **giữ** `POST git/pullRequests` = mở PR (ghi lệch) và thêm `pr link` riêng.
4. `kb/offers` (3) + lệnh `kb offer` cho run → người duyệt trong Inbox; `kb/docs` list + `file`.
5. Trang project: tab Tri thức · Ghi nhớ · Phát hành (như demo); UI sửa App id/release line; project memory đọc nhánh của
   issue; chuyển repo PAT → App rồi gỡ PAT (dev); `DelegatedWrites` cho agent hội thoại + link kind "Linked work";
   `deploys/versions/{id}/artifacts|deployments`, `versionArtifacts`, `releaseLines/{id}/tags|publishTarget`
   (phần áp dụng được cho repo NocoBase 2; `releases*`/`apps/{id}/versionSummary` hoãn cùng app-host).
6. `delegations`, `intakeDrafts`, `agentSessions/sessions/{id}/context`: làm nếu còn thời gian (tuỳ chọn).
7. Kiểm chứng: tạo project mới qua `projectSetups` trên dev → issue khởi tạo được giao; CI của sandbox báo check qua
   `ds-studio check report` bằng org key; `kb offer` → duyệt → tài liệu xuất hiện.

### U7 — Thông báo ra ngoài + ngân sách (S6.4, S6.5 cũ, ~1,5 ngày; cần Q2/Q3/Q4 của S6)

- Email qua mailer `system` mới (U1) + kênh mail của notification; mẫu tiếng Việt; người dùng chọn loại nhận qua email;
  web push (`notification-web-push`, VAPID); báo cáo tuần + digest 21:00 gửi email chủ dự án. Gửi thử **chỉ** tới chủ dự án
  sau khi hỏi.
- `dsBudgets`/`dsBudgetEvents` (scope project/agent/global, kỳ ngày/tháng, giới hạn lượt + token); chặn `runs.enqueue`
  khi ≥ 100 % (thẻ "Mở chặn" trong Inbox), cảnh báo 80 %; Settings → Ngân sách; mức dùng trên Dashboard; phối hợp với
  giới hạn song song của autopilot.

### U8 — Vận hành (S6.6 cũ, ~1,5 ngày; cần Q5/Q6 của S6)

- Cron sao lưu + đẩy Google Drive bằng `rclone` (chủ dự án uỷ quyền), giữ 30 ngày, thử khôi phục; giám sát healthz +
  runner online (job nội bộ → inbox/email) + UptimeRobot; dọn `incoming/*.tar.gz`, giữ 3 bản phát hành, `agents.runs.retentionDays`;
  xoay khoá Dokploy; đồng bộ mirror `D:\code\duongsinh-studio`; cập nhật `docs/trien-khai-vps.md`, mục Tiến độ của kế
  hoạch tổng.

Thứ tự: U1 → U2 → U3 → U4 → U5 → U6 → U7 → U8; tổng ≈ 17–19 ngày làm việc. Mỗi bước: TDD → lint/typecheck/test/build xanh
→ commit theo bước → push → cập nhật mục 7 (Tiến độ) của file này → báo cáo ngắn. Production cập nhật ở cuối U1 (bắt buộc,
để runner/giao thức khớp) và sau mỗi bước U3–U8 khi chủ dự án đồng ý.

## 4. Kiểm chứng đầu-cuối

1. Sau U1: production chạy bản mới; ca thật trên Sandbox: issue → lead agent → PR → review chéo (Codex) → CI → merge trong
   Studio → done; autopilot tự merge 1 PR; migration/seed không lỗi trên Postgres.
2. Sau U3–U4: chủ dự án theo dõi một issue thật chỉ qua My issues + Inbox (Hiện tại/Kế tiếp/Cần bạn, badge, follow-up),
   quyết định run lỗi từ thẻ, Gửi lại một issue.
3. Sau U5: Dashboard phản ánh đúng DS-1..DS-17 và Sandbox; contributor không thấy số liệu toàn công ty.
4. Sau U6: tạo project mới một bước; CI báo check bằng org key; agent đề xuất tri thức và người duyệt.
5. Tự động: lint/typecheck/test/build xanh ở mọi commit; test quyền cho từng route mới (ẩn danh 401, contributor, run
   token, API key scope); `tests/server/authorization-assignment-safety.test.ts` giữ nguyên baseline.
6. Đối chiếu hợp đồng: script `scripts/compare-studio-api.mjs` (mới, dev-only) so `GET /api/swagger` của Studio với phụ lục
   demo, in danh sách route Studio còn thiếu — chạy cuối mỗi bước, số thiếu giảm dần.

## 5. Rủi ro

| Rủi ro                                                               | Giảm thiểu                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Nâng gói phá tuỳ biến (mailer, layout, overrides vi-VN, runKeyScope) | Làm trên nhánh, diff BASE/TARGET từng file, test locale-parity/gate, thử migrate trên bản sao DB production |
| API "admission" của plugin không phủ hết gate Studio                 | Giữ `runKeyScope` song song, test hợp đồng cũ là tiêu chí; ghi lệch                                         |
| Protocol runner đổi → runner VPS/dev không claim được                | Nâng server trước, runner ngay sau; kiểm `PROTOCOL_VERSION`; giữ bản runner cũ để quay lui                  |
| Khối lượng lớn (≈18 ngày), máy dev 12 GB                             | Mỗi bước tự đứng; dừng được sau U1/U2 hoặc U4 vẫn có giá trị; test chia nhóm                                |
| Số liệu Dashboard/progress sai vì suy diễn từ comment                | Dựa trên bảng có cấu trúc (`agRuns`, `dsReviews`, `dsPullRequests`, autopilot events) trước, comment sau    |
| Email/push/ngân sách chặn nhầm                                       | Cổng hỏi trước lần gửi thật; mở chặn một nút; cảnh báo 80 %                                                 |

## 6. Quyết định cần chủ dự án chốt (hỏi đầu phiên triển khai)

| #   | Câu hỏi                                                                       | Khuyến nghị                                                        |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Q1  | Đưa production lên bản nâng cấp ngay cuối U1 hay chờ U2?                      | Cuối U1 (sau ca thật Sandbox), để runner/giao thức khớp sớm        |
| Q2  | Thay `runKeyScope` bằng admission chính thức nếu plugin phủ đủ?               | Thay, giữ test hợp đồng; nếu phủ một phần thì giữ song song        |
| Q3  | Bật DeepSeek Harness làm agent review rẻ?                                     | Chưa (cần API key, chi phí); ghi chỗ bật                           |
| Q4  | Email SMTP, web push, ngân sách, sao lưu Drive, giám sát (Q2–Q6 của S6)       | Như khuyến nghị S6; hỏi lại trước U7/U8                            |
| Q5  | Hoãn `repositoryDeployments/builds` (app-host) tới khi Dương Sinh App v3 cần? | Hoãn                                                               |

**Đã chốt 06/11/2026:** Q1 cuối U1 (vẫn hỏi lại ngay trước mỗi lần cập nhật) · Q2 thay nếu phủ đủ, phủ một phần thì giữ song song · Q3 chưa bật · Q4 theo S6, hỏi lại trước
U7/U8 · **Q5 chủ dự án chọn làm trong U6, khác khuyến nghị:** đưa 12 + 5 route `repositoryDeployments/*`, `builds/*` (và `releaseDownloads/{token}`) vào U6, thay các chữ "Hoãn"/"ngoài
phạm vi" ở mục 1.5, 2 và 3-U6.

## 7. Tiến độ

- [x] U1 — Nâng template + gói (06/11/2026)
  - Commit: `82b4f3b` (sửa middleware), `d3f44b1` (nâng template), `010f990` (docs), merge `1246de1`.
  - Cổng kiểm tra: lint, typecheck, `locales check` xanh; test 131/131 file, 656 test (server 120, client a–k 167, client l–z + project 369); build xanh; e2e `issue-flow` và 8 test
    alignment xanh trên dev; 16 trang duyệt bằng trình duyệt không có API lỗi.
  - Production: `1246de1` từ `cd6421a` (sao lưu `studio-before-1246de1-20261106-1332.dump`); runner `vps-studio-runner` beta.23; `nocobase.dsc.edu.vn` 200.
  - Ca thật Sandbox DS-20: trưởng nhóm → dev → PR #4 → CI → review `approve` → `in_review` → autopilot merge → `done`. Xoá `needsYou` bằng tay để autopilot merge được (xem việc mở).
  - Việc còn mở: (1) nguyên tắc trưởng nhóm luôn ghi `needsYou` nên autopilot không tự merge được trong luồng thật, chờ chủ dự án quyết định; (2) review chéo chạy bằng Claude Opus, không phải Codex như
    kiểm chứng đầu-cuối mục 4 nêu; (3) chưa chạy ca thật trên Dương Sinh App; (4) `package.json` `version` vẫn `1.0.0-beta.86`, nên CLI `ds-studio` không có phiên bản mới để runner tải (nâng ở lần phát hành sau);
    (5) trạng thái merge PR #4 lấy từ Studio, chưa đối chiếu trực tiếp trên GitHub.
- [x] U2 — Cơ chế mới của plugin (06/11/2026, chưa lên production)
  - Giữ `runKeyScope` vì admission chỉ quyết định vào route (`docs/chenh-lech-upstream.md` mục 24). Nối thật autopilot với agent runs và Hộp thư, hạn mức theo `until`, trưởng nhóm để trống `needsYou` khi tự lái bật, lượt read-only dùng phiên mới, hiện lý do `work_skipped`.
  - Cổng kiểm tra: lint, typecheck, `locales check` xanh; test 133/133 file, 659 test; build xanh; thử sống trên dev (đăng nhập, chi tiết công việc, Chat).
  - `scripts/compare-studio-api.mjs`: 36/186 route Studio của demo đã có, còn thiếu 150.
  - Việc còn mở: chưa kiểm chứng trưởng nhóm thật sự bỏ `needsYou` trong một lượt agent thật (cần production hoặc runner dev); menu tài khoản chỉ có test client, chưa xem ảnh.
- [ ] U3 — Tiến độ công việc, hàng đợi agent, run lỗi
- [ ] U4 — Inbox hợp nhất, badge, Follow-ups, nhóm việc
- [ ] U5 — Dashboard
- [ ] U6 — Thiết lập dự án, khoá tổ chức, git, tri thức, nợ S6.7
- [ ] U7 — Thông báo ra ngoài + ngân sách
- [ ] U8 — Vận hành

(Ghi ngày, commit, số liệu cổng kiểm tra, bản production, việc còn mở dưới từng dòng khi xong.)
