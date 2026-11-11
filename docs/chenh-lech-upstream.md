# Chênh lệch giữa gói đã publish và tài liệu/kế hoạch

Ghi lại mỗi lần gói `@nocobase/*@beta` lệch với README đã đọc hoặc với kế hoạch
(`docs/plans/archive/2026-11-01-nocobase-studio-ke-hoach-phat-trien.md`).
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
- **`fallbackAfterSeconds` đã nối (M1.4, 08/11/2026); `delegationQueueTimeoutSeconds` vẫn chỉ được lưu.** Project manager chạy bằng
  danh sách model của agent "first choice" rồi "fallback" (`ensureSystem`, theo thứ tự). Việc chờ bao lâu mới chuyển sang fallback do
  plugin agents quyết định, và plugin dùng `policy?.fallbackAfterSeconds ?? 0`: không đăng ký `ModelSelectionPolicies` thì số 120 ở đây
  **không có tác dụng gì** (lỗi tồn tại từ S2 tới M1.4). `server/providers/project-manager.ts` nay đăng ký chính sách cho
  `ds-project-manager`, đọc cài đặt ở mỗi lần claim nên đổi là áp dụng ngay. `delegationQueueTimeoutSeconds` chưa có chỗ nào đọc
  nên giao diện không hiện nó (muốn dùng phải thêm `SubjectBinding.queuedTimeout` hoặc tương đương). `commentRunLimit` được handler
  của kind `agent` dùng.
- **Thêm so với hợp đồng demo `StudioProjectManager`:** trường `defaults` (giá trị "khôi phục mặc định") và route
  `GET /api/projectManager/agentOptions` (agent bật, có tool và model, trừ chính project manager) cho trang Cài đặt → Trưởng nhóm agent.
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

## 14. PAT fine-grained không có quyền Checks (02/11/2026)

Danh sách quyền của fine-grained personal access token **không có mục "Checks"**: chỉ GitHub App hoặc PAT classic đọc
được check runs của một commit. Gọi bằng PAT fine-grained trả `403 Resource not accessible by personal access token`.
Hướng dẫn tạo PAT trước đó (bảo bật "Checks: Read-only") là sai. Studio chuyển sang đọc `actions/runs?head_sha=…`
(cần **Actions: Read**, PAT đã có), lấy lần chạy mới nhất của mỗi workflow (`server/git/github.ts`, `checks()`); không
đọc được cả hai thì PR vẫn được lưu và liên kết, CI để `missing` và merge bị chặn `ciMissing` (`refreshPull`). Đã thử chỉ
đọc trên GitHub thật với PR #1 của sandbox: check runs 403, actions runs `ci completed/success`. GitHub App (S5) sẽ đọc
check runs trực tiếp.

## 15. S4 phần 1 — Project memory (02/11/2026)

Thượng nguồn chỉ có **định dạng** (`.nb-studio/memory/*.md` trong repo `nocobase/nocobase`: front matter `name`,
`description`, `type` `feedback|project|reference`, `modified`, rồi thân bài) và hợp đồng API của demo
(`GET /api/projectMemory`, `…/{projectId}/repos/{repoId}`, `…/file`, lệnh `memory list|get|read`); phần đọc nằm trong lớp
Studio đóng. Studio Dương Sinh tự viết, **chỉ đọc**:

- `server/git/github.ts` thêm `branchHead`, `directory`, `file` (Contents API). PAT fine-grained của kết nối đã có
  **Contents: Read and write** (runs clone và push bằng chính nó), nên không cần thêm quyền. Thiếu quyền thì trang báo
  `unreachable` thay vì lỗi.
- `server/memory/service.ts`: đọc nhánh mặc định, giữ trong bộ nhớ theo commit đầu nhánh, hỏi lại GitHub tối đa mỗi
  60 giây; file cache theo blob sha nên commit mới chỉ tải file đổi. Giới hạn 50 file/repo (thừa thì báo `total`),
  file > 4 KB vẫn đọc nhưng gắn `oversize`. Không bảng DB mới, không migration.
- Quyền: thấy project nào thì đọc memory của repo gắn với project đó (`targetNames` / `pm.projects/view` cho run).
- Brief: `briefs.sections.register` thêm mục "Ghi nhớ của dự án" vào mọi run trên issue; GitHub chỉ được gọi trong
  `prepare` (ngoài transaction của claim), `section` không đọc gì thêm. Lỗi GitHub → bỏ mục, không chặn run.
- Chỉ dẫn mặc định của agent và nguyên tắc project manager thêm luật ghi memory trong cùng PR (thân bài tiếng Việt với
  **Vì sao:** / **Cách áp dụng:**, không bí mật, không dữ liệu cá nhân). Agent có sẵn nhận chỉ dẫn mới khi server khởi
  động lại (`applyDefaults`).
- Khác demo: chưa đọc nhánh của issue (chỉ nhánh mặc định), nên memory mới trong PR chỉ hiện sau khi merge; ứng dụng chưa
  có locale vi-VN nên chữ trên trang là en-US/zh-CN.

## 16. S4 phần 2 — Knowledge (02/11/2026)

Plugin `@nocobase/app-plugin-knowledge` 0.1.0-beta.16 cung cấp kho, tìm kiếm, đề xuất, snapshot và giao diện
(`KnowledgeView`); nó **không có không gian nào** cho tới khi ứng dụng bind `knowledgeAccessToken`. Thượng nguồn chỉ có
mẫu trong `app-template-examples` (một không gian, `inherits: []`, quyền thuần theo action); phần của Studio thật nằm trong
lớp đóng. Studio Dương Sinh tự viết:

- **Không gian** (`server/knowledge/access.ts`): `system` (khoá rỗng, tên "Dương Sinh") và `project` (khoá = id project,
  chỉ tồn tại khi project còn), project kế thừa `system`. Không gian khác (kể cả `default` của plugin) → 400.
- **Quyền** từ permission set (`kb.knowledge/read|propose|edit|manage`, mức `related`/`all`): `all` mọi không gian;
  `related` = đọc/đề xuất ở `system` cho mọi người, đọc/đề xuất ở project mình **thấy**, sửa/quản lý ở project mình
  **quản lý** (`accessTo().manage`). **Sửa `system` cần mức `all`** (chỉ admin/owner) — tài liệu plugin nói "ứng dụng
  liên hệ không gian hệ thống với mọi người" nhưng không nói mức sửa; Studio chọn hẹp hơn cho an toàn. Owner (root) có
  mọi quyền. Seed `202611040001_ds_roles_knowledge` thêm trang `knowledge` + Admin `*.all`, Contributor `*.related`.
- **Agent** (actor `agent`): lấy mức thấp hơn giữa người mà run hành động thay và cấu hình của agent
  (`kb.knowledge/read`, `kb.knowledge/propose`), không bao giờ quá `propose` (plugin cũng chặn). `kb.knowledge/read` nay
  là quyền mặc định của agent (`applyDefaults` ghi vào agent có sẵn khi khởi động). Actor kiểu khác (vd. `online-agent`
  của plugin) không đọc được gì — Studio chưa dùng online agent.
- **CLI**: lệnh `kb search` / `kb read` của plugin chỉ cho người (không nhận run token). Studio thêm `/api/kb/search`,
  `/api/kb/docs/{doc}`, `/api/kb/tree` (người hoặc run, đúng hợp đồng demo `kb:search|read|tree`) và gỡ hai operation
  `knowledgeSearchDocs`, `knowledgeGetDoc` của plugin khỏi manifest (`cliToken.exclude`, vẫn còn trong API cho giao diện).
  `kb read` nhận id (mọi không gian đọc được) hoặc slug (không gian `system`, hoặc `--scope/--owner`).
- **Thư mục cho trang** `/knowledge`: `/api/knowledgeDirectory` (+ `/search`) chỉ liệt kê `system` và project người xem
  thấy, rồi plugin tự lọc theo quyền từng tài liệu. Route của plugin tắt (`knowledge({ routes: false })`), trang nằm ở
  `client/pages/knowledge`. Chưa làm tab Knowledge trong trang project (trang tổng đã có không gian từng project).
- **Run**: mount `knowledge` (snapshot các không gian run đọc được, `INDEX.md` trước, đặt ở `knowledge/` cạnh các repo
  trong thư mục làm việc, không nằm trong repo) và mục brief "Tri thức (knowledge)" liệt kê tài liệu (tối đa 40 dòng) kèm
  cách trích dẫn. Quyền đọc được quyết trong `prepare` (ngoài transaction của claim). Runner không có tính năng `mounts`
  thì chỉ có mục brief + lệnh `kb search`.
- **Chưa có / khác demo**: agent chưa đề xuất sửa tri thức qua CLI (route đề xuất của plugin chỉ cho người; demo có
  `kb offers`), nên brief bảo agent ghi vào comment; chưa đăng ký subject provider (`user`, `role`) nên quyền theo từng
  thư mục/tài liệu chưa cấp được cho ai; **tìm kiếm ngữ nghĩa tắt** — chỉ tìm theo từ khoá. Bật sqlite-vec/pgvector cần
  một embedding model (tốn tiền hoặc chạy model cục bộ): chờ chủ dự án quyết.
- Nạp nội dung: `scripts/kb-import.mjs` (thư mục Markdown → không gian, giữ cây thư mục, chạy lại chỉ cập nhật file đổi,
  `--dry-run`; xác thực bằng `DS_STUDIO_COOKIE_FILE` hoặc `DS_STUDIO_API_KEY`, không in ra). Rà bí mật/dữ liệu cá nhân
  trước khi nạp: tri thức được mọi người và agent của không gian đọc.

## 17. S4 phần 3 — Sessions & Ask agent (02/11/2026)

Các plugin `app-plugin-agents` (conversations), `app-plugin-agent-sessions` và `app-plugin-projects` (plans) có đủ khung
nhưng **không ai nối chúng với nhau**: `projectsPlanSourceToken`, `projectsPlanHooksToken`, `projectsIssueSessionToken`,
`registerLinkKind`/`registerProjects` của agent-sessions và các `conversations.sources/contextKinds/rules` đều chờ "ứng
dụng lắp ráp" (lớp Studio đóng). README của `projectsPlanHooksToken` nói "the agents plugin binds it" nhưng trong
`app-plugin-agents` 2.0.0-beta.1 không có chỗ nào bind. Studio Dương Sinh tự viết (`server/conversations/`,
`server/providers/conversations.ts`):

- **Giao diện chat**: khối UI Library `@nocobase/agent-chat` (panel, trang hội thoại, nút "Ask agent") và
  `@nocobase/plan-card` cài bằng `shadcn add`. Cả hai lần cài **lại hạ cấp** `@nocobase/app-client`, `@nocobase/i18n` và
  `@nocobase/app-plugin-agents` trong `package.json` — đã khôi phục (đúng luật trong `.agents/rules/duongsinh-studio.md`);
  `@nocobase/markdown-mermaid` vào `devDependencies`. `message-item.tsx` của khối chỉ tắt `react-hooks/static-components`
  trong khi ESLint của template dùng `@eslint-react/static-components`: đã thêm tên quy tắc thứ hai vào cùng dòng tắt.
- **Layout**: `StudioChatProvider` (một `ChatProvider` cho mỗi người, xoá trạng thái panel và cache khi đổi người, như
  `app-template-examples`), `ChatPanel` cạnh `<main>` trong hàng `relative flex`, nút chat ở header (⌘J / Ctrl+J), nút
  nổi trên điện thoại; trang `/chat/:conversationId` và `chatLinkRoutes('/chat-link')`.
- **Ask agent** trên trang issue và trang project: `useChatContextSource` ghim issue/project, nút mở cuộc hội thoại mới
  kèm câu hỏi nháp (không tự gửi). Server đăng ký nguồn `askAgent` (tên nguồn khối chat gửi) và resolver ngữ cảnh `issue`,
  `project`: chỉ trả issue/project người hỏi **thấy** (qua `issueQueries.summaries` / `projects.list` theo quyền của
  người), cái khác bị bỏ và đếm vào `dropped`.
- **Luật cho run hội thoại** (`conversations.rules.provide`): trả lời tiếng Việt; không bao giờ đụng NocoBase 2 production
  `nocobase.dsc.edu.vn`; không in bí mật/dữ liệu cá nhân; đọc issue/PR/KB/memory bằng `ds-studio` và trích dẫn; **mặc định
  chỉ đọc** — muốn tạo/sửa việc thì đề xuất **một operation plan** để người duyệt ngay trong hội thoại, không ghi issue
  trực tiếp.
- **Plan từ hội thoại**: bind `projectsPlanSourceToken` — run của hội thoại đề xuất plan với nguồn
  `conversation` (khoá `conversation:<id>`, plan mới thay plan đang mở); run trên issue không được đề xuất plan
  (`null`). Quyền mới `pm.plans/use` (route plan của plugin kiểm nó cho run) là quyền **mượn** từ `pm.issues/view`, mặc
  định bật. Plan được **rehearse bằng quyền của run**, nên agent chỉ đề xuất được việc chính nó được làm: muốn agent hội
  thoại đề xuất tạo issue thì bật "Create issues" cho agent đó trong Capabilities (mặc định tắt, vì không có
  `projectsDelegatedWritesToken` thì agent có quyền này cũng tạo issue trực tiếp được — chưa bind DelegatedWrites).
  Thẻ plan hiện trong dòng thời gian của hội thoại (`ChatExtensionsContext.useTimelineItems` → `GET /projects/plans?
sourceKind=conversation&sourceKey=…`); người bấm Execute/Void ngay đó.
- **Khi plan được quyết** (`projectsPlanHooksToken.onPlanDecided`): Studio gửi tin `ds.plan.decided` vào hội thoại
  (`conversations.deliver`) trong cùng transaction của projects (bộ chạy transaction của agents nhận `outer` và chạy
  thẳng trên kết nối đó), đánh thức agent để báo kết quả — trừ plan bị huỷ (`voided`). Sự kiện của agents được phát
  sau một nhịp (`setTimeout 0`) vì không có móc "sau commit" của projects ra ngoài; nếu transaction rollback thì sự kiện
  chỉ khiến runner đọc lại, không sai dữ liệu.
- **Chưa làm**: `conversations.links.registerKind('issue')` — `resolve` của link kind chạy cả trong transaction của
  claim ("Linked work" mỗi lượt), trên SQLite không đọc được quyền của người qua kết nối khác; để sau (giải pháp: đọc
  quyền ở `prepare` hoặc dùng cache). Hệ quả: issue tạo từ plan chưa hiện thành "Linked work" của hội thoại (vẫn thấy
  qua tin `ds.plan.decided` và thẻ plan). `conversations.workspace.provide` (checkout repo cho hội thoại theo project)
  cũng chưa làm: agent hội thoại không có mã nguồn, chỉ đọc qua CLI.
- **Sessions trên máy người dùng** (agent-sessions, ACP): link kind `issue` (trạng thái tiếng Việt, "Chờ bạn nghiệm thu"
  khi người xem là owner của issue đang in_review, tìm `#` theo tiêu đề/mã), `registerProjects` (project người đó thấy),
  `registerInstructions` (tiếng Anh như plugin yêu cầu: trả lời tiếng Việt, không đụng production, đề xuất issue trước
  rồi mới `ds-studio issue create` trong session), và `projectsIssueSessionToken` (issue tạo từ session mặc định vào project
  của session và được gắn vào session). Trang "My agents" (`/agent-sessions` của plugin) đã có từ S0. **Chưa cài bridge
  ACP trên máy nào** — xem `docs/moi-truong-dev.md`.

## 18. S5.2 — GitHub App và webhook (02/11/2026)

Lắp ở `server/git/github-app.ts` (manifest, JWT RS256 bằng `node:crypto`, chữ ký webhook, API App), `server/git/service.ts`
(kết nối `kind: 'app'`, token installation, xử lý webhook, poll giãn), `server/providers/git.ts` (`repoAccess.prepare`),
`server/routes/git.ts` (3 route mới), `server/routes/webhooks.ts`, bảng `dsGitApps`/`dsGitAppManifests`/
`dsGitWebhookDeliveries` (migration `202611050001_ds_git_apps`). Test: `tests/server/git-app.test.ts` (GitHub giả kiểm JWT
bằng khoá RSA sinh trong test), `tests/database/ds-git-apps-migration.test.ts`, `tests/client/git-pages.test.tsx`.

- **Kết nối App song song với PAT.** Kết nối `kind: 'token'` giữ nguyên; kết nối `kind: 'app'` không có `tokenSealed`; khoá
  riêng và webhook secret niêm phong bằng secrets (purpose `duongsinh-studio/github-app-private-key` và
  `…-webhook-secret`, aad = id kết nối, có store để xoay khoá). Không thêm thư viện (không cần `@octokit/auth-app`).
- **Luồng manifest như GitHub quy định**: `POST /api/git/connections/startAppManifest` (chỉ quản trị, ngoài CLI) trả
  `postUrl` + `manifest`; trình duyệt POST form `manifest` lên GitHub; GitHub quay về `…/settings/git?code&state`; trang gọi
  `POST /api/git/connections/appManifest/complete` (state dùng một lần, hết hạn 1 giờ, đúng người đã bắt đầu) → Studio đổi
  `code` lấy App id, khoá, secret. Cài App xong GitHub về `…/settings/git?githubApp=<id>&installation_id=…` → `POST
/api/git/connections/{id}/installation`. Địa chỉ webhook/redirect lấy từ `app.publicOrigin` (`APP_PUBLIC_ORIGIN`) +
  base path, **không** đoán theo request; thiếu thì từ chối `GIT_PUBLIC_URL_MISSING`.
- **Credential cho run (đóng vế PAT của mục 11 đối với kết nối App).** `forRun` chạy trong transaction claim nên không gọi
  được GitHub: token installation được đúc ở `prepare` (trước transaction) cho mọi repo App của project, mỗi token **giới
  hạn đúng một repo** (`repositories: [name]`), hết hạn theo GitHub (1 giờ); `expiresAt` thật thay cho +1 giờ danh nghĩa.
  Cache dùng chung tới khi còn < 5 phút, nên `discard` không thu hồi (token tự hết hạn). Runner `gitCredentials`
  (`onDemand`) lấy qua `issue()`, `refresh` đúc token mới. Đọc/ghi phía server (poll, merge, mở PR) dùng token installation
  của mọi repo trong installation.
- **Liên kết repo qua App không kiểm `permissions.push`**: câu trả lời repo với token installation không có trường đó;
  quyền ghi là quyền của installation, Settings → Git liệt kê `missingPermissions` (so với contents/pull_requests/checks
  write, statuses/actions/metadata read).
- **Webhook** `POST /api/webhooks/github/connections/{id}`: không session, chỉ kiểm `X-Hub-Signature-256` (HMAC-SHA256 thân
  thô, `timingSafeEqual`); sai chữ ký, kết nối lạ hay kết nối PAT đều 401 như nhau; giới hạn thân 5 MB; id delivery lưu 7
  ngày để không xử lý lại lần gửi lại (trả 200 `duplicate`). `pull_request`, `check_run`, `check_suite`, `workflow_run`,
  `status` → đọc lại PR liên quan ngay (theo số PR, hoặc theo `head_sha` của PR đang mở); `installation` cập nhật/xoá
  installation; **`push` (tag) bỏ qua**, để S5.5 (release lines) dùng. Lỗi khi xử lý ghi vào `lastError` của kết nối, vẫn
  trả 202 (poll là lưới an toàn).
- **Poll giãn khi webhook chạy**: kết nối App đã cài và nhận delivery trong 24 giờ qua → repo của nó poll mỗi
  `max(pollSeconds, 600)` giây; không nhận gì → về `pollSeconds` (60 s).
- **Checks**: token installation đọc được check runs thật (App có quyền Checks); đường vòng `actions/runs` của mục 14 chỉ
  còn cho PAT.
- **Lệch với demo**: demo có `git/connections/{id}/authorize|startDeviceFlow|useToken` (token cá nhân), `repairWebhook`,
  webhook theo repo (`webhookMode repository`); Studio Dương Sinh chưa làm, chỉ một webhook mức App.

## 19. S5.4–S5.5 — Releases, môi trường, phiên bản, production marks (03/11/2026)

Lắp ở `server/releases/service.ts`, `server/providers/releases.ts`, `server/routes/deploys.ts` (`/api/deploys/*`,
`/api/attention`), migration `202611060001_ds_releases`, seed `202611060001_ds_environments` +
`202611060002_ds_roles_releases`; client `client/pages/releases/*`, `client/pages/environments/`, `client/hooks/use-releases.ts`,
nhãn trên danh sách issue (`client/pages/issues/release-labels.ts`) và mục "Release" trên trang issue. Test:
`tests/server/releases.test.ts`, `tests/server/git-app.test.ts` (webhook `push` tag), `tests/database/ds-releases-migration.test.ts`,
`tests/client/releases-page.test.tsx`.

- **Môi trường không phải của plugin `releases`.** Môi trường của plugin cần một driver chạy App (`host` in-process/docker
  cho app NocoBase 3). Preview/staging/production của Dương Sinh là NocoBase 2 chạy ngoài Studio (VPS, Dokploy), nên lớp
  Studio giữ bảng riêng `dsEnvironments` (`runsOn: external`, `recordOnly: true`): preview (tối đa 2, rảnh 30 phút, xoá khi
  PR đóng — mới là cấu hình, S5.6 làm phần chạy), staging (không protected), production (protected, approver = owner). Studio
  **ghi nhận**, không deploy. Trang plugin (Apps, Deploy environments) dời sang `/apps`, `/release-environments`
  (`releases({ appsPath, environmentsPath })`) để `/releases` và `/environments` là của Studio như demo.
- **Bind `releasesAccessToken`** (trước đó chưa bind: mọi người không giữ quyền gì của plugin): quyền từ permission set như
  projects/agents; catalog vai trò thêm nguồn `releases` (trang `rel-apps`, settings `rel.environments`, 9 action `rel.apps/*`).
  Seed: Admin `rel-apps` + `rel.environments` read/manage + `rel.apps` view/read-logs/deploy `all`; Contributor `rel-apps` +
  view/read-logs `related`. Agent: `rel.apps/view` và `read-logs` bật mặc định, `deploy` thành **people only**; thêm action
  Studio `studio.previews/manage` (mượn quyền sửa issue, chưa bật mặc định, dùng ở S5.6).
- **Bảng tên khác đề xuất ban đầu**: không có `dsProductionMarks` riêng — mọi đánh dấu (staging/production, `deployed` hoặc
  `rolledBack`) nằm ở `dsDeploymentRecords`; yêu cầu chờ chủ dự án quyết ở `dsDeploymentRequests`; thông báo dùng plugin
  notification (kênh `inbox`, `idempotencyKey`), không có `dsInboxNotices`.
- **Phiên bản từ tag**: release line `stable` mỗi repo (mặc định nhánh mặc định, `v*`, bỏ tiền tố `v`; sửa qua
  `PUT /api/deploys/repositories/{id}/releaseLine`). Đọc tag khi webhook App báo `push` một `refs/tags/*` (git service gọi
  listener `onTagPush`) và poll 10 phút (`GET /repos/{r}/tags`, 100 tag mới nhất). Version xếp theo ngày commit của tag.
  Issue của một version = PR đã merge (có issue) mà **merge commit nằm trong** `compare(previous...this)`; version đầu tiên
  hỏi `compare(mergeCommit...tag)` từng PR (tối đa 200). Tag biến mất → version `deleted` (giữ lại cùng các đánh dấu, không
  đánh dấu được nữa); tag quay lại → bỏ `deleted`. "Đọc tag" thủ công đếm lại mọi version (PR liên kết muộn).
- **Issue ở đâu**: `merged` → `released` (trong version) → `staging` → `production`, tính từ đánh dấu mới nhất của từng môi
  trường (rollback cũng là một đánh dấu). Tab **Pending release** = issue đã merge vào nhánh của line mà chưa lên
  production. Nhắc chủ dự án mỗi ngày một lần khi có issue merge quá 3 ngày chưa lên production.
- **Ai làm gì**: staging do quản trị đánh dấu; production **chỉ owner** (đánh dấu trực tiếp có ghi chú bắt buộc); người có
  `rel.apps/deploy` khác thì **đề nghị** → owner quyết trong Inbox (feed "Production marks to decide": duyệt phải gõ lại App
  id, ví dụ `duongsinh-nocobase-production`; từ chối phải có lý do; người đề nghị không tự quyết). Rollback production về
  version cũ trả danh sách issue nên cân nhắc mở lại và báo owner. Mọi route ghi là người thật (session/API key của chính
  người đó); run token và service account bị từ chối. Đọc (`environment list`, `release list`, `release pending`,
  `version list`) có trên CLI, run đọc được với `rel.apps/view`.
- **Lệch với demo**: chưa có `versionArtifacts`, `deploymentCount`/`comparisonState`, `publishTarget`, preview thật (S5.6),
  badge `attention` trên thanh bên (route `/api/attention` đã có, giao diện dùng Inbox).

## 20. S5.6 — Preview và staging NocoBase 2 qua Dokploy (03/11/2026)

- **Demo** dựng preview bằng `app-host` in-process cho app NocoBase 3 (`ds-studio deploy` một tarball). Repo của Dương Sinh
  là **NocoBase 2**, không chạy trong `app-host`, nên Studio dựng preview/staging thành **compose Dokploy** trên VPS
  (`nocobase/nocobase:2.2.36-full` + `postgres:16-alpine` + container `node:22-alpine` chạy `setup/run.mjs all`).
- **Khoá Dokploy toàn quyền** (chủ dự án chọn "Cho Studio giữ key Dokploy", 03/11/2026, biết rõ khoá với tới cả
  production): chỉ nằm ở biến `DOKPLOY_API_KEY` của compose `studio`. `server/previews/dokploy.ts` khoá cứng: chỉ tạo
  compose tên `nocobase-preview` / `nocobase-staging` trong môi trường của project `duongsinh-studio`; mọi lệnh trên
  compose có sẵn bị từ chối nếu id không nằm trong `dsPreviewSlots` **và** Dokploy không trả lời rằng compose đó đúng tên
  và đúng môi trường. Không gọi domain/server/user/settings. Test: `tests/server/previews.test.ts`.
- **Không dùng domain API của Dokploy; basic auth chỉ cho trang:** Dokploy bỏ middleware gắn vào router nó sinh (mục
  WebSocket ở `docs/trien-khai-vps.md`), nên compose tự khai router Traefik riêng. Router `ds-nocobase-<slot>` (mọi
  đường dẫn) có **basic auth** (htpasswd bcrypt sinh mỗi lần dựng, `$` nhân đôi trong nhãn Compose); router
  `ds-nocobase-<slot>-api` (`/api/`, `/ws`, ưu tiên cao hơn) không có, vì NocoBase gửi `Authorization: Bearer` cho mọi
  API, đè header Basic của trình duyệt → các đường đó do đăng nhập root (sinh ngẫu nhiên) của NocoBase bảo vệ. Cả hai
  thông tin đăng nhập niêm phong trong Studio, chỉ người sửa được issue thấy. Thêm `X-Robots-Tag: noindex`.
- **Không cần CI key/secret GitHub** (kế hoạch ban đầu: workflow tải tarball lên Studio bằng khoá CI): workflow
  `preview.yml` chỉ tải artifact; Studio nghe `workflow_run` qua GitHub App (đã đăng ký sự kiện ở S5.2) và cấp token
  installation 1 giờ chỉ của repo để container setup tải mã + artifact. Ít bí mật hơn, chủ dự án không phải đặt secret.
- **Một chỗ preview** `preview.dsc.edu.vn` (không có DNS wildcard, VPS ít RAM) thay cho `pr-<n>.preview…` tối đa 2.
- **Dừng khi rảnh:** Studio không thấy truy cập qua Traefik, nên "dùng" = bấm Mở trong Studio (`POST previews/{id}/open`)
  hoặc build mới; 30 phút không dùng thì `compose.stop`, mở lại thì `compose.start`.
- **Thời gian dựng:** trên VPS đang tải, `setup/run.mjs all` lần đầu mất > 60 phút với 1 CPU và một blueprint vượt
  giới hạn 5 phút trả lời của `fetch` trong Node ("fetch failed") → app preview được 1,5 CPU, setup chạy lại `run.mjs all`
  tối đa 3 lần (chạy lại an toàn). Setup báo lỗi thì Studio dừng compose (giữ log) và trả chỗ; không báo gì sau 3 giờ thì
  coi là lỗi. Preview chỉ tính "rảnh" khi đã `ready`.
- **Tài nguyên:** đọc `MemAvailable` của host qua `/proc/meminfo` trong container (không có lxcfs) và đo thời gian trả
  lời của production; < 1,2 GB trống thì không dựng (`blocked: resources`), production > 3 s thì dừng preview.

## 21. S6.1 — Tiếng Việt và nhận diện Dương Sinh (03/11/2026)

- **Bản vi-VN của plugin upstream là dịch máy và lệch nghĩa**: `projects` dịch issue thành "Vấn đề", executor thành
  "Người thi hành án", trạng thái "Tồn đọng"/"Đang xét duyệt"; `agents` dịch agent thành "Tác nhân"/"đại lý", runner
  thành "Trình chạy"/"Thời gian chạy"; một vài chuỗi vô nghĩa ("hành động trên sân khấu" cho stage action). Lớp app không
  sửa `node_modules`: theo skill `nocobase-app-plugin-i18n`, khối `overrides` trong locale của app (khoá theo tên gói,
  áp sau khi mọi namespace đã đăng ký nên app luôn thắng) — `client/locales/overrides/vi-VN.ts` (7 gói: agent-sessions,
  agents, foundation, knowledge, mail, projects, releases) và `server/locales/overrides/vi-VN.ts` (agent-sessions, agents,
  projects), sinh tự động bằng luật thay thế theo bảng thuật ngữ `docs/thuat-ngu.md` (chỉ áp khi chuỗi tiếng Anh tương
  ứng có thuật ngữ đó; "runtime" của plugin releases giữ nghĩa môi trường chạy ứng dụng), cộng trạng thái công việc viết
  tay. Test `tests/client/locale-parity.test.ts` báo lỗi khi một khoá override không còn trong plugin (sau nâng cấp).
- **File override phải nằm ngoài thư mục gốc `locales/`**: `pnpm nocobase locales check` coi mọi file `locales/*.ts` là
  một ngôn ngữ (`vi-VN.overrides.ts` bị báo là ngôn ngữ thứ tư), nên đặt ở `locales/overrides/vi-VN.ts`.
- **Mặc định vi-VN**: `server/config/i18n.ts` đổi `defaults.defaultLocale` sang `vi-VN` (đè được bằng
  `APP_DEFAULT_LOCALE`), `deploy/dokploy/config.yml` ghi rõ `i18n.defaultLocale: vi-VN`. Người đã chọn ngôn ngữ giữ lựa
  chọn của mình (plugin i18n lưu theo phiên). Mọi plugin Studio dùng đều đã có vi-VN (api-keys, concurrency,
  database-explorer, template-print không có locale client nào), nên không phải dịch bổ sung cho chúng.
- **Nhận diện**: skill thiết kế Dương Sinh không kèm tệp logo, nên dựng logo SVG theo quy tắc của skill (navy `#2B3990`,
  ô bàn cờ, chữ Roboto, nhấn cam `#F7941D`): `public/assets/ds-mark(-dark).svg`, `ds-logo(-dark).svg`; favicon SVG,
  `theme-color`, tiêu đề trang, màn hình tải; token `--primary` của hai theme đổi sang `#2B3990` (tối `#9AA8F0`), panel
  đăng nhập navy + điểm nhấn cam; font Roboto (Google Fonts) đứng đầu `--font-sans`. Biểu tượng NocoBase trong
  `brand-loading-mark`/`brand-watermark` (hình trang trí khi tải) giữ nguyên. Khi có file logo chính thức thì thay bốn SVG.

## 4. Agent Sessions client bắt buộc tên CLI của app

`plugin register` ghi `agentSessions()` không tham số. Server vẫn boot và `curl` trang chủ vẫn trả 200, nhưng client ném
lỗi ngay khi nạp plugin: `agentSessionsRoute() needs the application’s command line, such as { cli: "acme" }`. Chỉ
4 file test client (`client-plugin-registry`, `client-runtime`, `foundation-integration`, `tailwind-sources`) bắt được.
Bài học: kiểm chứng giao diện phải chạy test client hoặc mở trình duyệt, không chỉ `curl`.

Cách làm: khai báo `nocobase.cli` trong `package.json` (`bin: ds-studio`, `displayName: Dương Sinh Studio`,
`envPrefix: DS_STUDIO`, nên CI dùng được `DS_STUDIO_API_KEY`), cài `@nocobase/app-cli-client`, chạy
`pnpm nocobase cli link`, và truyền `agentSessions({ cli: 'ds-studio' })`. Đăng nhập thiết bị (`auth.clientId`) và
`skills` giao kèm runner để đến S2.

## 22. Tính năng Tự lái (Autopilot, AP1–AP6, 04/11/2026)

- Thêm hệ thống phiếu review có cấu trúc (bảng `dsReviews`), cài đặt tự lái theo dự án (bảng `dsAutopilotSettings`), bộ đánh giá điều kiện tự merge 7 bước (`server/autopilot/evaluator.ts`), bộ lập lịch mở việc kế tiếp (`server/autopilot/scheduler.ts`, bảng `dsAutopilotIssueFlags`, thừa hưởng cờ từ epic), phát hiện đứng việc và xử lý giới hạn hạn mức (`server/autopilot/stall.ts`), giao diện cài đặt tự lái (`client/pages/projects/project-autopilot.tsx`), công tắc dừng khẩn cấp toàn hệ thống và bản tin digest 21:00 (`server/autopilot/digest.ts`).
- **PostgreSQL transaction abort (25P02)**: Trong seed tạo user dịch vụ hệ thống `studio-autopilot` (`database/main/seeds/2026110803_ds_autopilot_user.ts`), không query thử các bảng trừu tượng/chưa có trong schema vật lý (như `authorizationAssignments`) để tránh huỷ toàn bộ transaction seed của PostgreSQL.

## 23. U1 — Nâng template beta.86 → beta.88 (06/11/2026)

Nguồn: registry npm, phiên bản chỉ định theo kế hoạch (`beta` lúc nâng đã là beta.89, không dùng). Quy trình: `docs/nang-cap.md`.

- **Mailer (breaking ở `app-server` 5):** gỡ `@nocobase/app-server/mailer`; Studio không dùng API đó nên không phải sửa mã. Thêm
  `server/config/mailers.ts` (mặc định rỗng) và `mailers` trong cấu hình; email vẫn chưa bật. `server/config/notification.ts` giữ kênh
  `inbox` mặc định của Dương Sinh, TARGET để rỗng.
- **Cấu trúc System settings mới của template** (kế hoạch U1 chưa nêu, skill bắt buộc gộp): một mục sidebar, trang chủ dạng thẻ theo nhóm, tab
  trong module. Tiền tố và nhãn công việc vào `settingsBusiness`, Git vào `settingsSystem`; tên route, URL và `authz` không đổi. Các trang
  Agent, Runner, Skill, Mức sử dụng, Mô hình vẫn nằm ở sidebar nghiệp vụ, chưa chuyển vào cấu trúc này.
- **`autoSignIn: true` ở mặc định của template:** production giữ `false` trong `deploy/dokploy/config.yml`, không đổi hành vi. `config.yml` dev cũng khai `false`.
- **Giữ của Dương Sinh:** trang đăng nhập navy, logo `ds-mark`, `StudioChatProvider`, `ChatPanel`, `ChatHeaderButton`. Tiêu đề đăng nhập vi-VN gộp thành hai dòng theo
  layout mới, giữ nguyên câu chữ; chân sidebar `Cờ vua Dương Sinh · Studio` thay cho slogan NocoBase. Nút giao diện chuyển vào menu tài khoản theo template.
- **Foundation quét mã nguồn khi khởi động (lệch tài liệu):** README ghi "không có warm-up job", nhưng `FoundationProvider.start()` gọi
  `ensureScan()` mỗi khi chưa có snapshot cho phiên bản kernel đang chạy. Trên checkout mã nguồn, lần quét phân tích tĩnh toàn bộ TypeScript của
  app, đồng bộ trong tiến trình (khoảng 45 giây với 82.000 dòng của Studio, RSS tới khoảng 800 MB) và không có tuỳ chọn tắt.
  - Production không chạy nhánh này: bản phát hành không có `client/routes` nên plugin đọc `dist/server/foundation-modules.json`. Đã đo bản build trên bản sao
    DB production: `healthz` sau 6 giây, RSS 614 MB.
  - Test: mỗi DB mới đều quét lại, làm test và hook vượt timeout 30 giây. `tests/setup/skip-foundation-source-scan.ts` thay `ModuleSourceCache` bằng kết quả rỗng
    **chỉ trong test**. Nên báo upstream; khi có tuỳ chọn tắt thì bỏ file này.
- **Lỗi có sẵn trên `main` phát hiện khi đối chiếu mốc** (không do nâng cấp, đã sửa):
  - `autopilot.ts`, `reviews.ts` mount ở gốc API với `routes.use('*', auth.required(...))`, làm mọi route đăng ký sau đó đòi phiên đăng nhập. Hậu quả **trên production từ bản
    tự lái**: webhook GitHub trả 401, run token bị 403 ở `/cli/manifest`, đường dẫn API không tồn tại trả 401 thay vì 404. Đã thu hẹp về đúng path của từng router.
  - `tests/server/agent-gate.test.ts` thiếu `studio.reviews/submit`; khoá `common.cancel` chưa khai báo nên nút Huỷ ở trang tự lái và tiền tố công việc hiện khoá thô.
- **Migration khi nâng production:** chỉ `202611070002_foundation_snapshots` chạy (thêm một bảng rỗng, có `down`). `202610260001_ag_drop_directory_index` và
  `202610260002_rel_bound_artifact_keys` đánh dấu `irreversible` nhưng `shouldRun` là false nên bỏ qua. Không lệch checksum.
- **Runner trên VPS không cài bằng npm:** bản tự quản ở `~/.local/share/nocobase-runner`. Tải `storage/runners/dist/stable/nocobase-runner` mới lên là runner tự cập nhật qua heartbeat; `nocobase-runner update` làm ngay.
- **`ds-studio issue update --needs-you null` ghi chuỗi `"null"`**, không xoá giá trị; xoá thật phải dùng `--file` với `{"needsYou":null}`.
- **Autopilot không tự merge trong luồng thật (có sẵn từ AP):** nguyên tắc trưởng nhóm luôn ghi `needsYou` khi sang `in_review`, còn điều kiện 2 của bộ đánh giá đòi `needsYou` rỗng. Test và ca PR #3 đặt tay `needsYou: null` nên không lộ ra.

## 24. U2 — Cơ chế mới của plugin (06/11/2026)

- **Giữ `runKeyScope`, không thay bằng admission:** `Auth.addCredentialRoutePolicy` (`CredentialRoutePolicy`, agents beta.3, projects beta.25) chỉ quyết định một issued credential có **vào được route** không,
  và khi trả `true` thì "delegates scope enforcement to the application". `runKeyScope` làm việc khác: thu hẹp từng kiểm tra `AuthorizationContext.can` theo action mà gate cho phép. Hai cơ chế bổ sung cho nhau, không thay nhau.
  Studio chưa đăng ký policy nào vì `undefined` giữ nguyên `security` khai báo trên route, đúng ý hiện tại; các route run mới của plugin vẫn bị `runKeyScope` chặn (test `run-actor`). Cập nhật cho mục 9.
- **Autopilot chưa được nối thật từ AP3–AP6 (đã sửa):** provider không truyền `agents`, `notify`, `owners` cho scheduler và stall detector, nên trên production đánh thức trưởng nhóm và báo Hộp thư không bao giờ chạy; digest gửi nhầm kênh `in-app` trong khi tên kênh là `inbox`;
  `handleQuotaFailure` không có nơi gọi. Test cũ dùng mock nên không lộ ra. `tests/server/autopilot-wiring.test.ts` đi qua provider thật.
- **Hạn mức tool:** `syncQuotaWaits` đọc `runs.workload`, lấy `wait.until` của `toolQuota`; biết giờ hồi thì dùng đúng giờ đó, không biết thì giữ backoff 30 phút → 2 giờ. Trong lúc đó project mở tối đa 1 việc.
- **Autopilot và `needsYou` (chủ dự án chọn sửa, 06/11):** lượt của trưởng nhóm trên project bật tự lái nhận thêm quy tắc `AUTOPILOT_ON_RULE`: bàn giao mà để trống `needsYou`, trừ khi có quyết định thật. Hệ quả có chủ ý: PR đạt đủ điều kiện sẽ tự merge không chờ chủ dự án.
- **Lượt read-only** dùng `sessionPolicy: 'fresh'` để review độc lập với phiên làm việc; **trưởng nhóm** nhận tóm tắt các lượt trước qua `turn.fresh` (`runs.recentSummaries`).
- **`work_skipped`:** hook `useIssueCommentActions` của plugin bỏ trường `skipped` của `POST comments`, nên Studio đọc từ activity `work_skipped` để hiện lý do (giới hạn 20 lượt/24 giờ…).

## 25. U3 — Tiến độ công việc, hàng đợi agent, run lỗi (06/11/2026)

- **Bàn giao owner và giới hạn lượt chạy suy ra từ activity** (`owner_changed`, `work_skipped`) của plugin, không tạo hàng đợi riêng; bảng chỉ lưu câu trả lời của người. `notificationKey` và `token` là UUID băm từ id activity, nên chỉ dùng được cho đúng lần đó.
- **Giới hạn 20 lượt tính từ lần "Tiếp tục" gần nhất** (`dsCommentRunGrants`), trong cửa sổ 24 giờ; demo không nói rõ cách tính lại.
- **Thêm trường `failedRunId` vào `StudioIssueProgress`** (lệch có chủ ý): thẻ run lỗi cần biết run nào đang chờ quyết định.
- **`failedRuns/{id}/decide` với `reassign`:** có `userId` thì đổi người phụ trách; không có thì đánh thức trưởng nhóm để giao agent khác. `cancel` chỉ ghi nhận quyết định, không đổi trạng thái công việc.
- **Test chập chờn:** `tests/client/permission-management-tabs.test.tsx` (template) có thể vượt timeout 30 giây khi máy dev bận; chạy riêng thì xanh.
- **`DB_FILENAME` không có tác dụng trên dev** vì `config.yml` khai sẵn đường dẫn: thử sống dùng DB dev có sẵn. Muốn DB trắng phải đổi trong `config.yml`.

## 26. U4 — Inbox hợp nhất, badge, Follow-ups (07/11/2026)

- **Quyết định đọc từ trạng thái công việc, không lưu riêng:** `inbox/waiting` tính từ issue của người đó (`in_review`, `needsYou`, run lỗi chưa trả lời), nên quyết định đã xong tự biến mất và `inbox/reconcile` luôn không có gì để sửa. Id của mục là UUID băm từ khoá quyết định, không phải id thật trong `notificationInAppItems`.
- **Hộp thư vào menu chính** (template để ngoài menu): không có nút nào khác dẫn tới `/inbox`.
- **`app-layout.tsx` gọi `useNavigationCounts`** để truyền badge cho menu; lúc nâng template cần giữ. Hai test shell mock hook này.
- **`StudioFollowingState`** dùng `{ following, stored }`; `/followUps` chỉ tính bình luận của người khác vào `unread`, chưa tính thay đổi khác.

## 27. U5 — Dashboard (07/11/2026)

- **(Đã thay ở §38: thẻ thứ tư nay là chi phí mỗi công việc, token ở chú thích.)** Trước đây thẻ KPI thứ tư là token mỗi công việc, không phải chi phí mỗi công việc: agent của Studio chạy bằng gói thuê bao. `reports/delivery` vẫn trả `costPerIssue` đúng hợp đồng và thêm `tokensPerIssue` ở `current`, `previous`, `buckets`.
- **Biểu đồ lượt chạy dùng cột chồng tự vẽ thay cho vùng chồng của demo:** không kéo `echarts` vào trang, màu lấy từ token theme, có chú giải, tooltip và bảng số. Bốn token `--run-*` thêm vào `client/theme/themes/*.css` và `client/styles.css` (đã qua validator của skill `dataviz` ở nền sáng và tối); không đổi `--chart-*` vì `flow-diagram.tsx` đang dùng. Lúc nâng template cần giữ.
- **`groupBy` của `reports/usage`:** theo enum của demo (`agent|person|project|issue|day|model|tool`), đổi sang `group`/`subject` khi gọi plugin. Không nhận `type` tuy mô tả của demo có nhắc tới.
- **`SubjectFacts.group` giờ là project của công việc** (`server/providers/issue-subject.ts`), trước đó luôn `null`; nhờ vậy `?projectId=` và nhóm theo project mới có nghĩa.
- **`statuses` của `reports/metrics`** dùng ngưỡng của Studio (`METRIC_TARGETS`), demo không công bố ngưỡng: agent làm ≥ 50%, review đạt ≥ 80%, chờ nhận ≤ 30 giây, không mất run, quyết định ≤ 1 ngày.
- **`humanLoad`** chỉ tính hai loại quyết định Studio lưu lại (`failedRun`, `ownerHandoff`); `openDecisions` đếm công việc có `needsYou` hoặc chờ nghiệm thu. Demo tính từ thông báo quyết định.
- **`failedRuns` của `reports/attention`** bỏ cả run đã có quyết định, không chỉ run đã gửi lại.
- **`meta.message`** của `reports/metrics` và `reports/usage` viết theo ngôn ngữ mặc định của ứng dụng; không có dòng chi phí vì Studio dùng gói thuê bao.
- **Quyền:** trang `reports` nằm trong catalog vai trò (`server/access/access-service.ts`), seed `202611090001_ds_roles_reports` cấp cho Admin và Contributor. Hành động `studio.reports/read` trỏ thẳng vào quyền trang đó và không `borrowed`, nên run được qua cổng trang khi agent có hành động này.

## 28. U6 — Thiết lập dự án, khoá tổ chức, git theo hợp đồng (07/11/2026)

- **`projectSetups`:** tạo project, nối repo có sẵn và tạo issue "Khởi tạo dự án" giao trưởng nhóm agent. `newRepo` tạo repo bằng token cá nhân của người gọi khi App cài trên tài khoản cá nhân, vì GitHub không nhận token cài đặt của App ở `POST /user/repos`; trên organization thì dùng token cài đặt, cần quyền Administration của App. `deploy` và `ci` chưa áp dụng, trả `deployError`. Repo được nối trước khi tạo project, nên repo không với tới được thì không để lại project thừa.
- **Skill:** `project` là scope skill và biến; skill của project đi vào run qua `issue-subject.ts`. Năm skill `ds-*` (`server/agents/builtin-skills.ts`) được tạo một lần nếu chưa có; `ds-comment-style` ở scope global nên có trong mọi run. Runner phải có tính năng `skills`; runner thật đã có.
- **`organizationKeys`:** khoá thuộc tài khoản dịch vụ `studio-organization-keys` mang vai trò Admin, nên khoá tối đa bằng Admin trong phạm vi của nó, kể cả khi owner tạo. `managedBy` luôn `null` cho đến khi có app-host. Không chọn được từng bản ghi trong một nhóm phạm vi, vì Studio chưa nối nguồn bản ghi của plugin.
- **Nhóm phạm vi khoá:** Studio nạp nhóm của plugin projects, agents, releases vào registry. Trước đó danh sách rỗng, nên khoá cá nhân có phạm vi cũng không dùng được.
- **Git, chỗ khác demo:** `wakeOn*` luôn `false` và đặt thì trả 400 `WAKE_RULES_UNAVAILABLE`, vì Studio đánh thức agent qua tự lái. `branchRules` chỉ nhận một luật dạng `<prefix>*`. `repairWebhook` trả 400 vì webhook GitHub thuộc về App. `git/connections` PATCH chỉ đổi tên và token.
- **`git/checks`:** "External CI" nhận API key có nhóm `studio.checks` (organization key hoặc khoá có phạm vi đó), không phải một khoá riêng cho từng repo như demo. "Agent self-check" chỉ nhận head của PR nối với issue, chưa nhận head nhánh của issue.
- **`git/authorizations`:** chỉ có `useToken`. Token cá nhân được lưu kín nhưng chưa dùng để commit đứng tên người đó; OAuth và device flow để sau.
- **`referenceChecks`:** check tham chiếu hiện ra nhưng không tính vào CI. `git/resources` chỉ đọc được bởi người thấy project, chặt hơn `git/repositories` hiện có (người đọc được agent thấy mọi repo).
- **Sửa kèm:** `reports/attention` bỏ PR của công việc đã xong khỏi danh sách chờ review.
- **`kb/offers`:** lưu bằng hành động `kb.knowledge/propose` (demo gọi là `offer`). Duyệt trên trang công việc, không vào Hộp thư, đúng mô tả của demo là không gửi thông báo. `kb/docs?q=` lọc theo tiêu đề, tóm tắt và slug, không dùng tìm kiếm toàn văn; muốn tìm trong nội dung thì dùng `kb search`.
- **`deploys/*` theo hợp đồng demo:** các route `versions/{id}`, `deploymentRecords`, `releaseLines`, `hubCounts`, `unreleasedTasks`, `pendingVersionTasks`, `versionProgress`, `productionMarks` đọc từ bản ghi có sẵn của Studio (phiên bản từ tag). Hình dữ liệu gọn hơn demo: một repo chỉ có một release line, `releaseId` là id phiên bản, `appId` là khoá môi trường, `sha` của bản ghi triển khai là `null`. `previews/status|down|retry` theo issue; `previews` trên trang công việc chưa dùng các route này.
- **App-host (Q5), chủ dự án chốt 07/11/2026: có route, chưa bật Host.** VPS chỉ còn khoảng 3 GB RAM khả dụng, Studio bị giới hạn 1,5 GiB. Plugin releases cần environment có driver, nên `server/providers/build-storage.ts` đăng ký driver `external` chỉ lưu và từ chối mọi lần chạy. `builds/deploy` luôn trả 400 `APP_HOST_OFF`; App vẫn chạy qua Dokploy.
- **`builds/*`, `repositoryDeployments/*`, khác demo:** `testApps` và tạo App theo `plan` chưa làm; `apps` của `repositoryDeployments` chỉ gồm vai trò staging và production; CI file chỉ sinh cho GitHub Actions, build theo nhánh, chưa có preview theo pull request; khoá CI là organization key có `releases.apps` và `studio.checks`, phạm vi toàn bộ App chứ không riêng App của repo (Studio chưa nối nguồn bản ghi); tự tải lên qua `curl` với ticket, chưa qua lệnh CLI. `releaseId` của `deploys/productionMarks` vẫn là id phiên bản từ tag, chưa phải bản build.
- **`deploys/releases/{id}`** trả dữ liệu của plugin, thiếu `deployments`, `variables`, `runningIn` theo hình của demo. **Link tải** chỉ owner tạo được, chỉ lưu hash của token.
- **Admin được thêm `upload.all` trên App** (seed `202611100002_ds_roles_builds`), vì organization key không vượt quá vai trò Admin.

## 29. U7 — Thông báo ra ngoài và ngân sách (07/11/2026)

- **Email là channel riêng `studio-email`, không phải `system-email`.** README của `notification-providers` gợi ý tên
  `system-email`, nhưng plugin Users coi riêng việc có khai tên đó là "lời mời đã cấu hình email", kể cả khi `enabled: false`,
  nên trang mẫu thông báo bật sai (`tests/server/notification-templates.test.ts` phát hiện). Biến môi trường vì thế cũng riêng:
  `STUDIO_EMAIL_ENABLED`, `STUDIO_SMTP_USER`, `STUDIO_SMTP_PASSWORD`, `STUDIO_SMTP_FROM`. Lời mời người dùng vẫn đi theo
  `MAILERS_SYSTEM_*`, không đổi. Kế hoạch U7 ghi "mailer `system`" — lệch có chủ ý.
- **Ngân sách và tuỳ chọn thông báo là phần riêng của Dương Sinh**, demo không có route tương ứng nên không tính vào số route
  demo: `/budgets` (kèm `scopeOptions`, `release`), `/notificationPreferences`, bốn bảng `dsNotificationPreferences`,
  `dsDecisionAlerts`, `dsBudgets`, `dsBudgetEvents`. Plugin `agents` không có điểm móc trước `runs.enqueue`, nên việc chặn nằm ở
  bốn chỗ xếp hàng của ứng dụng: `agent-executor`, `issue-work` (trả `BUDGET_EXHAUSTED`), wrapper của tự lái, và `scheduler`
  (không mở việc nếu ngân sách đang chặn). Run do plugin tự xếp hàng ngoài các đường này (nếu có về sau) không bị chặn.
- **Kỳ ngân sách đổi lúc 0 giờ giờ Việt Nam** (cố định UTC+7), không theo UTC của máy chủ.
- **Quyết định cần báo là `needsYou` và `in_review` chưa xong**, phần còn lại của Hộp thư (run lỗi, PR) chưa gửi ra ngoài.
  Lần quét đầu tiên cho mỗi người chỉ đánh dấu mốc, không gửi dồn.
- **Trang "Thông báo của tôi" dùng `authz: 'skip'`**, vì đây là lựa chọn của chính mỗi người; server tự kiểm từng route.

## 30. K1 — khởi tạo dự án từ mẫu (07/11/2026)

- **Chỉ có template `default`**, chưa thêm `examples` (`z.literal('default')` ở `server/routes/project-setups.ts`). Mô tả công việc khởi tạo nay ghim
  `nocobase.templatePackage@nocobase.defaultTemplateVersion` đọc từ `package.json` lúc chạy (`server/setups/template-version.ts`); thiếu thì từ chối, không rơi về `latest`.
- **Cách (a):** agent scaffold bằng `create-app --no-install` ở thư mục tạm ngoài repo rồi chuyển vào gốc repo, vì `create-app` từ chối thư mục không trống
  và repo không có commit làm run lỗi `checkoutFailed`. Vì vậy `createRepository` luôn `auto_init`, kể cả khi chọn `empty`.
- **Hai lỗi mới của `POST /projectSetups`:** `GIT_REPOSITORY_EMPTY` (repo có sẵn không có commit) và `GIT_REPOSITORY_NOT_INSTALLED` (repo mới tạo xong nhưng App
  chưa với tới; repo không bị xoá). Cả hai xảy ra trước khi dự án được tạo.
- **Chưa làm:** hiển thị phiên bản template trên trang Thiết lập (cần route trả phiên bản).

## 31. M0.1 — đóng đăng ký công khai (08/11/2026)

- Mặc định của Better Auth (và của template) là **cho đăng ký**: `auth.emailAndPassword.disableSignUp` không đặt thì `POST /api/auth/sign-up/email` tạo tài khoản
  cho bất kỳ ai (production từng như vậy: cấu hình công khai chỉ có `{"enabled":true}`). `deploy/dokploy/config.yml` nay đặt `disableSignUp: true`; chặn ở server
  (400), không chỉ ẩn form. Người mới vào bằng link mời của owner (`/invite/:token` → `POST /api/users/invitations/accept`), đường này không đi qua `sign-up/email`
  nên vẫn tạo được tài khoản. `config.yml` và `server/config/auth.ts` của dev giữ mặc định vì nhiều test đăng ký trực tiếp.
- Test: `tests/server/sign-up-closed.test.ts` (đăng ký bị từ chối, lời mời vẫn tạo tài khoản, cấu hình production có `disableSignUp: true`).

## 32. Tệp tĩnh chỉ được phục vụ dưới `/assets/` (08/11/2026)

- `@nocobase/app-server` (`dist/spa/static-assets.js`, `routes.js`) chỉ trả tệp thật cho đường dẫn dưới `assetsPath` (mặc định `/assets`). Một tệp để ở gốc `public/`
  (ví dụ `manifest.webmanifest`, mà Vite vẫn chép vào `dist/client/`) **không bao giờ được phục vụ**: yêu cầu có đuôi tệp ngoài `/assets` đi xuống bộ xử lý còn lại và nhận `index.html`
  với `200 text/html`, nên hỏng âm thầm. Lỗi này lọt qua test tĩnh và chỉ thấy trên production (manifest M0.2). Mọi tệp công khai của Studio phải nằm trong `public/assets/`.
- `/assets` được trả với `cache-control: public, max-age=31536000, immutable` kể cả tệp không băm tên: đổi nội dung thì phải đổi tên tệp.
- `content-types.js` không có `.webmanifest` (sẽ thành `application/octet-stream`), nên manifest dùng đuôi `.json`.

## 33. M4.2 — driver `dokploy` cho app NocoBase 3 (09/11/2026)

- Plugin `releases` chỉ có driver `host` (App Host trong tiến trình hoặc Docker). Studio để App Host tắt (VPS dùng chung với production NocoBase 2, Docker socket tương đương
  quyền root), nên đăng ký thêm driver **`dokploy`** qua `releasesDriversToken` (`server/providers/nb3-apps.ts`, `server/releases/dokploy-driver.ts`, `nb3-compose.ts`): mỗi
  App NocoBase 3 là một compose Dokploy tên `nb3-<slug>` trong project của Studio. Chỉ đăng ký driver; môi trường dùng nó do quản trị viên tạo ở "Release environments", nên
  không có gì chạm Dokploy cho tới khi có người chọn.
- **Allowlist:** `createDokployClient(config, allowedIds, allowName)` có tham số thứ ba. Mặc định vẫn là hai tên preview NocoBase 2; client của NB3 dùng `isNb3ComposeName`
  (`^nb3-[a-z0-9]+(-[a-z0-9]+)*$`, tối đa 40 ký tự) trên các id ghi ở bảng `dsNb3Apps`. Hai client không dùng được compose của nhau. Mọi lời gọi lên compose có sẵn vẫn bị từ chối
  nếu id không do Studio ghi hoặc Dokploy không xác nhận tên và environment.
- **Phát tệp không cần SSH:** container Studio giải nén `dist/` (và `config.yml`) vào `dataDir` (một thư mục trong mount `storage`); compose gắn đúng thư mục đó từ phía host
  (`hostDir`). Chỉ giải nén `dist/`, đường dẫn trong archive không thoát được thư mục đích (`tar` bỏ `..` và `/` đầu).
- **Khác hợp đồng driver của plugin:**
  1. Không có `onDemand`: không có gì thấy request. App có `idleStopMinutes` bị dừng sau chừng đó phút **kể từ lần khởi động/deploy gần nhất** (quét mỗi phút), rồi bật lại
     bằng tay ("staging bật khi cần"). Dừng theo lưu lượng thật là việc sau (cần đọc log Traefik).
  2. `maxApps` (1–2, mặc định 1) giới hạn số App chạy cùng lúc: deploy/start thứ hai bị từ chối kèm lý do, không xếp hàng.
  3. Deploy lỗi không hoàn tác: compose giữ như Docker để lại (container cũ thường vẫn chạy), App báo `failed`.
  4. Biến môi trường của App đi vào `.env` của compose trong Dokploy (cùng chỗ giữ bí mật của chính Studio); tên trùng biến do driver đặt (`DB_*`, `APP_BASE_PATH`…) bị từ chối.
  5. Không có log (`logs.available = false`), chỉ ảnh chụp trạng thái từ bảng `dsNb3Apps` (`status`), không hỏi lại Dokploy.
- **Tên miền cố định** từng app (Q5): `hosts` ở cài đặt môi trường, mỗi app một tên; bị chặn `nocobase.dsc.edu.vn`, `studio.dsc.edu.vn`, `dokploy.dsc.edu.vn`.
- Mật khẩu PostgreSQL của app staging được sinh ngẫu nhiên và cất đã niêm phong (`secrets.seal`, mục đích `duongsinh-studio/nb3-app-database`) ở `dsNb3Apps.dbPasswordSealed`.
- Test: `tests/server/nb3-driver.test.ts`, `nb3-driver-registered.test.ts`, `tests/database/ds-nb3-apps-migration.test.ts` (Dokploy giả, không gọi mạng).

### 33.1 Sau lần deploy thật đầu tiên (10/11/2026)

Test với Dokploy giả không bắt được ba điều này; chúng chỉ lộ khi chạy NocoLMS thật, nay có test:

- Plugin `releases` đưa biến sinh sẵn của app (có `APP_PUBLIC_ORIGIN`) vào `spec.env`. Driver bỏ qua biến trùng tên với biến nó đặt khi giá trị đúng bằng giá trị đó, vẫn từ chối giá trị khác.
- Archive `dist/` của pnpm chứa ~2000 hard link; bộ giải nén nhận hard link trỏ vào trong `dist/` (không `..`), vẫn từ chối symlink và mọi link khác.
- Volume `storage` do Docker tạo thuộc root còn app chạy uid 1000: compose có service `<name>-init` chạy `chown -R 1000:1000` trước app (`depends_on: service_completed_successfully`).
- `composeStatus = done` của Dokploy nghĩa là compose đã chạy, không phải app đã hoạt động (container lỗi khi khởi động vẫn `done`). Driver chỉ báo `running` khi `https://<host><basePath>/api/healthz` trả 2xx trong 180 s (`probeTimeoutMs`).
- Thư mục giải nén dùng lại chỉ khi có `.extracted`; thư mục không có dấu bị xoá và giải nén lại.
- Traefik gửi `X-Forwarded-Proto: wss` cho WebSocket nên realtime của app NB3 bị từ chối (trình duyệt báo "Không chuẩn bị được kết nối thời gian thực"); compose của app có router riêng cho `<basePath>/ws` với priority 1000 và middleware ép `X-Forwarded-Proto=https`, giống compose của Studio.
- Biến "chỉ lần khởi động đầu" (như `INITIAL_ADMIN_PASSWORD`) chỉ đi vào lần deploy đầu; nếu lần đó thất bại trước khi DB được tạo, tài khoản quản trị sinh với mật khẩu mặc định. Chưa sửa; cách xử lý tạm: sao lưu và xoá DB rồi đặt biến ở tab Biến (đã làm với NocoLMS 10/11/2026).

## 34. P1 — My issues: khung chia đôi theo `taskGroups` (10/11/2026)

Khung chia đôi của My issues (`client/pages/issues/issue-split-view.tsx`) không còn đọc `useIssuePages` của plugin projects và tự đoán nhóm từ tên trạng thái; nó đọc
`GET /api/taskGroups` của Studio (`server/routes/inbox.ts`), như demo. Chênh lệch so với plugin và so với demo:

- **`taskGroups` mở rộng (server, của Studio, không sửa plugin):** thêm tham số `follow` (`all|scope`, mặc định `scope`); thêm `dependencyWait` và `blockers[{issueId,
identifier,title,reason}]` vào mỗi dòng, lấy từ `projects().subtasks.visibleBlockers` (một lượt đọc cho cả danh sách, chỉ blocker người xem được thấy). `mode=split` chỉ có
  bốn nhóm `wait`, `doing`, `backlog`, `done`: `in_review` và `blocked` không chờ người xem gộp vào `doing`, `cancelled` gộp vào `done`; `mode=table` giữ bảy nhóm.
- **Suy luận, chưa kiểm chứng với demo:** ý nghĩa của `follow=all` là "thêm các issue người xem đang theo dõi mà bộ lọc loại ra" (chỉ ở trang đầu, tối đa 100). Demo
  chỉ cho thấy tên tham số, không cho thấy khác biệt vì tài khoản demo không theo dõi issue nào. Nhóm `review`/`blocked` của chế độ `split` ở demo cũng chưa quan sát được
  (dữ liệu của người xem không có issue ở hai trạng thái đó ngoài nhóm `wait`).
- **Chưa làm so với demo:** `count` của nhóm là số dòng trong trang hiện tại, không phải tổng như demo (`done: 202`, chỉ trả 50), và con trỏ phân trang là một cho cả danh sách,
  không phải một con trỏ cho mỗi nhóm.
- **Phím tắt** J/K/S/Enter// nằm trong `IssueSplitView`, không sửa `PmShortcuts` của plugin (`C` và ⌘K vẫn của plugin). Bỏ qua khi gõ vào ô nhập hoặc có phím bổ trợ; Enter của một
  nút đang được lấy nét thuộc về nút đó (hàng danh sách mở issue bằng Enter riêng).
- Nhóm **thu gọn được, nhớ theo người dùng** trong `localStorage` (`studio.myIssues.collapsed.<id người dùng>`, lấy từ `membership` do server trả); **Done thu gọn mặc định**.
  Issue đang chọn nằm ở `?issue=<id>` (mặc định là issue đầu danh sách, URL chỉ được ghi khi người dùng chọn).
- **My issues mặc định mở dạng Chia đôi** (tham số `fallback` của `resolveIssueView`); trang Issues vẫn theo mặc định của plugin (bảng).
- Khung phải vẫn là `IssueDetailView` của plugin (có liên kết "Quay lại" thừa trong khung chia đôi); phần chi tiết theo demo làm ở P2.
- Test: `tests/server/task-groups-split.test.ts`, `tests/client/issue-split-view.test.tsx`.

## 35. Chi tiết issue theo demo (P2)

- `issues/detail/index.tsx` bỏ `IssueDetailLayout` (cột phụ 20rem) và dựng lại một cột: tiêu đề + nút **Theo dõi** (dùng `setSubscription` của plugin qua `useIssuePageActions().setFollowing`) →
  thẻ "Tiến độ / Cần bạn" → **Báo cáo bàn giao** → hàng **chip thuộc tính** (Trạng thái, Ưu tiên, Người phụ trách, Người thực hiện + "Thêm thuộc tính") → việc con, phụ thuộc, tệp →
  **bốn tab**: Hoạt động (mặc định), Mô tả, Mã & xem thử (PR, preview, release), Lượt chạy. "Thêm thuộc tính" mở phần còn lại của thẻ thuộc tính cũ (nhãn, dự án, ngày, autopilot,
  người theo dõi, ngày tạo) — `IssueAside` giữ nguyên, thêm tham số `compact` để không lặp bốn trường đã thành chip.
- **Thẻ "Cần bạn"** (`issue-needs-you.tsx`, cắm vào `IssueProgressPanel` qua `needsYouActions`): trạng thái kiểm tra của PR, liên kết "Xem giải thích mới nhất của Lead Agent" (cuộn tới
  bình luận agent cuối trên tab Hoạt động; `comment-thread.tsx` thêm `data-author-kind` để tìm), **Merge**, **Đánh dấu đã merge** (`POST git/pullRequests/:id/markMerged`, đã có ở server), **Xem thay đổi**.
  Không thêm route server: `markMerged` và `merge` đã có kiểm quyền và test ở `tests/server/git-contract-routes.test.ts`; nút chỉ hiện khi người xem được đóng issue.
- **Báo cáo bàn giao** là markdown trong `issue.acceptance` (khung cuộn khi dài) kèm ảnh chụp từ `GET projects/issues/:id/screenshots`. Khối "Tiêu chí nghiệm thu" cũ ở cuối trang bỏ (thay bằng khối này).
- **Gộp bản ghi hệ thống:** các dòng hoạt động liên tiếp do `system` ghi thành một dòng "N bản ghi hệ thống" mở ra được. Dòng do người hoặc agent ghi vẫn hiện riêng. Bộ lọc "Tất cả / Chỉ trao đổi" giữ nguyên.
- **Đầu trang dính:** hiện khi vùng cuộn của khung đã cuộn quá 160 px (tìm vùng cuộn từ chính sự kiện `scroll` ở pha capture, không phụ thuộc cách khung bố trí): trạng thái, mã, tiêu đề rút gọn, Merge, Về đầu trang.
- Trong khung chia đôi của My issues, chi tiết dựng với `embedded` (bỏ liên kết "Quay lại" thừa, đã nêu ở §34).
- **Chưa làm so với demo:** nút "…" ở đầu trang (Xoá vẫn là nút riêng); số đếm tab Lượt chạy; "Thêm thuộc tính" mở cả thẻ thay vì từng thuộc tính chưa đặt; chưa so Craft Anything (P0b chỉ chụp đường cơ sở).
- Test: `tests/client/issue-detail-p2.test.tsx`; `tests/client/issues-pages.test.tsx` đổi theo bố cục tab.

## 36. Issues: bảng nhóm (P3)

- Trang **Issues mở mặc định ở dạng bảng nhóm** (`resolveIssueView` với `fallback='list'`; mặc định của plugin là board, vẫn chọn được bằng `?view=board`). Bảng đọc `GET taskGroups?mode=table&follow=scope`
  (`issue-grouped-list.tsx`): bảy nhóm Cần bạn xử lý / Đang thực hiện / Đang duyệt / Bị chặn / Tồn đọng / Hoàn thành / Đã huỷ, thu gọn được, nhớ theo người dùng
  (`studio.issues.collapsed.<id>`, Hoàn thành và Đã huỷ thu gọn mặc định), cột Dự án, Trạng thái, Người thực hiện, Cập nhật.
- Dấu hiệu trên dòng: việc người xem phải làm (`waits`), việc đang chặn (`blockers`), "Agent đang làm", việc con `n/m` (`progress`), và PR + kiểm tra.
- **Thêm `GET /api/git/pullRequests/marks?issueIds=`** (tối đa 100 id; đường dẫn nằm dưới `/pullRequests/*` nên có `auth.required` + `authz.middleware`): mỗi issue người xem thấy →
  `{count, merged, state, ciState, url}`, ưu tiên PR đang mở rồi đã merge rồi đã đóng; issue không thấy được thì bị bỏ khỏi kết quả. Thay cho `git/marks` của demo (chưa giải mã được hình dạng).
- Bỏ sắp xếp theo cột và nút "Tải thêm" của bảng phẳng cũ: bảng nhóm là một lượt đọc của server (cùng giới hạn trang như khung chia đôi, §34), chưa có phân trang theo nhóm.
  `IssueTable` và `release-labels.ts` không còn trang nào dùng (board và Releases có bản riêng); chưa xoá.
- Chưa làm: nhãn phát hành (`deploys/marks`) trên dòng; chưa so Craft Anything.
- Test: `tests/client/issue-grouped-list.test.tsx`, `tests/server/git-contract-routes.test.ts` (marks, gồm 401), `tests/client/issues-pages.test.tsx` đổi theo mặc định mới.

## 37. My sessions (P4)

- `/sessions` là trang riêng của ta trên hội thoại của plugin agents (chat với agent trong Studio). Mục "Agent của tôi" (`/agent-sessions`) là trang của plugin agent-sessions (agent chạy trên **máy tính của chính người dùng**) —
  hai thứ khác nhau nên **không ẩn** mục của plugin (chủ dự án chốt 11/11/2026: giữ cả hai); mục của plugin đổi tên tiếng Việt thành "Agent trên máy tôi" để khỏi lẫn với "Phiên làm việc". Demo dùng chính `agent-sessions/runner/:id` cho "My sessions"; ta giữ trang riêng vì nó đã nối `ConversationView`.
- Bộ lọc **Tất cả / Cần tôi / Đang thực hiện** lọc tại trình duyệt, không đổi URL (như demo). "Đang thực hiện" theo `execution.status`/`run.status`, bỏ cách dò chữ trong `link.view.status`; tab "Cần tôi" có số đếm.
- Tiến độ issue gắn với phiên dựa trên `statusKey` thật: một lượt `projects/issues/summaries?refs=` cho cả danh sách (tối đa 100 id), không đoán từ nhãn.
- Chấm chưa đọc theo `lastSeq > seenSeq`; thẻ "Cần bạn" theo `needsYou` (lý do/văn bản ở `title`).
- **Khung phải** (từ `xl`): Issues của phiên (trạng thái thật), thông tin phiên (agent, dự án, trạng thái) và Mức dùng từ `agents/conversations/:id/usage` (token vào / đọc đệm / ra, chi phí USD). Chip dự án ở đầu hội thoại.
- Sửa lỗi dịch: khóa `sessions.*` trước đây tra qua hàm dịch của chat nên hiện khóa thô; `sessions.needsYou` không còn mang `{{count}}`.
- **Huy hiệu số phiên** trên sidebar (`my-sessions`) = `agents/conversationAttention` (`needsYou`, nếu 0 thì `unread`). Demo dùng `attention.counts.sessions`; `/api/attention` của ta chưa có trường đó.
- **Chưa làm:** đăng ký topic ws `agents:conversations` và `studio:conversations:attention` (danh sách vẫn làm mới theo cách của plugin, huy hiệu theo chu kỳ 60 giây); khung phải trên điện thoại; nhóm "Ran N commands" và composer là của `ConversationView` (không đổi).
- Test: `tests/client/sessions-page.test.tsx` (hook hội thoại của plugin agents trả từ fixture vì cần cả client của plugin; phần còn lại của trang là thật), `follow-ups.test.tsx` (số phiên).

## 38. Dashboard (P5)

- **Ô thứ 4 là Chi phí mỗi issue** (USD, theo `delivery.currency`), có sparkline từ `buckets[].costPerIssue`; số token mỗi issue giữ ở chú thích dưới số. Khi chưa có lượt chạy nào được định giá
  (công cụ thuê bao) hiện "Chưa đặt giá" kèm liên kết "Đặt giá" sang `/usage`. Mục "cố ý khác: token" trước đây đã bỏ. Server không đổi (`costPerIssue` đã có từ trước); chỉ thêm test cho trường hợp chưa định giá.
- **Biểu đồ lượt chạy là vùng xếp chồng** (SVG, bốn chuỗi theo thứ tự hoàn thành / lỗi / đang chạy / huỷ), thay cho cột; vẫn có chú giải, tooltip theo ngày và chế độ xem dạng bảng.
- **Bảng dự án** thêm cột tiến độ (thanh `done/total`, `role=progressbar`).
- Test: `tests/client/dashboard.test.tsx` (cập nhật), `tests/server/report-figures.test.ts` (chưa định giá).

## 39. Dự án, Phát hành, Môi trường (P6)

- **Trang dự án có tab bằng route con** `/projects/:projectId/{overview,issues,knowledge,memory,members,releases,settings}` (`pages/projects/detail/`; đường dẫn trần chuyển tới `overview` ngay trong trang vì hệ route không có chuyển hướng
  chỉ mục). Mỗi tab kế thừa quyền của trang dự án (`pm-projects`) và có tên breadcrumb đã dịch (`project-overview`, `project-issues`, `project-knowledge`, `project-memory-tab`, `project-members`, `project-releases`, `project-settings`). Tab Cài đặt chỉ hiện với người quản lý dự án.
  - Tổng quan: số liệu, phân bố, mô tả, thẻ **Bước tiếp theo** (`projectSetups/:id`, hiện khi việc khởi tạo chưa xong, kèm liên kết tới issue thiết lập), thuộc tính. Công việc: bảng nhóm của P3 với `projectId`. Tri thức: `KnowledgeView` của plugin ở không gian dự án.
    Bộ nhớ: `ProjectMemoryView` (tách từ trang `/project-memory`, ghim một dự án). Thành viên: bộ soạn thành viên cũ. Phát hành: `ReleasesHub` ghim một dự án.
  - Cài đặt chia phần trong `?section=general|directories|variables|skills`: Chung (autopilot), Thư mục (kho mã và kiểm tra CI), Biến và Skill (phần của plugin agents trên phạm vi `project`).
  - Số đếm tab Công việc và Thành viên lấy từ `projects/:id`; các tab khác chưa có số. Nút "Edit Checks" (`?edit=checks`) của demo chưa làm riêng (kiểm tra CI vẫn ở phần Thư mục).
- **Phát hành:** số đếm tab lấy từ `deploys/hubCounts` (đã có ở server, trước đây client không dùng); danh sách dự án thành cột dọc bên trái có tìm kiếm, phiên bản production và số issue chờ. **Không thêm `deploys/versionPipelines`:** `deploys/releases` đã trả từng dự án kèm phiên bản và số chờ, đủ cho danh sách, nên không có endpoint mới.
- **Môi trường:** nút **Thêm môi trường** (hiện với người có `rel.environments` `manage`) dẫn tới trang `/release-environments` của plugin releases, là nơi có sẵn form sinh từ cấu hình của từng driver; ta không tự dựng lại form. Trang "Môi trường" của ta vẫn chỉ ghi nhận môi trường của Dương Sinh (Preview/Staging/Production), còn môi trường chạy thật do plugin quản lý — hai khái niệm khác nhau.
- Test: `tests/client/project-tabs.test.tsx`, `tests/client/releases-page.test.tsx` (hub counts, danh sách dự án, nút Thêm môi trường), `tests/client/client-routes.test.ts` (các route con).

## 40. Khung: cài đặt kiểu sidebar, đầu trang, menu avatar (P7)

- **Thay đổi cấu trúc khung có chủ đích** (chi tiết và lý do ở `.agents/rules/shell.md`): khi ở dưới `/settings`, sidebar đổi sang các mục Cài đặt theo nhóm, có hàng "Quay lại" về trang trước khi vào Cài đặt; sidebar chính vẫn chỉ có một mục "Cài đặt".
  Trang chủ Cài đặt chuyển thẳng tới mục đầu tiên người xem được mở (không còn trang thẻ). Giữ nguyên tên route, đường dẫn, `authz` và id trang; chỉ đổi nhóm (`parent`) và tên nhóm.
- **Nhóm mới:** Không gian làm việc (tiền tố issue, nhãn) · Thành viên & quyền (người dùng, vai trò & quyền, vai trò thành viên mới, API key tổ chức) · Tích hợp (Git, mẫu thông báo) · Agent & vận hành (Lead Agent, ngân sách, skill mặc định) · Tài khoản của tôi.
  **Chưa làm:** gộp `issue-prefix` + `new-member-role` thành một trang "Chung" (kế hoạch muốn giữ hai id cũ làm chuyển hướng): để nguyên hai trang vì gộp phải đổi quyền/đường dẫn; ghi lại là việc riêng. Mẫu thông báo vẫn dưới Tích hợp (do `notification-routes.ts` chọn), model/giá nằm ở trang plugin agents.
- Trang Vai trò có cột **Số người giữ** (đếm từ `access/members`, tối đa 100 người đầu như hook sẵn có); cột ẩn khi chưa đọc được danh sách người.
- **Đầu trang:** biểu tượng My sessions và Inbox kèm số đang chờ (cùng nguồn với huy hiệu sidebar: `inbox/pending` = quyết định + thông tin, `agents/conversationAttention`). Demo lấy từ `/api/attention` `counts{tasks,sessions}`; `/api/attention` của ta chưa có trường đó nên không đổi nguồn.
- **Menu avatar:** thêm "Cài đặt tài khoản" (`/settings/my-account`) và "Dùng Studio trong agent của bạn" (hộp thoại: tạo lệnh cài CLI bằng download token `agents/dist/downloadTokens` của plugin agents, lệnh `ds-studio login`, nhắc dùng API key cá nhân ở Tài khoản của tôi).
- Test: `tests/client/settings-sidebar.test.ts`, `settings-back.test.tsx`, `settings-home.test.tsx` (chuyển hướng), `roles.test.tsx` (số người giữ), `agent-cli-dialog.test.tsx`, `header-quick-links.test.tsx`, `client-routes.test.ts`/`settings-navigation.test.ts` (nhóm mới, so theo tên).

## 41. Đối chiếu các trang plugin với demo (P8)

Đã mở bằng admin trên bản dev và so với ảnh 34, 37, 41, 42, 44 (các ảnh 43, 56–59 chưa so từng cái): Agents, Runtimes, Usage, Knowledge, Projects. Bố cục, cột, bộ lọc, nút "Thiết lập giá" và biểu đồ **giống demo**; khác biệt còn lại là của phiên bản plugin hoặc của dữ liệu, không sửa được bằng option:

- **Agents:** demo có thẻ **Lead Agent** ở đầu trang (tên, "Chạy bằng", nguyên tắc phân việc, giới hạn chạy theo bình luận, nút Settings). Plugin agents beta.19 của ta chưa vẽ thẻ này và không có chỗ cắm; Lead Agent của ta nằm ở `Cài đặt → Agent & vận hành → Lead Agent`. Cần nâng plugin hoặc xin chỗ cắm ở upstream; chưa làm.
- **Knowledge:** demo có dòng hướng dẫn phía trên khung ("Người có quyền sửa tri thức có thể sửa trực tiếp…") còn ta có thêm hàng "Tất cả đề nghị"; cả hai do phiên bản plugin knowledge.
- **Usage:** số rút gọn theo vi-VN (N = nghìn, Tr = triệu) thay cho K/M của demo: là quy ước tiếng Việt, giữ.
- **Skills, ảnh 56–59 (Set prices):** chưa so từng ảnh; mở trang Usage → "Thiết lập giá" hiện đúng.
- **Từ ngữ:** plugin dịch máy tiếng Việt ("Mã thông báo" cho token, "đặc vụ", "nhiệm vụ"/"tác vụ" cho issue, "tổng đài viên"). Thêm bản dịch lại qua `overrides` (`client/locales/overrides/vi-VN.ts`, phần `agentsAdditions`/`otherAdditions`) cho plugin agents, projects, releases và agent-sessions; quét lại bằng cách so khóa của plugin với phần override cho thấy không còn chuỗi nào trong nhóm từ này chưa được dịch lại cho knowledge, projects, releases, agents.
- Test: `tests/client/vi-plugin-overrides.test.ts`; bài kiểm tra có sẵn "rewords only keys the plugins still have" giữ cho override không trỏ vào khóa không tồn tại.

## 42. Tự merge PR của từng giai đoạn (chủ dự án chốt 11/11/2026)

- **Quyết định:** `autoCompleteOnMerge` **giữ mặc định tắt**. Với công việc nhiều giai đoạn, Studio tự merge PR của từng giai đoạn đã xong rồi công việc đi tiếp sang giai đoạn sau (`server/git/service.ts`, `autoMergeStage`).
- **Điều kiện** (chủ dự án chọn "kiểm tra đạt + giai đoạn ở Đang duyệt"): PR gắn với một công việc con **có giai đoạn** (`stage` khác rỗng, có `parentIssueId`), công việc con đó đang **Đang duyệt** (agent đã bàn giao), PR không phải nháp,
  không xung đột và mọi kiểm tra bắt buộc đạt (cùng `mergeBlockerOf` với nút Merge, **không ép**). Không đủ điều kiện hoặc GitHub từ chối thì để người xử lý như cũ.
- **Hệ quả:** merge bằng danh nghĩa chủ sở hữu công việc con; công việc con chuyển **Xong** (sự kiện `ds.pr.merged`) để giai đoạn sau được mở, còn công việc cha không bị đóng. Công việc không có giai đoạn vẫn theo công tắc của PR như trước.
- **Hàng rào của Tự lái áp dụng cho việc này** (`stageMergeAllowed` trong `server/autopilot/evaluator.ts`; git service chỉ merge khi chính sách này cho phép, không có chính sách thì không merge): công tắc **"Tự merge từng giai đoạn đã xong"** của dự án
  (cột `autoMergeStages`, mặc định bật, ở phần Tự lái của dự án); dự án đang tạm dừng; **dừng khẩn cấp** (nay đặt tạm dừng cho **mọi** dự án, kể cả dự án chưa từng cấu hình Tự lái); hạn mức merge mỗi ngày (`maxMergesPerDay`); và đường dẫn nhạy cảm
  (migration, workflow, `package.json`, cấu hình…): PR đụng tới thì để người xử lý. Mỗi lần merge ghi một sự kiện `merged` vào nhật ký Tự lái (cũng là cái hạn mức đếm) và gửi thông báo vào Hộp thư của chủ sở hữu.
- **Khác Tự lái đầy đủ:** Tự lái (`mergeIfEligible`) còn đòi phiếu review của agent khác, review bảo mật, báo cáo bàn giao và không có bình luận người sau review; merge giai đoạn **không** đòi các điều đó (theo lựa chọn của chủ dự án).
- **Thời điểm:** chạy mỗi lần Studio đọc lại PR (đồng bộ định kỳ, báo cáo kiểm tra, nút đọc lại), nên merge xảy ra trong lần đồng bộ kế tiếp sau khi đủ điều kiện, chưa phải ngay khi agent bàn giao.
- Thẻ **Dừng khẩn cấp** ở Cài đặt → Tiền tố công việc chỉ hiện với quản trị viên không giới hạn (đúng người server cho phép).
- Test: `tests/server/stage-auto-merge.test.ts`, `tests/database/ds-autopilot-stage-merge-migration.test.ts`, `tests/client/stage-auto-merge-ui.test.tsx`.
