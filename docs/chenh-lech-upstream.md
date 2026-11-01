# Chênh lệch giữa gói đã publish và tài liệu/kế hoạch

Ghi lại mỗi lần gói `@nocobase/*@beta` lệch với README đã đọc hoặc với kế hoạch
(`D:\code\nocobase\docs\plans\2026-11-01-nocobase-studio-ke-hoach-phat-trien.md`).
Mốc đối chiếu nguồn: `upstream/v3-develop` commit `04922adec1` (2026-10-31).

## Phiên bản đã lắp (S0, 01/11/2026)

| Gói                                   | Phiên bản     | Trạng thái trong app                                                  |
| ------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `@nocobase/create-app`                | 0.1.0-beta.34 | tạo app từ `app-template-default` 1.0.0-beta.86                       |
| `@nocobase/app-plugin-agents`         | 2.0.0-beta.1  | đăng ký server + client + cli                                         |
| `@nocobase/app-plugin-agent-sessions` | 1.0.0-beta.15 | đăng ký server + client                                               |
| `@nocobase/app-plugin-knowledge`      | 0.1.0-beta.16 | đăng ký server + client (template đã có `server/config/knowledge.ts`) |
| `@nocobase/app-plugin-releases`       | 0.1.0-beta.16 | đăng ký server + client; section cấu hình do app tự khai báo          |
| `@nocobase/app-plugin-projects`       | 0.1.0-beta.23 | **cài, chưa bật** (`plugin register --disabled`), xem mục 1           |

`@nocobase/app-cli-client` 0.1.0-beta.17 đã cài (devDependencies), làm CLI riêng `ds-studio` (xem mục 4).
Gói lib `app-host` 0.1.0-beta.18, `acp-bridge` 1.0.0-beta.4, `agent-protocol` 0.1.0-beta.16, `agent-runner`
0.1.0-beta.22 đều đã có trên npm. Chưa cài; sẽ lắp ở giai đoạn dùng đến (S2 runner, S4 ACP bridge, S5 host).

## 1. Projects bắt buộc app bind `projectsAccessToken`

Bật plugin mà không bind thì server dừng khi boot: `Service "@nocobase/app-plugin-projects/access" is not registered`.
Skill của plugin xác nhận plugin không giữ vai trò riêng; app phải cung cấp `ProjectsAccess` (`permissionsOf`, `admit`,
`changed`, `administrators`, tuỳ chọn `permissionsOfUser`). Trên `v3-develop`, chỉ test helper của plugin có bản bind
mẫu; phần này thuộc lớp đóng của Studio thương mại.

Quyết định: không viết bản tạm cấp mọi quyền (vi phạm luật "Visible and manageable role assignments" trong `AGENTS.md`).
Projects bật ở **đầu S1**, cùng `server/providers/projects-access.ts` ánh xạ Permission Sets (seed `pm-*`) sang
`Permissions` và 3 vai trò owner/admin/contributor.

**Cập nhật S1 (01/11/2026):** đã bật projects. `server/providers/projects-access.ts` đọc quyền qua `authorizationToken`
(`can` theo từng mức `all` → `related`), `related` = `{ users: [người gọi] }`; `administrators` = người được gán set
`root` hoặc `ds-admin`; `admit` không gán gì. Test bảo vệ: `tests/server/projects-access.test.ts`.

## 2. Releases không xuất factory cấu hình

README yêu cầu section `releases` (`artifact`, `dataDir`), nhưng gói không có `defineReleasesConfig` như knowledge, nên
`pnpm nocobase config set releases.*` báo `UNKNOWN_KEY`. Cách làm: app tự khai báo `server/config/releases.ts` bằng
`defineAppConfig` (kiểu `ReleasesPluginConfig` từ `@nocobase/app-plugin-releases/server`) và thêm vào
`server/config/index.ts`. Archive nằm trên disk `local` (private), prefix `release-artifacts`; `dataDir` là
`storage/releases`. Host in-process/Docker để tắt tới S5. `releasesAccessToken` chưa bind nên "mọi người không có quyền
gì": an toàn cho tới S5.

## 3. Cảnh báo không chặn

- Agents 2.0.0-beta.1 khai báo `queue.jobs` đã bị bỏ qua ("Job modules are no longer discovered"). Lỗi phía thượng nguồn,
  chỉ là cảnh báo. Theo dõi khi nâng phiên bản.
- `better-auth` chưa có `baseURL`: đặt `app.publicOrigin` khi triển khai thật.
- Jobs chạy cấu hình memory: cần `jobs.default` redis khi chạy nhiều tiến trình (production).

## 5. Seed không import được module tương đối của app

Skill authorization (`references/code-and-seeds.md`) hướng dẫn đặt dữ liệu permission set ở `database/seed-data/*.ts` rồi
import vào seed. Thực tế với `@nocobase/db` hiện tại, trình nạp seed (khi chạy test trên DB mới) báo
`ERR_MODULE_NOT_FOUND` cho mọi import tương đối, dù trỏ vào `server/` hay `database/seed-data/`. Khi chạy `pnpm dev` thì
lại được, nên phải có test mới lộ ra. Cách làm: seed tự chứa như migration, chỉ import từ package
(`@nocobase/app-plugin-projects/shared/access`); key vai trò lặp lại ở `server/access/roles.ts`.

## 7. `shadcn add` hạ cấp gói lõi và đặt sai nhóm phụ thuộc

Cài các mục `@nocobase/issue-table|issue-card|issue-detail|project-detail|kanban|comment-thread` bằng
`pnpm exec shadcn add` đã ghi đè `@nocobase/app-client` từ `^4.0.0-beta.6` về `4.0.0-beta.5` và `@nocobase/i18n` từ
`^2.0.0-beta.1` về `1.0.0-beta.7` (theo phụ thuộc mà mục registry khai báo). Hậu quả:
`TypeError: watchReadiness is not a function` trong `@nocobase/app-plugin-authorization/client`, làm
`tests/client/client-runtime.test.ts` fail. Lỗi này dễ bị nhầm là "lỗi có sẵn". Ngoài ra, các thư viện chỉ dùng ở
client (dnd-kit, tiptap, date-fns, react-day-picker, react-virtuoso) bị thêm vào `dependencies`, trái luật
`AGENTS.md`. Sau mỗi lần `shadcn add`, phải `git diff package.json` và khôi phục dải phiên bản lõi
(`~/code/fix-deps.mjs` là script đã dùng).

## 6. Ngữ nghĩa "related" của issue

Với mức `related`, plugin coi **mọi issue không thuộc project** là liên quan tới mọi người có quyền đó (bảng trong
`shared/access.d.ts`). Muốn giữ riêng thì đặt issue vào project `visibility: 'members'`. Đây là thiết kế của plugin,
không phải lỗi; đã kiểm bằng test.

## 8. S2 — subject `issue`, kind `agent`, project manager (01/11/2026)

Lắp ở `server/providers/{project-manager,agent-executor,issue-subject}.ts`, văn bản nguyên tắc ở `server/agents/`. Test:
`tests/server/studio-agents.test.ts`.

- **`mayMove` không kiểm được `needsYou`.** Kế hoạch muốn `mayMove` đòi `needsYou` khi agent đưa issue vào
  `blocked`/`in_review`. Trong `@nocobase/app-plugin-projects` 0.1.0-beta.23, `dist/server/domains/issues/issue.service.js`
  gọi `moveIssue(…, { issue: before, … })`, nên `mayMove` nhận issue **trước** khi PATCH áp dụng: `needsYou` gửi kèm
  cùng PATCH không thấy được, còn `needsYou` cũ luôn rỗng khi rời `in_progress` (`issue.fields.js` xoá nó ngoài
  `blocked`/`in_review`). Quyết định: `mayMove` chỉ cho agent di chuyển issue mà chính nó là executor; yêu cầu `needsYou`
  nằm trong nguyên tắc của project manager. Hiện agent cũng chưa tự đổi trạng thái được vì app chưa bind
  `projectsRequestActorToken` (run token vẫn hành động như người).
- **Hai plugin có hai kiểu `Tx` khác nhau, README không có cầu nối.** Agents: `{ conn, emit(AgentsEvent) }`; projects:
  `{ conn, emit(DomainEvent), rehearsal? }`. README agents chỉ nói "publish the collected events after it commits".
  Cách làm: dựng `Tx` của plugin kia trên **cùng connection** và phát sự kiện bằng `conn.afterCommit(...)` của
  `@nocobase/db` (handler của kind `agent` gọi `runs.enqueue`/`withdrawQueued`; sink gọi `comments.post` trong một
  savepoint). Giới hạn: hook `beforeCommit` của projects (lập thông báo) không chạy cho comment do sink viết, nên comment
  `ds.run.finished` không sinh notice "commented" cho người theo dõi.
- **Nội suy i18n phía server là `{{name}}`.** `@nocobase/i18n` 2.0.0-beta.1 chỉ đặt `interpolation.escapeValue: false`,
  giữ cú pháp mặc định của i18next; khoá `studioAgents.runFinished.*` trong `server/locales/` dùng `{{runId}}`. Một chuỗi
  viết `{runId}` được dịch nhưng không thay tham số (test đã bắt được).
- **Agent của app không có tool/model thì không nhận việc.** `ensureSystem` với `modelEntries: []` tạo agent `enabled`
  nhưng `findWorkable` trả null và `runs.enqueue` sẽ từ chối. Handler kiểm `findWorkable` trước và trả
  `skipped: 'unavailable'`, nên issue mặc định giao project manager vẫn tạo/chuyển trạng thái được; project manager chỉ
  chạy thật khi có route `projectManager` đặt "first choice" (mỗi lần boot giữ nguyên `modelEntries` đã có).

## 9. S2 — gate, business actions của agent, cấu hình project manager (01/11/2026)

Lắp ở `server/agents/actions.ts`, `server/providers/agent-actions.ts`, `server/routes/project-manager.ts`, bảng
`dsProjectManager` (migration `202611020003_ds_project_manager`). Test: `tests/server/agent-gate.test.ts`,
`tests/database/ds-project-manager-migration.test.ts`.

- **Gate chỉ lọc manifest, không chặn request của run.** `@nocobase/app-plugin-agents` 2.0.0-beta.1 dùng
  `gate.allowed` ở `dist/server/cli/surface.js` (manifest CLI) và không nơi nào khác; run token
  (`dist/server/cli/run-credential.js`) là "scoped session for the person who woke the agent" không kèm `keyScope`, và
  `@nocobase/app-plugin-projects` (`dist/server/access/request.js`) tính quyền bằng `permissionsOf(authz.identity)`. Tức
  là một run gọi thẳng API (không qua manifest) có toàn quyền của người. README chỉ ghi "the application bounds a run's
  requests by the same answer". Cách làm: một bước `authorization.use(...)` gắn `keyScope` cho request mang run token,
  chỉ cho các hành động gate cho phép (`runKeyScope`); `AuthorizationContext.can` đã tôn trọng `keyScope`, nên quyền
  projects của run co lại theo.
- **Knowledge không có `kb.knowledge/offer`.** Gói 0.1.0-beta.16 có `read`, `propose`, `edit`, `manage`; Studio đưa
  `read` và `propose` (tương đương "offer" trong kế hoạch).
- **Releases:** `releasesAccessToken` chưa bind (mục 2), nên `rel.apps/*` được liệt kê cho agent nhưng plugin releases
  vẫn từ chối mọi người cho tới S5.
- **Id lệnh CLI trong manifest dùng dấu hai chấm** (`issue:comment:add`), còn `describeRoute` khai báo `issue comment add`.
- **`fallbackAfterSeconds`, `delegationQueueTimeoutSeconds` mới chỉ được lưu.** Project manager chạy bằng danh sách
  model của agent "first choice" rồi "fallback" (`ensureSystem`, theo thứ tự); việc chờ bao lâu mới chuyển sang fallback
  do plugin agents quyết định (`ModelSelectionWait.fallbackAfterSeconds`), app chưa nối hai số này vào đó.
  `commentRunLimit` thì được handler của kind `agent` dùng.
- `Authorization.use` không có hàm gỡ: bước gắn scope cho run sống tới khi tiến trình dừng.

## 10. S2 — agent hành động như chính nó (01/11/2026)

`projectsRequestActorToken` được bind trong `server/providers/agent-actions.ts` (`requestActorOf`): request mang run
token hành động như principal `{ type: 'agent', id: <agent của run>, trace: { agentId, runId } }`; quyền xem/sửa vẫn là
quyền của người mà run đại diện, đã bị gate thu hẹp (mục 9). Test: `tests/server/run-actor.test.ts`, lấy run token thật
qua `agents.runners.createRegistrationToken` → `register` → `authenticate` → `agents.claims.claim`.

- **Giá trị trust của registration token là `team` | `ownerOnly`** (`RUNNER_TRUST` trong `shared/runners.d.ts`), dù chú
  thích của `RegistrationTokenInput` và README nói "personal runner". Gửi `personal` bị `RepositoryError: Field "trust"
requires an allowed enum member.`
- **Agent đóng issue bị từ chối trước cả kiểm tra `moves`:** `in_progress → done` qua run token trả 403 "Only the owner,
  the project lead or an administrator may close an issue." (`issue.access.js` `requireCloser` xét actor, mà actor giờ là
  agent). Một bước ngoài `moves` không cần quyền khác (`in_progress → backlog`) trả 400 `TRANSITION_NOT_ALLOWED`;
  `in_progress → in_review` kèm `needsYou` được phép.
- Chưa có helper công khai nào để đúc run token trong test; phải đi đường đăng ký runner như trên. `PROTOCOL_VERSION` (14)
  của `@nocobase/agent-protocol` được lặp lại trong test vì gói đó không phải phụ thuộc trực tiếp của app.

## 11. S3 phần 1 — Git, PR, checks, merge (03/11/2026)

Lắp ở `server/git/{github,pull-state,rows,service}.ts`, `server/providers/git.ts`, `server/routes/git.ts`, bảng
`dsGitConnections`/`dsRepositories`/`dsProjectRepositories`/`dsPullRequests` (migration `202611030001_ds_git`). Test:
`tests/server/git.test.ts` (GitHub giả bằng `vi.stubGlobal('fetch')`), `tests/server/git-pull-state.test.ts`,
`tests/database/ds-git-migration.test.ts`.

- **`auth.required()` từ chối run token dù route khai `runToken` trong `security`.** Lỗi 403
  `SCOPED_KEY_FORBIDDEN` ("This endpoint does not accept scoped API keys…"). Route phải opt-in
  `auth.required({ scopedKeys: true })` **và** liệt kê `runToken` trong `security`; README agents chỉ nói vế sau.
  Route git cho run đọc (`GET git/repositories`, `git/pullRequests*`) dùng cách này; merge/refresh vẫn chỉ người.
- **`repoAccess` với PAT: không thu hồi được theo run.** Hợp đồng muốn `discard` khi `prepare` đúc credential. Studio
  không dùng `prepare`: `forRun` đọc DB và mở token đã seal (đồng bộ, không gọi mạng), trả `credentials` (hoặc
  `onDemand` + `issue()` cho runner có `gitCredentials`), username `x-access-token`, `expiresAt` danh nghĩa +1 giờ. Token
  fine-grained sống tới khi người quản trị đổi; phạm vi giới hạn ở các repo token đó với tới. GitHub App (token
  installation 1 giờ) ở S5 mới cho credential ngắn hạn thật.
- **`RunGit` không có trường branch.** Nhánh `agent/<IDENTIFIER>` đến từ `SubjectDir.branch` do subject `issue` dựng
  (`server/providers/issue-subject.ts`, vẫn cứng `agent/`); `branchPrefix` của repo chỉ dùng để liên kết PR ↔ issue.
- **Resource của project có `binding`.** `projects.projects.addResource` nhận
  `binding: { provider, connectionId, repoId, fullName }`; `codeLocations` tạo resource `gitRepo` (URL clone) kèm
  binding rồi ghi `dsProjectRepositories`. Repo đầu tiên của project là primary.
- **Status event phải có `to`.** `ds.pr.merged` (`in_progress|in_review|blocked → done`) đã đăng ký; `ds.pr.closed`
  không di chuyển issue nên không thể là status event: chỉ là comment (message `ds.pr.closed`).
- **`UpdateQuery.execute()` trả `updatedCount`** (không phải `numUpdatedRows` của Kysely). Cập nhật sang `merged` được
  chặn `state != 'merged'` để `ds.pr.merged` chỉ bắn một lần dù merge trong Studio hay poll thấy trên GitHub.
- **Lệch với phụ lục demo:** `ciState` trả theo phụ lục (`success|failure|pending|null`), bảng lưu
  `passed|failed|pending|missing`. Route `git/repositories` (GET/POST) là của Studio Dương Sinh; demo dùng
  `git/resources/{id}` + `git/connections/{id}/repositories`. Comment trên issue viết tiếng Việt (app chưa có locale
  server `vi-VN`), kèm `message` `ds.pr.merged`/`ds.pr.closed` để trang hiển thị theo ngôn ngữ người đọc
  (`studioGit.comments.*` trong `server/locales/`).
- Poll: `ScheduleExecutor` scope `duongsinh-studio`, job `git-poll` mỗi 30 s, mỗi repo theo `pollSeconds`; bỏ qua khi
  chạy lệnh CLI và khi app chưa có bảng `dsRepositories`. Jobs đang ở memory (mục 3): nhiều tiến trình sẽ poll trùng.

## 12. Visibility của project: `everyone`, không phải `workspace` (02/11/2026)

README của `@nocobase/app-plugin-projects` 0.1.0-beta.23 ghi project có visibility `workspace` hoặc `members`. API thật
từ chối `workspace`: `400 INVALID_INPUT … expected one of "everyone"|"members"`. Dùng `everyone` cho project ai trong
workspace cũng thấy. Phát hiện khi tạo project Sandbox cho ca thật S3.

## 13. S3 — agent mở PR qua Studio (02/11/2026)

Ca thật PM-9: agent push được `agent/PM-9` nhưng không mở được PR (runner không có `gh`, CLI chưa có lệnh). Thêm
`POST /api/git/pullRequests` (`studioGitOpenPullRequest`), lệnh CLI `ds-studio pr open <issue> --title … --body-file
pr.md`, `GET` thành lệnh `pr list --issue <issue>` (nhận cả identifier `PM-9`); `pr get|refresh|merge` cũng có tên.
Test: `tests/server/git-open-pr.test.ts`.

- **Lệch phụ lục demo:** demo có `POST /git/pullRequests` = `pr:link` (liên kết PR có sẵn); ở đây nó **mở** PR trên
  GitHub (`pr:open`) và liên kết ngay (`linkedBy: 'opened'`). Gọi lại khi đã có PR mở từ head đó → trả PR cũ (200).
- **Action `studio.git/open-pr` là của Studio, plugin authorization không cấp nó.** Trong `STUDIO_ACTIONS` nó "mượn"
  resource/levels của `pm.issues/edit` (`borrowed: true`): người giữ edit thì giữ open-pr; `runKeyScope` bỏ qua action
  mượn nên run cần cả `pm.issues/edit` lẫn `studio.git/open-pr`. App kiểm `cliRoute({ action })` cho run trước khi route
  chạy; route tự kiểm lại qua `agents.gate.allowed` cho cả người lẫn run, và đòi scope `pm.issues/edit` khác `none`.
- Agent có sẵn nhận action mặc định mới qua `applyDefaults()` lúc boot (`project-manager.ts`): server đang chạy phải
  khởi động lại thì agent hiện có mới có `studio.git/open-pr` và chỉ dẫn mới.

## 4. Agent Sessions client bắt buộc tên CLI của app

`plugin register` ghi `agentSessions()` không tham số. Server vẫn boot và `curl` trang chủ vẫn trả 200, nhưng client ném
lỗi ngay khi nạp plugin: `agentSessionsRoute() needs the application’s command line, such as { cli: "acme" }`. Chỉ
4 file test client (`client-plugin-registry`, `client-runtime`, `foundation-integration`, `tailwind-sources`) bắt được.
Bài học: kiểm chứng giao diện phải chạy test client hoặc mở trình duyệt, không chỉ `curl`.

Cách làm: khai báo `nocobase.cli` trong `package.json` (`bin: ds-studio`, `displayName: Dương Sinh Studio`,
`envPrefix: DS_STUDIO`, nên CI dùng được `DS_STUDIO_API_KEY`), cài `@nocobase/app-cli-client`, chạy
`pnpm nocobase cli link`, và truyền `agentSessions({ cli: 'ds-studio' })`. Đăng nhập thiết bị (`auth.clientId`) và
`skills` giao kèm runner để đến S2.
