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

## 4. Agent Sessions client bắt buộc tên CLI của app

`plugin register` ghi `agentSessions()` không tham số. Server vẫn boot và `curl` trang chủ vẫn trả 200, nhưng client ném
lỗi ngay khi nạp plugin: `agentSessionsRoute() needs the application’s command line, such as { cli: "acme" }`. Chỉ
4 file test client (`client-plugin-registry`, `client-runtime`, `foundation-integration`, `tailwind-sources`) bắt được.
Bài học: kiểm chứng giao diện phải chạy test client hoặc mở trình duyệt, không chỉ `curl`.

Cách làm: khai báo `nocobase.cli` trong `package.json` (`bin: ds-studio`, `displayName: Dương Sinh Studio`,
`envPrefix: DS_STUDIO`, nên CI dùng được `DS_STUDIO_API_KEY`), cài `@nocobase/app-cli-client`, chạy
`pnpm nocobase cli link`, và truyền `agentSessions({ cli: 'ds-studio' })`. Đăng nhập thiết bị (`auth.clientId`) và
`skills` giao kèm runner để đến S2.
