# Kế hoạch phát triển "Dương Sinh Studio" (bản NocoBase Studio tự dựng) — 01/11/2026

> Trạng thái: **bản thảo chờ chủ dự án duyệt** (xem mục 9 "Quyết định cần chốt"). Đặc tả nền ở
> `2026-11-01-nocobase-studio-dac-ta.md`; đặc tả bổ sung từ demo quốc tế (OpenAPI, CLI manifest, lead agent, skill, roles,
> CI, ảnh màn hình) ở `2026-11-01-nocobase-studio-dac-ta-demo-api.md`; kiểm kê đầy đủ 653 route + 389 lệnh ở
> `2026-11-01-nocobase-studio-phu-luc-api-cli.md`. Prompt cho phiên triển khai ở `2026-11-01-prompt-trien-khai-nocobase-studio.md`.
>
> **Cập nhật 01/11/2026 (chiều):** sau khi giải mã demo qua API, kế hoạch được chỉnh ở các mục 2 (A6, A10), 4b (danh sách
> route Studio phải tự viết), 5 (S1–S6 chi tiết hơn), 6 (bảng dữ liệu) và 10 (Tiến độ).

## 1. Bối cảnh & mục tiêu

- Dương Sinh đang chạy **NocoBase 2.2.36** (production https://nocobase.dsc.edu.vn, mã riêng ở `D:\code\duongsinh-nocobase`,
  plugin `@duongsinh/*` trong `packages/pro-plugins`). Các giai đoạn 1–2 đã xong phần lớn, giai đoạn 3 (LMS) đang bắt đầu.
- Chủ dự án muốn **"đầy đủ tính năng nâng cao như NocoBase Studio"**: một nền tảng để **giao việc cho các coding agent,
  theo dõi tiến độ, kiểm soát chất lượng (CI, review chéo), nghiệm thu, phát hành, lưu skill/kiến thức/bộ nhớ dự án** —
  thay cho cách làm hiện tại là mở từng phiên Claude Code thủ công.
- Kết quả giải mã (đặc tả, mục 0): Studio là **ứng dụng NocoBase 3** lắp từ các plugin mở trên `v3-develop` cộng một lớp
  đóng. Do đó mục tiêu kỹ thuật của kế hoạch này là:

> **Dựng ứng dụng NocoBase 3 tên `duongsinh-studio` (gói `@duongsinh/studio`), lắp từ plugin mở `app-plugin-agents /
projects / releases / knowledge / agent-sessions` + runner/protocol/bridge/CLI mở, và tự viết lớp "Studio" còn thiếu
> (Git hosting, PR/checks/preview/version, project manager, dashboard, inbox, follow-ups, project memory, testing).**
> Ứng dụng này điều phối agent làm việc trên **mọi repo của Dương Sinh** (trước hết `duongsinh-nocobase`, rồi
> `nocobase` fork, các app NocoBase 3 trong tương lai).

Không nằm trong phạm vi: thay đổi NocoBase 2 đang chạy; mua bản Professional (nêu ở mục 9 như phương án thay thế).

## 2. Quyết định kiến trúc

| #   | Quyết định                                                                                                                                                                                                                                                                                                                        | Lý do                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Xây trên NocoBase 3**, không viết plugin cho NocoBase 2                                                                                                                                                                                                                                                                         | 80 % Studio đã có sẵn dưới dạng plugin NocoBase 3; v2 không có runner/protocol/worktree/ACP; viết lại trên v2 là làm lại từ đầu và lệch hẳn kiến trúc thượng nguồn      |
| A2  | Ứng dụng riêng, repo riêng `D:\code\duongsinh-studio` (git mới), **không** đặt trong monorepo `D:\code\nocobase`                                                                                                                                                                                                                  | Khác toolchain (pnpm 11/Node 24/Vite) với v2 (yarn 1/Node 22); `D:\code\nocobase` chỉ dùng để tra cứu `upstream/v3-develop`                                             |
| A3  | Tạo bằng `pnpm create @nocobase/app@beta duongsinh-studio --template-tag=beta` rồi đăng ký thêm plugin; mã Studio tự viết đặt **trong ứng dụng** (`server/`, `client/`, `database/main/`) và, khi cần tách, thành local plugin `packages/app-plugin-ds-*`                                                                         | Đúng khuyến nghị `AGENTS.md` của template; dễ nâng cấp template bằng skill `nocobase-app-upgrade`                                                                       |
| A4  | Phát triển trong **WSL Ubuntu** (đã có trên máy), DB dev **SQLite** → production **PostgreSQL 16** trên VPS Dương Sinh (Dokploy)                                                                                                                                                                                                  | Template và runner đều yêu cầu POSIX; VPS đã có Postgres                                                                                                                |
| A5  | Runtime: **shared runner trên VPS** (user hệ thống riêng `studio-runner`, Claude Code + Codex đăng nhập) + **personal runner trong WSL** của chủ dự án; ACP bridge chạy thẳng trên Windows cho "My sessions"                                                                                                                      | Theo mô hình Studio; tận dụng gói Claude Max/ChatGPT của chủ dự án (skill `ai-subscription-bridge`)                                                                     |
| A6  | Git hosting: **GitHub** (tạo remote cho `duongsinh-nocobase` — hiện chưa có remote). Bắt đầu bằng connection **`kind: token`** (PAT fine-grained) + polling 60 s như demo; nâng lên **GitHub App** + webhook ở S5. CI bằng **GitHub Actions**                                                                                     | Demo chính thức cũng chạy bằng token; giảm 1/3 khối lượng S3 mà vẫn đủ PR/checks/merge                                                                                  |
| A10 | **Tái tạo đúng hợp đồng API của lớp Studio** (186 route thẻ `Studio`, phụ lục A) với cùng tên resource (`git/*`, `previews/*`, `deploys/*`, `inbox/*`, `followUps/*`, `reports/*`, `projectManager`, `projectMemory`, `access/*`, `organizationKeys/*`, `builds/*`, `repositoryDeployments/*`), chỉ đổi tiền tố thương hiệu ở CLI | Mọi route có `describeRoute()` → CLI `ds-studio` và manifest cho agent tự sinh; dễ đối chiếu với demo khi kiểm thử; sau này có thể dùng lại skill/tài liệu của NocoBase |
| A7  | Tên CLI thương hiệu: **`ds-studio`** (khai báo `nocobase.cli` trong `package.json`), runner giữ tên `nocobase-runner`                                                                                                                                                                                                             | Phân biệt với `nb-studio` thương mại; runner là gói mở dùng nguyên                                                                                                      |
| A8  | Ngôn ngữ UI mặc định **vi-VN**, giữ en-US; mọi chuỗi qua i18n                                                                                                                                                                                                                                                                     | Theo luật repo và thói quen đội                                                                                                                                         |
| A9  | MVP trước (S1–S3: issue + agent team + Git/PR/review/merge), rồi phần còn lại                                                                                                                                                                                                                                                     | Giá trị sớm nhất: giao việc cho agent và nghiệm thu qua PR                                                                                                              |

Phương án đã loại: (B) viết "Studio" như plugin NocoBase 2 — không có runner/protocol, phải tự viết ~40 bảng và giao thức;
(C) chỉ dùng CLI + skills `nocobase/skills` của NocoBase 2 — không có điều phối, theo dõi, review chéo, phát hành.

## 3. Kiến trúc đích

```
 Chủ dự án / nhân sự ─ trình duyệt ─► duongsinh-studio (NocoBase 3, /main, cổng 13100 dev · VPS qua Dokploy)
        │  My sessions (ACP bridge trên Windows)            │ PostgreSQL 16 · storage/ (fs; S3 sau)
        │                                                   │
        │   ┌─ app-plugin-projects  (issue/project/plan/intake AI)
        │   ├─ app-plugin-agents    (agents/runners/runs/skills/variables/usage/chat)
        │   ├─ app-plugin-agent-sessions + acp-bridge
        │   ├─ app-plugin-knowledge (KB system/project, pgvector)
        │   ├─ app-plugin-releases + app-host(-docker) (apps/env/preview/deploy/approval)
        │   ├─ users/authentication/authorization/api-keys/notification*/file/scheduler/mail/i18n
        │   └─ LỚP STUDIO TỰ VIẾT: git hosting · PR/checks/preview/version · project manager ·
        │        inbox/follow-ups/dashboard · project memory · testing · roles · CLI ds-studio
        ▼
  Runtimes: nocobase-runner @ VPS (shared)  ·  nocobase-runner @ WSL (personal)
        │  claim/heartbeat (agent-protocol v12)   worktree riêng mỗi run
        ▼
  GitHub (GitHub App): repo duongsinh-nocobase · nocobase (fork) · app v3 sau này
        │  PR · checks (GitHub Actions) · webhooks (hoặc polling 1 phút)
        ▼
  Preview/Test: app-host in-process (app v3) · với repo v2: docker compose NocoBase 2 trên VPS (ngoài Studio, ghi link)
  Production: Dokploy (như hiện nay) — Studio chỉ ghi nhận version (tag)
```

## 4. Phạm vi theo giai đoạn

| Giai đoạn                  | Mục tiêu                                                                                                                                                          | Kết quả chấp nhận                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S0** Chuẩn bị            | Môi trường WSL + Node 24 + pnpm 11; tạo app; tham chiếu `upstream/v3-develop`; UI library                                                                         | `pnpm dev` chạy, đăng nhập admin, trang Home                                                                                                                 |
| **S1** Lõi dự án & issue   | Projects/issues/comments/plans/labels/members; vai trò owner/admin/member; inbox cơ bản; My issues                                                                | Tạo project "Dương Sinh NocoBase", issue `DS-1`, board, comment, mời thành viên                                                                              |
| **S2** Đội agent           | Agents plugin; runner VPS + WSL; agents tự phát hiện; skills; variables; usage/prices; **project manager v1**; subject `issue`; comment đánh thức agent           | Issue `DS-2` "Thêm trường X vào `dsc_hoc_vien`" được lead agent giao cho Codex, chạy trên runner, kết quả về comment, trạng thái Blocked/In review đúng luật |
| **S3** Git & chất lượng    | GitHub App; repo ↔ project; nhánh `agent/DS-2`; PR ↔ issue; checks từ GitHub Actions; branch rules; review chéo; Merge từ Studio; `done` tự động; delivery report | Vòng đời 8 bước chạy trọn trên `duongsinh-nocobase` với PR thật                                                                                              |
| **S4** Sessions & tri thức | My sessions (ACP bridge), Runner Agent chat, "Ask agent" trên issue, tạo issue từ session; KB system/project + mount vào run; project memory viewer               | Hỏi agent "tình trạng DS-2?", KB chứa `docs/plans/*.md` của Dương Sinh, memory từ `.nb-studio/memory` hiển thị                                               |
| **S5** Phát hành           | Releases: môi trường preview (in-process cho app v3), staging Docker; artifact; version line `v*`; approval; rollback; deployment marks                           | Tag `v1.0.0` của app v3 mẫu được nhận, issue được đánh dấu "in test"; với repo v2: ghi nhận version thủ công + link Dokploy                                  |
| **S6** Hoàn thiện          | Dashboard, follow-ups, inbox hợp nhất (To decide), web push, testing menu, giới hạn chi phí, i18n vi-VN, tài liệu vận hành, sao lưu                               | Dashboard đủ 9 chỉ số; weekly report; backup/restore thử                                                                                                     |

Ước lượng (một người + agent, không tính chờ duyệt): S0 2–3 ngày · S1 4–5 ngày · S2 7–10 ngày · S3 7–10 ngày · S4 4–6 ngày · S5 6–8 ngày · S6 5–7 ngày.

## 4b. Lớp Studio phải tự viết — bản đồ 186 route theo giai đoạn (từ OpenAPI demo, phụ lục A)

| Nhóm route (số thao tác)                                                                                                                                                                                                                      | Chức năng                                                                                                                                                                                                                                           | Giai đoạn                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `access/*` (12), `organizationKeys/*` (11)                                                                                                                                                                                                    | Roles tuỳ biến 3 phần (pages/settings/abilities), catalog, members ↔ roles, default role; org API keys (scope, rotate, events)                                                                                                                      | S1 (roles), S3 (org keys cho CI)                  |
| `projectManager` (3), `projectSetups` (2), `projects/{id}/codeLocations` (1), `projectDefaultSkills` (2)                                                                                                                                      | Cấu hình lead agent; tạo project kèm repo + issue "Initialize project"; thêm repo; skill mặc định                                                                                                                                                   | S2, S3                                            |
| `agentBoard/*` (4), `issueRuns/*` (3), `issueProgress`, `issuePanels`, `issueCommentRuns/*` (2), `issueOwnerHandoffs/*` (3), `failedRuns/*` (3), `issues/{id}/sendBack`, `intakeDrafts`, `delegations/*` (3), `taskGroups/*` (5), `attention` | Agent queue, run của issue + transcript, Now/Next/Needs you, panel snapshot, giới hạn 20 run, handoff owner, thẻ run fail, Send back, bảng nhóm, badge                                                                                              | S2, S6                                            |
| `git/*` (25), `webhooks/*` (2)                                                                                                                                                                                                                | Connections (token/App/manifest/device flow/personal), resources (branch rules, checks source, webhook/poll), repository cards, PRs (link/merge/markMerged/refresh/checks/suggestion), commit checks, `git/checks` (agent self-check report), marks | S3 (token, PR, checks, merge), S5 (App, webhooks) |
| `repositoryDeployments/*` (12), `builds/*` (5)                                                                                                                                                                                                | Repo ↔ apps (staging/production), CI setup + key rotate, generate CI workflow, builds report/upload/deploy, ensure app                                                                                                                              | S3 (self-check + CI key), S5                      |
| `previews/*` (7)                                                                                                                                                                                                                              | Preview mỗi PR: status, logs, retry, down, preference, variables                                                                                                                                                                                    | S5                                                |
| `deploys/*` (23)                                                                                                                                                                                                                              | Release lines, versions, tags, artifacts, deployments, production marks, pipelines, unreleased/pending tasks, deployment marks, reopen suggestions, hub counts                                                                                      | S5                                                |
| `inbox/*` (6), `followUps/*` (7)                                                                                                                                                                                                              | Inbox hợp nhất (decision/info, waiting, reconcile), follow-ups                                                                                                                                                                                      | S1 (inbox cơ bản), S6                             |
| `reports/*` (6)                                                                                                                                                                                                                               | Dashboard: delivery, agents, metrics, attention, projects, usage                                                                                                                                                                                    | S6                                                |
| `kb/*` (10), `knowledgeDirectory/*` (2), `projectMemory/*` (3), `agentSessions/sessions/{id}/context` (1)                                                                                                                                     | KB cho agent (tree/docs/search/offers), thư mục không gian, project memory từ repo, project của session                                                                                                                                             | S4                                                |
| `releaseDownloads/{token}` (1)                                                                                                                                                                                                                | Link tải artifact                                                                                                                                                                                                                                   | S5                                                |

## 5. Chi tiết từng giai đoạn

### S0 — Chuẩn bị môi trường (checklist sau khi duyệt, **không** chạy trước)

1. WSL Ubuntu: `node 24` (fnm/nvm), `pnpm 11` (`corepack enable && corepack prepare pnpm@11 --activate`), `git`, `gh`, Chromium (`playwright install chromium` hoặc `apt`). Máy hiện có Node 25.2.1 trên Windows và **chưa có pnpm**; Docker chưa cài (chỉ cần cho S5 staging; dùng Docker trên VPS).
2. Tạo app theo skill `nocobase-create-app` (lấy từ `skills/nocobase-create-app/SKILL.md` trên `upstream/v3-develop`):
   `(cd /mnt/d/code && PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm create @nocobase/app@beta duongsinh-studio --template-tag=beta --json)`
   → `pnpm nocobase config init --dialect sqlite --json` → `config check` → `pnpm dev`. Lưu ý WSL: đặt repo trong hệ thống file Linux (`~/code/duongsinh-studio`) để tránh chậm I/O `/mnt/d`; mirror sang `D:\code` bằng git.
3. `git init`, remote GitHub private `covuaduongsinh/duongsinh-studio`. Commit đầu.
4. Thêm plugin: `pnpm add @nocobase/app-plugin-projects@beta @nocobase/app-plugin-agents@beta @nocobase/app-plugin-agent-sessions@beta @nocobase/app-plugin-knowledge@beta @nocobase/app-plugin-releases@beta @nocobase/app-host@beta @nocobase/acp-bridge@beta @nocobase/agent-protocol@beta @nocobase/app-cli-client@beta` rồi `pnpm nocobase plugin register --dir node_modules/@nocobase/app-plugin-<x>` (ghi vào `server/plugins.ts`, `client/plugins.ts`, `cli/plugins.ts`). Nếu gói chưa publish lên npm công khai → dùng `NOCOBASE_REGISTRY` hoặc `pnpm pack` từ checkout `v3-develop` (worktree `git worktree add ../nocobase-v3 upstream/v3-develop` + `pnpm install && pnpm build`).
5. Sao chép skill tham chiếu vào `.agents/skills/` của app (template tự sync `@nocobase/app-skills`); đọc `README.md` + `skills/*/SKILL.md` của từng plugin trước khi lắp.
6. Cổng dev 13100 (tránh 13000/13001 của NocoBase 2 dev); `client.app.title: "Dương Sinh Studio"`; `i18n.defaultLocale: vi-VN`.

### S1 — Lõi dự án & issue

- Server: bind `projectsAccessToken` (`permissionsOf`, `admit` → vai trò mặc định, `administrators`, `permissionsOfUser`), chuyển seed `pm-*` thành Permission Sets của app (`database/main/seeds/…roles`), 3 vai trò built-in **`owner` / `admin` / `contributor`** đúng như demo (đặc tả demo §2: `pages` enum 11 trang, `settings` bật/tắt, `abilities` none/related/all; `access/settings.defaultRole = contributor`), route `access/catalog|roles|members|settings|me` để trang Roles **sinh từ catalog** của các plugin.
- Client: route `/projects`, `/projects/:projectId` (UI library `project-detail`), `/issues` (`issue-table` + `kanban`), `/issues/:issueId` (`issue-detail` + `comment-thread`), `/my-issues` (Waiting for you / Needs your acceptance / Following), `/inbox` (notification-in-app + nhóm To decide), `/config` (General, Members, Roles, Labels). Phím tắt `C` tạo issue.
- Issue prefix `DS`. Nhãn mặc định: `v2`, `plugin`, `docs`, `bug`, `no-preview`.
- Thông báo: `projectsNoticesToken` → kênh inbox; email qua SMTP (đã có tài khoản gửi? xem mục 9).
- Kiểm chứng: test API (`tests/`) tạo project/issue/comment, kiểm tra quyền member chỉ thấy issue liên quan; e2e Playwright tạo issue từ UI.

### S2 — Đội agent & project manager

- Đăng ký `agents` + `scopes` `project`, `repository`; `people.provide` từ users; `gate.set` theo Permission Sets.
- **Subject `issue`** (`agentsToken.subjects.register`): `context.assemble` lấy issue (mô tả, acceptance, comment gần nhất, sub-issue, blocker, repo & nhánh) qua `projects.issueContext`; `sink.onRunFinished` ghi comment kết quả (`projects.comments.post` với `message {type:'ds.run.finished'}`), chuyển trạng thái qua kind `agent` nếu được phép; `reports.describe` cho trang Runs.
- **Executor kind `agent`** (`projectsKindsToken.add`): `IssueWorkHandler` — khi issue vào `in_progress`, có comment mention/trả lời agent, PR checks đổi → `runs.enqueue` cho **project manager**; `moves` chỉ `in_progress ⇄ blocked ⇄ in_review`, `mayMove` yêu cầu `needsYou` khi vào blocked/in_review; `onBlocked` → `runs.withdrawQueued`.
- **Project manager v1** (`agents.ensureSystem({id:'ds-project-manager'})`, mô hình demo §3): **chính nó là một run trên runner** dùng tool+model của agent "first choice". Route `GET/PATCH projectManager` với các trường `name, description, firstChoiceAgentId, fallbackAgentId, fallbackAfterSeconds (120), delegationQueueTimeoutSeconds (600), commentRunLimit (20), principles | builtInPrinciples, choices`. Viết `builtInPrinciples` tiếng Việt theo cấu trúc demo: _Ai làm gì_ (chọn theo "Good at", review không yếu hơn tác giả và ưu tiên khác nhà cung cấp, chỉ agent `canStartNow`, fail 2 lần → đổi agent), _Khi nào cần approach_ (dữ liệu/migration/quyền/concurrency/issue không nói cách làm), _Luồng_ (một bước đổi code; chuyển bước chỉ khi run kết thúc; không reassign trước queue timeout; sẵn sàng nghiệm thu khi review + checks pass → `in_review` + `needsYou` + delivery report; `runnerDiskFull`/`toolQuota` không tính fail; check fail → đọc log; mọi quyết định của người → `blocked`). Hand-over là comment mention agent dạng `[@tool · model](mention://agent/<id>)` + "Mode: read-only" khi cần; Studio gửi input "step-ended" khi run của agent kết thúc.
- **Chỉ dẫn mặc định cho agent thực thi** (`agents.setDefaults`, demo §3): một comment trả lời mỗi bước trong thread hand-over; tự commit/push (`git push origin HEAD:refs/heads/<branch>`), không rewrite history; PR theo template bằng `--body-file`; ảnh chụp qua `ds-studio issue comment add --attach`; read-only mode; không đổi trạng thái/giao việc; hỏi một câu rồi kết thúc lượt; viết theo ngôn ngữ của issue (tiếng Việt).
- **Business actions của agent** (gate): `pm.projects/view|create|manage`, `pm.issues/view|create|edit|comment|close|change-owner|delete`, `pm.attachments/upload`, `rel.apps/view|read-logs|deploy`, `kb.knowledge/read|offer`, `studio.git/open-pr`, `studio.previews/manage`, `studio.reports/read` (đúng tập demo).
- Skills nội bộ (viết mới bằng tiếng Việt + Anh, **cùng cấu trúc 5 skill demo**, đặc tả demo §4): `ds-workflow` (Ai làm gì / Approach trước hay không / Các bước / Sẵn sàng bàn giao), `ds-development` (Làm một bước / Thiết kế / Chi phí hot path / Kiểm chứng / CI fail / Review / Bàn giao), `ds-approach` (Recommendation · Changes · Cost · Needs confirmation · Left out), `ds-review` (4 mức Must fix / Should fix / Note / Pre-existing; verdict "can merge / cannot merge"), `ds-comment-style` (kết luận trước, ≤5 bullet, 1 câu hỏi, Details ≤3 link), cộng **skill riêng cho repo v2** (`ds-nocobase-v2`: cách chạy `nocobase-v1 dev`, Node 22, script `setup/*.mjs`, `verify.mjs`, bẫy Windows/SQLite — rút từ `docs/plans/2026-10-30-ban-giao-phien-tiep-theo.md`). 4 skill đầu đính kèm mặc định cho project mới (`projectDefaultSkills`), `ds-comment-style` ở scope global.
- Trang issue: tính `issueProgress` (`state: working|queued|checksPending|needsDecision|waitingForContinuation|inReview|notStarted|finished|idle`, `agent`, `step`, `since`, `runner`, `pullRequest`, `needsYou`, `next`, `explanationCommentId`) để hiển thị **Now / Next / Needs you**; `issueRuns` + `events` cho tab Runs (status `queued|dispatched|running|completed|failed|cancelled`, `trigger`, `attempt`, `summary`); `agentBoard` cho Agent queue (`state waiting|working|queued|idle`, lý do chờ); `issueCommentRuns/continue`; `failedRuns/{id}/decide|dispatch`; `issues/{id}/sendBack`.
- Runner: VPS — tạo user `studio-runner`, cài `nocobase-runner` bằng install script từ Studio (`/api/agents/dist/installScript`), `service install`, đăng nhập Claude Code/Codex bằng tài khoản thuê bao; WSL — personal runner. `nocobase-runner env set` cho biến (NB_URL dev...). Policy.json giới hạn repo.
- Usage/prices: seed giá mặc định; bật "Subscription (not billed)" cho Claude Code.
- Kiểm chứng: issue mẫu → run có transcript, usage; stop/retry; comment limit; agent offline → requeue; test đơn vị cho handler (rehearsal `Tx.rehearsal`).

### S3 — Git hosting, PR, checks, review, merge

- Bảng mới (migration `database/main/migrations/2026xxxx_ds_git_*.ts`): `dsGitConnections` (provider, appId, privateKey sealed qua secrets, installationId, webhookSecret, apiBaseUrl, allowPersonalTokens), `dsGitAuthorizations` (user ↔ token sealed), `dsRepositories` (projectId, connectionId, fullName, defaultBranch, isPrimary, branchRules JSON: branchPrefix `agent/`, requiredChecks[], referenceChecks[], wakeOnFailed/Passed/Conflict), `dsPullRequests` (issueId, repoId, number, head, base, state, checks JSON, reviewState, mergeMethod, mergedAt, mergedBy), `dsCheckRuns`, `dsGitMarks` (issue ↔ commit/env), `dsCiKeys` (org API key do hệ thống quản lý, 90 ngày, nhắc 14/3/0).
- Git connection **`kind: token`** trước (PAT fine-grained của tổ chức, `hasToken`, `personalMethods: [token]`, `allowPersonalTokens`), polling 60 s bằng `scheduler` (`pollSeconds`, `polledAt`, `pollError`); GitHub App theo luồng **manifest** (`git/connections/startAppManifest` → `appId`/`pem` sealed, `installationId`, `missingPermissions`, `permissionsUrl`) + webhook `pull_request`, `check_run`, `check_suite`, `push` (tag) ở `/api/webhooks/{provider}/connections/{id}` và `/repositories/{id}` (HMAC, `repairWebhook`) chuyển sang S5. Dùng `@octokit/rest` (+ `@octokit/auth-app` ở S5). Trả về đúng hình `StudioGitConnection` / `StudioGitPullRequest` (`mergeability clean|conflicts|blocked|unknown`, `ciState`, `checks[]`, `mergeBlocker merged|closed|draft|conflicts|computing|ciPending|ciFailed|ciMissing|notConfigured|protected`, `mergeInStudio`, `checksSource host|external|agent`), `git/marks` cho danh sách issue, `repositoryCards` cho trang project.
- `repoAccess.register`: cấp installation token ngắn hạn (hoặc token cá nhân nếu liên kết), commit author "Tên người <email>" + trailer `Co-Authored-By`, `gitTools: gh`.
- Status event `ds.pr.merged` (`from: [in_progress, in_review] → done`), `ds.pr.closed`; `projects.statusEvents.fire` từ webhook. Merge từ Studio (`POST /api/git/pullRequests/:id/merge`, squash, kiểm tra conflicts/draft/checks; "Merge anyway" cần lý do + ghi activity + comment lên PR).
- Checks: cấu hình per repo (`checksSource: agent | host | external`); CI key = org API key do hệ thống tạo (`repositoryDeployments/{id}/ci/setup|rotate`, `secretName DS_STUDIO_API_KEY`, 90 ngày); **sinh file workflow** như demo (`…/ciWorkflow`, đặc tả demo §6): trigger `pull_request [opened, synchronize, reopened]`, bỏ qua nhãn `no-preview`, `concurrency` theo số PR, cài CLI bằng `curl -H x-api-key $URL/api/agents/dist/products/ds-studio/targets/linux-x64?format=env` + `ds-studio login --api-key-stdin`, `ds-studio build status --state building|failed --logs`, `pnpm build --target linux-x64 --tar`, `ds-studio app ensure`, `ds-studio deploy --file storage/exports/dist.tar.gz`. Cho repo v2 `duongsinh-nocobase`: thay bước build/deploy bằng job `node setup/verify.mjs` chạy lên **dịch vụ NocoBase 2 (`nocobase/nocobase:2.2.36` + Postgres) trong workflow** rồi `ds-studio check report` (`POST git/checks`), preview ngoài Studio (S5).
- Review chéo: project manager chọn agent khác nhà cung cấp; run read-only; findings graded; blocker → quay lại dev.
- Delivery report → `acceptance`; In review → My issues "Needs your acceptance"; Send back → in_progress.
- Kiểm chứng: e2e trên repo thử `duongsinh-studio-sandbox`; sau đó trên `duongsinh-nocobase` với issue nhỏ thật (vd. bổ sung bản dịch vi-VN).

### S4 — Sessions & tri thức

- `agent-sessions` + `acp-bridge`: `ds-studio acp service install` trên Windows; link kinds `issue`, `project` (`registerLinkKind`), `registerProjects`, instructions "tạo issue qua plan"; nút **Ask agent** trên issue/project (`conversations.sources.register`, `contextKinds` issue/project); plan card trong session (đã có ở `projects/plans`).
- Runner Agent chat: Online agent với binding runner (`agents/conversations` + `switchRunner`), `conversations.rules.provide` thêm luật Dương Sinh.
- Knowledge: resolver spaces `system` + `project:<id>`; indexer pgvector (production) / sqlite-vec (dev); nạp `docs/plans/*.md`, hồ sơ năng lực, quy trình CLB; `mounts.register('knowledge')` đặt snapshot `INDEX.md` cạnh thư mục làm việc; card "lưu file từ issue vào KB".
- Project memory: dịch vụ đọc `.nb-studio/memory/*.md` (qua GitHub contents API ở nhánh mặc định + nhánh issue), parse frontmatter, trang `/project-memory` lọc type/project, hiển thị branch/commit; `briefs.sections.register('memory')` chèn tóm tắt memory vào mọi run.
- Kiểm chứng: hỏi KB có trích dẫn; memory mới trong PR hiển thị sau merge.

### S5 — Phát hành

- `releases` + `app-host`: môi trường `preview` (in-process, ≤20, idle 10 phút, dormant 24 h), `staging` (Docker trên VPS, protected=false), `production` **chỉ ghi nhận** (protected, approver = chủ dự án). `releases.artifact` disk private.
- Preview mỗi PR cho app v3: CI `pnpm build --tar` → upload ticket → app `<appId>-pr-<n>`; biến thiếu → chặn + liệt kê. Với repo NocoBase 2: preview = compose NocoBase 2 (ảnh `nocobase/nocobase:2.2.36`) chạy script `setup/run.mjs` trên VPS qua workflow, Studio lưu link (bảng `dsPreviews` với `external: true`).
- Version lines (`deploys/releaseLines/{id}`: `lines[{id, branch, pattern v*, stripPrefix}]`, `tags`, `publishTarget`), phát hiện tag qua webhook/polling, `deploys/versions` (taskCount, artifactCount, deploymentCount, comparisonState), `versionArtifacts`, `productionMarks` (ghi nhận lên production), `deploymentRecords`, `pipelines` (preview ready/total · test version/app · production mark/latest/newer/tasks — trang Releases), `unreleasedTasks` / `pendingVersionTasks` (tab Pending release), `hubCounts`, `marks` (deployment marks trên issue: in test / in production / withdrawn), `reopenSuggestions` sau rollback, nhắc project lead sau 3 ngày; rollback qua `releases` (approval nếu protected). Môi trường mẫu như demo: `preview` (purpose preview, maxApps 20, idle 10 phút, dormant 24 h, sample data), `staging` (test, không protected), `production` (test, protected, approvers `admins` + `lead`).
- Kiểm chứng: app v3 mẫu (template examples) đi hết preview → staging → tag → production record; rollback thử.

### S6 — Hoàn thiện

- Dashboard = 6 route `reports/*` như demo (§7): `delivery` (completed, cycleTimeP50Ms, agentShare, costPerIssue theo bucket + kỳ trước), `agents` (successRate, reworkRate, runsPerIssue, interventionRate, queueWaitP50Ms, daily by outcome), `metrics` (adoption, aiShare, trust, reliability, cost byAgent, humanLoad), `attention` (blocked, overdue, chờ nghiệm thu lâu, run fail 24 h), `projects`, `usage` (groupBy agent/trigger/subject/model/tool/day; tokens, cost, pricedRuns); bộ chọn 7/30/90 ngày; weekly report gửi inbox/email.
- Follow-ups (`followUps`, `followUps/following|issues|follow|unfollow|markSeen`): issue theo dõi + sở hữu kèm `progress`, `unread`, `seenAt`; `attention` cho badge; Inbox hợp nhất (`inbox/items` `kind decision|info`, `type deployment_requested|pendingRelease|versionPublished|approval_requested…`, `inbox/waiting`, `inbox/pending`, `inbox/reconcile`; nhóm Needs my decision / Notifications; Approve nhập lại app id).
- Web push (`notification-web-push`, khoá VAPID), email; (tuỳ chọn) kênh Zalo OA qua plugin notification provider tự viết.
- Testing menu (`/testing`): test plans, standards, discussions (đánh dấu "Planned" như thượng nguồn; chỉ làm khung).
- Giới hạn chi phí: ngân sách per project/agent (bảng `dsBudgets`, chặn enqueue khi vượt).
- i18n vi-VN toàn bộ; tài liệu vận hành `docs/` trong repo studio; sao lưu Postgres + `storage/` (Dokploy backup như hiện nay); skill `nocobase-deployment` để build `--tar` và `app-installer`/Dockerfile lên VPS.

## 6. Cấu trúc mã của lớp Studio (trong `duongsinh-studio`)

```
server/providers/
  projects-access.ts        bind projectsAccessToken (roles → permissions)
  agent-executor.ts         projectsKindsToken.add('agent') + IssueWorkHandler
  issue-subject.ts          agentsToken.subjects.register('issue')
  project-manager.ts        agents.ensureSystem + allocation principles + limits
  git/{github-app,gitlab}.ts  connections, webhooks, PR sync, repoAccess provider
  git/status-events.ts      ds.pr.merged / ds.pr.closed
  checks.ts, previews.ts, versions.ts, marks.ts
  knowledge-access.ts       KnowledgeAccessResolver + mounts
  memory.ts                 .nb-studio/memory reader + briefs section
  inbox.ts, follow-ups.ts, dashboard.ts, budgets.ts
server/routes/{git,previews,versions,deploys,inbox,followUps,dashboard,memory,testing}.ts
database/main/migrations/2026MMDD####_ds_*.ts  (tự chứa, có down)
client/routes.ts · client/pages/{home,my-issues,issues,projects,inbox,follow-ups,dashboard,project-memory,releases,config,testing}
client/locales/{vi-VN,en-US}.ts
cli/commands/…  (ds-studio: issue, pr, check report, preview publish, release upload)
skills/ds-*/SKILL.md
```

Bảng dữ liệu riêng của lớp Studio (suy từ 186 route demo; tiền tố `ds`): `dsRoles`/`dsMemberRoles`/`dsAccessSettings`, `dsOrgApiKeys` (+ events), `dsProjectManager` (settings), `dsGitConnections`, `dsGitAuthorizations`, `dsRepositories` (resource: branch rules, checks source, webhook, poll), `dsProjectRepositories` (project ↔ repo, primary, attribution), `dsPullRequests` (+ checks snapshot, suggestion), `dsCommitChecks` (agent/external reports), `dsCiKeys`, `dsRepositoryApps` (repo ↔ app role staging/production), `dsBuilds`, `dsPreviews`, `dsReleaseLines`, `dsVersions` (+ tasks, artifacts, deployments), `dsProductionMarks`, `dsDeploymentRecords`, `dsIssueProgress` (snapshot Now/Next), `dsFollowUps`, `dsInboxNotices`, `dsDelegations`, `dsFailedRunDecisions`, `dsOwnerHandoffs`, `dsKbOffers`, `dsMemoryCache` (memory đọc từ repo, theo sha).

Nguyên tắc: mỗi route `auth.required()` + kiểm tra Permission Set + `describeRoute()` (để manifest CLI tự sinh); mọi hành động "chỉ người" (accept, merge, approve, member/roles/keys) từ chối API key và run token (`identities: person`); secrets qua `secrets` service, không bao giờ trả về.

## 7. Kiểm chứng đầu-cuối

1. **Kịch bản chuẩn (giống "PUR‑23" trong docs):** issue `DS-10` "Thêm trường `ngay_cap_the_sao` vào `dsc_hoc_vien`, hiện ở trang chi tiết" → lead agent giao design (Claude) → dev (Codex, runner VPS) → PR `agent/DS-10` trên `duongsinh-nocobase` → checks (`verify.mjs` trên NocoBase 2 dev trong CI) → review chéo (Claude) → delivery report + ảnh → chủ dự án Merge trong Studio → Done → memory ghi vào `.nb-studio/memory/`.
2. **Sự cố:** runner offline giữa chừng (requeue), 3 commit fail liên tiếp (ngừng đánh thức), hết quota (chuyển agent), comment quá 20 run/24 h (pause), Merge anyway (ghi log).
3. **Bảo mật:** member không thấy issue project khác; API key scope CI không deploy được protected env; secrets không lộ trong transcript (redaction).
4. **Tự động:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` xanh; Playwright cho luồng issue → merge (mock GitHub bằng `nock`/`msw`).

## 8. Rủi ro & giảm thiểu

| Rủi ro                                                                               | Giảm thiểu                                                                                                                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| NocoBase 3 đang **beta, thay đổi nhanh** (protocol v12, migration đổi hàng tuần)     | Ghim phiên bản `@beta` cụ thể trong `package.json`; nâng cấp theo skill `nocobase-app-upgrade`; đọc CHANGELOG plugin trước mỗi lần nâng |
| Gói plugin có thể **chưa publish** hoặc publish không đầy đủ lên npm                 | Dự phòng: build từ `upstream/v3-develop` (`pnpm pack`), hoặc `NOCOBASE_REGISTRY`                                                        |
| **Giấy phép** v3 chưa rõ (chỉ `agent-runner` Apache‑2.0; package khác chưa khai báo) | Dùng nội bộ; không phân phối ra ngoài trước khi NocoBase công bố; theo dõi file LICENSE trên `v3-develop`                               |
| Windows: runner yêu cầu WSL; I/O `/mnt/d` chậm                                       | Repo trong `~` của WSL; runner shared đặt trên VPS                                                                                      |
| Chi phí model & quota thuê bao                                                       | Bật "Subscription (not billed)"; ngân sách S6; review chéo chọn model rẻ                                                                |
| Agent có toàn quyền trong user runner (SSH key, token)                               | User hệ thống riêng, không root, policy.json giới hạn repo, biến "shared runtimes only"                                                 |
| Repo NocoBase 2 không chạy được trong `app-host` preview                             | Preview ngoài Studio bằng docker compose + link; checks bằng `verify.mjs`                                                               |
| Khối lượng lớn (≈6–8 tuần)                                                           | Dừng được ở MVP S3 đã có giá trị; mỗi giai đoạn tự đứng                                                                                 |

## 9. Quyết định cần chủ dự án chốt (hỏi ở đầu phiên triển khai)

1. **Tự dựng (kế hoạch này) hay mua Professional (8.000 USD, có Studio + SSO + approval nâng cao, 1 năm hỗ trợ)?** Khuyến nghị: tự dựng vì ưu tiên mã mở đã chốt, và Studio thương mại không chạy repo NocoBase 2 "native" hơn bản tự dựng.
2. **Git hosting:** GitHub private (khuyến nghị) hay GitLab/Gitea tự host? Cần tạo remote cho `duongsinh-nocobase`.
3. **Runner shared đặt ở đâu:** VPS hiện tại 217.15.160.118 (khuyến nghị, thêm RAM nếu cần) hay máy riêng?
4. **Tài khoản coding tool cho runner:** dùng gói Claude Max/ChatGPT hiện có của chủ dự án (đăng nhập trên VPS, rủi ro điều khoản) hay API key trả theo lượng?
5. **Email gửi thông báo/mời thành viên:** SMTP nào? (hiện NocoBase 2 có cấu hình mail chưa?)
6. **Thứ tự:** S1→S2→S3 trước (khuyến nghị), hay ưu tiên S4 (sessions) vì chủ dự án làm việc qua chat là chính?

**Đã chốt 01/11/2026 (chủ dự án):** (1) tự dựng · (2) GitHub private, PAT fine-grained + polling trước, GitHub App ở S5 ·
(3) shared runner trên VPS 217.15.160.118, user `studio-runner` · (4) gói thuê bao hiện có (Claude Max/ChatGPT), bật
"Subscription (not billed)", dựng sẵn công tắc sang API key · (5) hoãn SMTP, S1–S3 chỉ inbox trong app, SMTP ở S6 ·
(6) S1→S2→S3 trước. Bổ sung sau S1: vai trò mặc định cho thành viên mới = `contributor` như demo (seed
`202611010004_ds_default_role`, admin đổi được qua `PUT /api/access/settings`). Mọi bước tạo repo GitHub / đụng VPS / đăng nhập coding tool vẫn hỏi lại trước khi làm.

## 10. Tiến độ

- [x] 01/11/2026 — Giải mã Studio, viết đặc tả + kế hoạch + prompt (phiên sáng). Đã fetch `upstream/v3-develop` (commit `04922adec1`) vào `D:\code\nocobase`.
- [x] 01/11/2026 (chiều) — Giải mã demo quốc tế https://studio.demo.nocobase.com/ qua đăng nhập demo: OpenAPI 653 thao tác (186 Studio), manifest 389 lệnh CLI, lead agent + 11 skill, roles, CI template, 14 ảnh màn hình → `…-dac-ta-demo-api.md`, phụ lục `…-phu-luc-api-cli.md`; kế hoạch cập nhật (A6, A10, 4b, S1–S6).
- [x] 01/11/2026 — **S0 Chuẩn bị môi trường.** Repo `covuaduongsinh/duongsinh-studio` (private), làm việc ở
      `~/code/duongsinh-studio` (WSL), mirror `D:\code\duongsinh-studio`; commit `83a8dd2` (template 1.0.0-beta.86) +
      `1987663` (lắp plugin). Bật agents 2.0.0-beta.1, agent-sessions 1.0.0-beta.15, knowledge 0.1.0-beta.16, releases
      0.1.0-beta.16; projects 0.1.0-beta.23 **cài nhưng disabled** tới S1 (cần bind `projectsAccessToken`). CLI riêng `ds-studio`
      (`envPrefix DS_STUDIO`). Kiểm chứng: `pnpm lint/typecheck/test/build` xanh (86 file, 531 test); dev
      `http://127.0.0.1:13100/main/` đăng nhập admin, Home và My agents hiển thị không lỗi console. Chênh lệch so với README:
      `docs/chenh-lech-upstream.md` của repo studio (Rollup native SIGILL trên CPU không AVX → `@rollup/wasm-node`; releases
      không có config factory; agent-sessions client bắt buộc `{ cli }`). Còn mở: locale vi-VN + `i18n.defaultLocale`,
      đổi logo/nhận diện, đổi mật khẩu admin mặc định.
- [x] 01/11/2026 — **S1 Lõi dự án & issue (phần cốt lõi).** Commit `7a4a7fa` (bind `projectsAccessToken` từ permission
      sets: owner = `root`, `ds-admin`, `ds-contributor`; không tự gán vai trò cho người mới), `f122ddb` (seed prefix `DS` +
      nhãn `v2/plugin/docs/bug/no-preview`), `d8c537b` (kênh `inbox` in-app thành mặc định trong code: trước đó notice chỉ chạy
      khi `config.yml` có khai báo), `38f2d90` (trang `/issues` list + board kéo thả, `/issues/:id`, `/my-issues`,
      `/projects/:id`, settings Users/Roles + prefix + nhãn). Kiểm chứng: lint/typecheck/build xanh, test 88 file / 542 test
      (2 test template `foundation-integration` sửa theo trạng thái đã đăng ký settings); test server
      `projects-access.test.ts` (401 ẩn danh, contributor `related`, project `members` chặn người ngoài, member không tạo được
      issue, giao issue → inbox); trình duyệt: board kéo PM-1 sang In progress (server lưu `in_progress`), trang issue, không
      lỗi console; API với tài khoản thử contributor/member.
- [x] 01/11/2026 — **S1 hoàn tất phần còn mở.** `f0eeb53`: 11 route `/api/access/*` theo hợp đồng demo (catalog, me,
      roles CRUD, members, settings) trên chính permission sets (`<key>` = set `ds-<key>`, owner = `root`); chỉ người
      thật; `defaultRole` mặc định null, `admit` gán một lần khi admin đã đặt; migration `dsAccessSettings` có down (đã
      test up/down/up). `b1b378d`: test mời qua link không cần email; phát hiện lời mời project **không mang vai trò**,
      nên khi `defaultRole` = null người được mời vào project nhưng không đọc được issue. `9a83caf`: e2e Playwright (đăng
      nhập → tạo issue → bình luận → board) pass trên Chromium thật. Kiểm chứng cuối: lint/typecheck/build xanh, 91 file
      / 545 test. Còn lại cho S6: giao diện vi-VN (plugin projects đã có sẵn bản dịch vi-VN).
- [x] 01/11/2026 — **S2 khép lại.** `a24af66` (bind `projectsRequestActorToken`: run token hành động dưới danh agent,
      bình luận là của agent, đổi trạng thái theo `moves` của kind `agent`, test bằng run token thật; nguyên tắc + chỉ dẫn ép
      tiếng Việt), `59739b4` (lead agent không làm hỏng boot khi app chưa migrate, bắt được nhờ bộ test đầy đủ), `8b6e19f`
      (`nodeOptions: --max-old-space-size=4096` vì `vite build` hết heap 2 GB). Kiểm chứng cuối: lint/typecheck xanh, 95 file /
      549 test, build xanh. Repo cho S3 đã tạo: `covuaduongsinh/duongsinh-nocobase` (private, push `main`, đã quét bí mật
      50 commit) và `covuaduongsinh/duongsinh-studio-sandbox` (private, CI `npm test` xanh).
- [x] 01/11/2026 — **S2 Đội agent & project manager (phần lõi chạy được trên máy dev).** `8d7f6bf` (bind
      `agentsAccessToken`, catalog vai trò gồm agents, seed thêm quyền agents cho Admin/Contributor), `68d7e5c` (trang
      Agents/Runtimes/Skills/Usage/Models), `38b1f1a` (runner cá nhân WSL `may-dev-duongsinh` từ tarball app tự build;
      Claude Code 2.1.316 + Codex 0.166.0, chủ dự án tự đăng nhập; bật agent Claude Opus 5.5 + Sonnet 5.5), `6812838`
      (subject `issue`, executor kind `agent`, `ds-project-manager` + nguyên tắc tiếng Việt, chỉ dẫn mặc định), `2dfe1e0`
      (`actions.provide` + `gate.set` + bước authorization thu hẹp quyền run token; `GET/PATCH /api/projectManager`, bảng
      `dsProjectManager`). Kiểm chứng sống: PM-7 (giao thẳng Sonnet) chạy trọn nhưng agent không tự bình luận được → sửa gate;
      PM-8 qua lead agent: Opus giao việc bằng mention `Mode: read-only` → Sonnet chạy và tự bình luận → Opus chuyển
      `in_review` + needsYou; run bị ngắt khi server dừng được giao lại sau khi kết nối lại. Còn mở: bình luận/đổi trạng thái
      của agent đang mang danh người giao (`projectsRequestActorToken` chưa bind); bản tóm tắt cuối run của lead agent bằng
      tiếng Anh (cần ép tiếng Việt trong nguyên tắc); chưa có `repoAccess` (thuộc S3), `scopes.register('project')`, input
      "step-ended"; chưa bật Codex nên chưa có review chéo khác nhà cung cấp; runner chưa là service tự khởi động; máy dev
      12 GB RAM bị hết bộ nhớ khi chạy dev + runner + test song song.
- [x] 02/11/2026 — **S3 Git, PR, checks, review, merge (MVP).** Commit: `fc7d805` (server: kết nối GitHub bằng PAT niêm
      phong bằng secrets, repo ↔ project, `repoAccess` cấp clone/nhánh `agent/<ID>`/credential cho run, poll PR + checks,
      merge squash có `mergeBlocker` và "Merge anyway" cần lý do, `ds.pr.merged` → done + comment tiếng Việt), `9a9ac00` (UI:
      panel Pull request trên trang issue, Settings → Git, mục Code của project), `d4a4288` (`ds-studio pr open` để agent mở
      PR qua Studio, action `studio.git/open-pr` mặc định), `b2325cd` (PR vẫn được lưu khi không đọc được checks), `fe15a88`
      (PAT fine-grained **không có quyền Checks** → đọc CI từ `actions/runs`). Repo `covuaduongsinh/duongsinh-nocobase` và
      `duongsinh-studio-sandbox` (private). **Ca thật trọn 8 bước trên sandbox (PM-9):** lead agent Opus giao → Sonnet code +
      test, push `agent/PM-9` → `ds-studio pr open` mở PR #1 → CI `ci` xanh (đọc qua Actions) → Opus review read-only,
      approve (kèm kiểm chứng đột biến) → lead agent chuyển `in_review` + báo cáo bàn giao → chủ dự án bấm Merge trong
      Studio → GitHub MERGED (squash `7be8b82`) → PM-9 tự `done` + comment `ds.pr.merged`. Kiểm chứng cuối: lint, typecheck,
      build xanh; test 553/562 ở lần chạy đầy đủ, 9 test còn lại là timeout 30 s do máy quá tải (5 file), chạy lại riêng thì 5
      file đó pass 44/44 — tổng 100 file / 562 test qua. Còn mở: chạy thật trên
      `duongsinh-nocobase` (cần CI dựng NocoBase 2 + `verify.mjs`); GitHub App + webhook + credential ngắn hạn (S5); project
      memory (S4); poll trên jobs memory (cần Redis khi nhiều tiến trình); máy dev 12 GB khiến dev server bị Claude Code tắt
      nhiều lần, nên chủ dự án tự chạy `pnpm dev` trong terminal riêng.
- [x] 02/11/2026 — **S4 Sessions & tri thức** (3 phần dưới đây). Phần 1 xong 02/11/2026: **project memory** (commit `e569e78`): Studio đọc
      `.nb-studio/memory/*.md` (định dạng của repo NocoBase: `name`, `description`, `type` feedback/project/reference,
      `modified`) ở nhánh mặc định qua token của kết nối, cache theo commit đầu nhánh (hỏi lại tối đa 60 s, file theo blob
      sha); `GET /api/projectMemory`, `…/{projectId}/repos/{repoId}`, `…/file` + lệnh `ds-studio memory list|get|read`, quyền
      theo project; mục "Ghi nhớ của dự án" trong brief của mọi run trên issue (`briefs.sections`, gọi GitHub trong
      `prepare`); chỉ dẫn agent + nguyên tắc PM: ghi memory trong cùng PR; trang `/project-memory` (chọn project/repo, tab
      theo loại có đếm, tìm, drawer toàn văn). Kiểm chứng: lint, typecheck, build xanh; test 569/573 ở lần chạy đầy đủ, 4 test
      còn lại là timeout 30 s của `app-server.test.ts` khi máy tải nặng, chạy riêng 28/28 pass; kiểm tra sống trên dev:
      Sandbox → `covuaduongsinh/duongsinh-studio-sandbox` `main@7be8b82`, 0 memory, không lỗi, trang `/project-memory` 200.
      Chênh lệch ghi ở `docs/chenh-lech-upstream.md` mục 15. Còn mở: đọc nhánh của issue (memory trong PR chưa merge), locale
      vi-VN.
      Phần 2 xong 02/11/2026: **Knowledge** (commit `0c9e711`): bind `knowledgeAccessToken`
      với không gian `system` + `project:<id>` (project kế thừa system); quyền từ permission set `kb.knowledge/*` — `related`
      = đọc/đề xuất ở system và project mình thấy, sửa/quản lý project mình quản lý, sửa system cần `all`; agent lấy mức thấp
      hơn giữa người và cấu hình, tối đa `propose`; `kb.knowledge/read` thành quyền mặc định của agent; seed
      `202611040001_ds_roles_knowledge`. Route `/api/kb/search|docs/{doc}|tree` (người + run, thay lệnh `kb search/read` của
      plugin trên CLI) và `/api/knowledgeDirectory(+/search)`; trang `/knowledge` (`KnowledgeView` + thư mục có lọc quyền);
      run nhận mount `knowledge/` (snapshot, `INDEX.md`) + mục brief "Tri thức". `scripts/kb-import.mjs` nạp thư mục Markdown
      idempotent; đã nạp 4 tài liệu `2026-11-01-nocobase-studio-*.md` vào không gian system của dev (bỏ qua bàn giao
      2026-10-30 vì có số tài khoản ngân hàng, MST, SĐT). Tìm kiếm ngữ nghĩa tắt (chỉ từ khoá) — cần chủ dự án quyết embedding.
      Kiểm chứng: lint, typecheck, build xanh; test 580/582 lần chạy đầy đủ, 2 test còn lại (timeout của
      `account-permissions.test.tsx`) chạy riêng 5/5; sống trên dev: `kb search` có trích dòng, directory đúng quyền, vai trò
      có quyền kb, hai agent có `kb.knowledge/read`. Chênh lệch: `docs/chenh-lech-upstream.md` mục 16. Còn mở: agent đề xuất
      tri thức qua CLI (`kb offers`), subject provider cho quyền từng tài liệu, tab Knowledge trong trang project; tiếp theo
      Sessions/Ask agent.
      Phần 3 xong 02/11/2026: **Sessions & Ask agent** (commit `ba4bb24`): cài khối UI Library `agent-chat` + `plan-card`
      (khôi phục các gói lõi mà `shadcn add` hạ cấp); panel chat trong shell (⌘J, nút nổi), trang `/chat/:id`,
      `chatLinkRoutes`; nút **Ask agent** trên trang issue và project (ghim bản ghi làm ngữ cảnh, câu hỏi nháp). Server
      (`server/conversations/`, `ConversationsProvider`): nguồn `askAgent`, resolver ngữ cảnh `issue`/`project` theo quyền
      người hỏi, luật cho run hội thoại (tiếng Việt, không đụng production NocoBase 2, không bí mật, trích dẫn KB/memory, chỉ
      đọc — muốn thay đổi thì đề xuất **operation plan**); bind `projectsPlanSourceToken` (plan của hội thoại, run trên issue
      không được đề xuất), quyền mặc định mới `pm.plans/use`, thẻ plan trong dòng thời gian hội thoại, `projectsPlanHooksToken`
      gửi tin `ds.plan.decided` đánh thức agent (trừ plan bị huỷ); agent-sessions: link kind `issue`, `registerProjects`,
      `registerInstructions`, `projectsIssueSessionToken`. Kiểm chứng: lint, typecheck, build xanh; test 110/110 file, 592/592
      test (chạy thành 3 phần: server+database 30 file/98 test, client a–k 26/154, client l–z + project 54/340; lần chạy liền
      trước có 3 file shell hỏng thật — `ChatProvider` cần realtime/auth trong harness test — đã sửa); sống trên dev: tạo hội
      thoại nguồn `askAgent` 201, nguồn lạ 400, hỏi Opus "PM-9 đang ở trạng thái nào, PR nào?" kèm ghim issue → trả lời tiếng
      Việt đúng (Done, PR #1 merged `7be8b82`, CI pass) và nêu nguồn `ds-studio issue get` / `pr list`. Chênh lệch:
      `docs/chenh-lech-upstream.md` mục 17. Còn mở: agent hội thoại muốn đề xuất tạo issue phải được bật "Create issues"
      (plan rehearse bằng quyền của run; chưa bind DelegatedWrites); link kind của conversations ("Linked work") và workspace
      (checkout repo cho hội thoại) chưa làm; bridge ACP chưa cài trên máy nào; locale vi-VN.
- [ ] S5 Phát hành — kế hoạch chi tiết `2026-11-02-nocobase-studio-s5-phat-hanh.md` (chủ dự án duyệt theo khuyến nghị
      02/11/2026). S5.0 xong: khảo sát `2026-11-02-khao-sat-vps-s5.md` (VPS 7,8 GB, chỉ 1,3–1,6 GB trống, 10 GB swap; đã tắt
      ERPNext theo chủ dự án; chủ dự án chọn dùng tạm VPS hiện tại). **S5.1 xong 02/11/2026:** Studio chạy ở
      https://studio.dsc.edu.vn/main/ — project Dokploy `duongsinh-studio`, compose `studio` (app Node 24 + bản phát hành
      `ad56193` build trên máy dev, chép lên `/srv/duongsinh-studio/releases/`; Postgres 16 riêng; giới hạn 1536 MiB/1,5 CPU
      và 384 MiB/0,5 CPU), HTTPS Let's Encrypt. Commit `ad56193` (thêm `@nocobase/db-postgres`, `deploy/dokploy/`,
      `docs/trien-khai-vps.md`), `0654066`. Cài mới: tiền tố `DS`, 5 nhãn, 3 vai trò, vai trò mặc định contributor, mật khẩu
      admin ngẫu nhiên (không có `admin123`), KB nạp 4 tài liệu Studio, CLI `ds-studio` cài từ production và đăng nhập bằng API
      key. Kiểm chứng: healthz `ok`, đăng nhập admin 200, manifest 375 lệnh, `kb search` có kết quả, khởi động lại container giữ
      nguyên dữ liệu; production NocoBase 2 vẫn 200 trong 0,05–0,10 s, RAM trống không đổi đáng kể (1,53 → 1,49 GB). Còn mở:
      lịch sao lưu tự động (cron do chủ dự án cài, script có sẵn), chưa có agent/runner/kết nối GitHub trên production.
      **S5.2 (mã + triển khai) xong 02/11/2026, chờ chủ dự án tạo App:** commit `4bad2a5` — kết nối GitHub **App** song song với
      PAT: Settings → Git → "Create GitHub App" (luồng manifest; webhook/redirect theo `APP_PUBLIC_ORIGIN`; khoá riêng và
      webhook secret niêm phong bằng secrets), ghi installation khi GitHub đưa về, token installation ký JWT RS256 bằng
      `node:crypto`, cache tới khi còn < 5 phút; run nhận token **chỉ của repo nó**, đúc ở `repoAccess.prepare` (ngoài
      transaction claim) hoặc on-demand; webhook `POST /api/webhooks/github/connections/{id}` kiểm HMAC-SHA256 (sai → 401),
      chống lặp delivery 7 ngày, `pull_request/check_run/check_suite/workflow_run/status` đọc lại PR ngay; có webhook trong 24 h
      thì poll giãn còn 10 phút. Bảng `dsGitApps`, `dsGitAppManifests`, `dsGitWebhookDeliveries` (migration
      `202611050001_ds_git_apps`). Kiểm chứng: lint, typecheck xanh; test 103 file / 573 test (chạy 3 phần: server+database
      32/101, client a–k 26/158, client l–z 45/314), build xanh; production chạy bản `4bad2a5` (sao lưu DB trước khi đổi),
      healthz `ok`, webhook không chữ ký/sai chữ ký → 401, route git cần đăng nhập, manifest CLI 375 lệnh (route App và
      webhook không lên CLI), production NocoBase 2 vẫn 200. Chênh lệch: `docs/chenh-lech-upstream.md` mục 18; hướng dẫn cho
      chủ dự án: `docs/trien-khai-vps.md` mục "GitHub App". Còn mở: chủ dự án bấm tạo + cài App; chưa có thao tác chuyển repo
      đã liên kết qua PAT sang App; tag (`push`) để S5.5.
      **03/11/2026:** chủ dự án tạo + cài App "Duong Sinh Studio" (repo sandbox + duongsinh-nocobase), tạo project Sandbox và
      Dương Sinh NocoBase. Sửa lỗi "Unable to connect" sau đăng nhập: Traefik gửi `X-Forwarded-Proto: wss` cho WebSocket nên
      `@nocobase/app-websocket` từ chối Origin `https` (403) → router Traefik riêng cho `/main/ws` ép `https` (`f5dc9bc`).
      Runner máy dev đăng ký sang production (`--force`, một đăng ký mỗi app), agent Opus/Sonnet tạo lại, lead agent = Opus
      (dự phòng Sonnet). Ca thật **DS-1**: PR #2 do `duong-sinh-studio[bot]` mở (token App), check `test` đọc qua Checks API,
      webhook cập nhật trong vòng 1 phút, `in_review` sau 4 phút.
      **S5.3 xong 03/11/2026:** runner dùng chung `vps-studio-runner` trên VPS (user `studio-runner` không sudo/Docker, slice
      giới hạn 2 GB RAM + 1 GB swap + 1,5 CPU, dịch vụ systemd user, Claude Code 2.1.316 + Codex 0.166.0 do chủ dự án đăng nhập,
      connector claude.ai tắt); agent mới **Codex · gpt-5.6-terra** (review chéo). Ca thật **DS-2** chạy hoàn toàn trên runner
      VPS (runner máy dev dừng): Opus giao → Sonnet code, PR #3 → Codex review chéo (không Must fix, 11/11 test) → CI xanh →
      `in_review` trong 5 phút. Trong lúc chạy: runner 610–812 MiB, RAM trống VPS 1,18–1,82 GiB, production 200 trong
      0,28–0,63 s. Tài liệu `docs/trien-khai-vps.md` (`2da06ae`).
      **S5.4–S5.5 xong 03/11/2026** (commit `441414a`, chạy trên production): môi trường Dương Sinh `dsEnvironments` (preview
      tối đa 2/rảnh 30 phút/xoá khi PR đóng — mới cấu hình; staging; production protected, approver owner; cả ba "chỉ ghi
      nhận", Studio không deploy); trang **Releases** (`/releases`: Previews · Staging · Releases · Pending release) và **Hosted
      environments** (`/environments`), trang App của plugin dời sang `/apps`; bind `releasesAccessToken` + catalog vai trò có
      quyền `rel.*`, seed Admin/Contributor, agent mặc định `rel.apps/view|read-logs`, `deploy` chỉ người; release line
      `stable` (main, `v*`) mỗi repo, tag đọc từ webhook `push` của App + poll 10 phút, issue của version tính bằng compare API
      theo merge commit, tag bị xoá giữ version `deleted`; đánh dấu staging (quản trị) / production (chỉ owner, ghi chú bắt
      buộc) / rollback (gợi ý mở lại issue); đề nghị lên production → feed Inbox của owner (gõ lại App id, từ chối phải có lý
      do); nhãn "In a version / In staging / In production" trên danh sách issue + mục Release trên trang issue; nhắc Inbox mỗi
      ngày khi issue merge > 3 ngày chưa lên production; CLI `release list|pending`, `version list`, `environment list`.
      Kiểm chứng: lint, typecheck, build xanh; test 115 file / 605 test (server+database 34/104, client a–k 26/158, client
      l–z + project 55/343), không lỗi. Production: sao lưu DB trước, `STUDIO_RELEASE=441414a`, healthz/đăng nhập/2 trang mới
      200, migration + seed môi trường áp dụng, manifest 378 lệnh; NocoBase 2 vẫn 200 (0,36–0,48 s). Thử thật trên sandbox: tạo
      tag `v2026.11.0-test` → webhook `push` tạo version ngay, mang DS-1 (PR #2 đã merge) → xoá tag → version chuyển
      `deleted`, DS-1 về "merged". Chưa đánh dấu production nào (việc của chủ dự án). Chênh lệch: `docs/chenh-lech-upstream.md`
      mục 19.
      **S5.6 xong 03/11/2026** (commit `9fdadae`, `4022544`, `de0fa41`; production chạy `de0fa41`): preview + staging NocoBase 2
      thật trên VPS qua Dokploy. Chủ dự án chọn "Cho Studio giữ key Dokploy" (khoá toàn tài khoản): khoá chỉ ở biến
      `DOKPLOY_API_KEY` của compose `studio`; `server/previews/dokploy.ts` chỉ tạo compose tên `nocobase-preview` /
      `nocobase-staging` trong môi trường của project `duongsinh-studio`, từ chối mọi compose không ghi trong `dsPreviewSlots`
      hoặc Dokploy không xác nhận đúng tên + môi trường (có test). Một chỗ preview `preview.dsc.edu.vn` (PR có nhãn `preview`,
      PR khác xếp hàng), staging `staging-nocobase.dsc.edu.vn` (push vào main). Plugin build trong GitHub Actions
      (`preview.yml`, PR #3 của duongsinh-nocobase, chồng lên PR #1); Studio nghe `workflow_run` qua GitHub App, cấp token
      installation 1 giờ chỉ của repo cho container setup → **không cần secret GitHub**, không SSH từ GitHub. Mỗi lần dựng: xoá
      compose cũ + volume, `nocobase:2.2.36-full` (1 GB, 1,5 CPU) + Postgres (384 MB), dữ liệu mẫu (`run.mjs all`, chạy lại tối
      đa 3 lần), production/Zalo/SePay/Lark → 0.0.0.0; cổng basic auth (bcrypt, chỉ cho trang; `/api/` và `/ws` do đăng nhập
      root sinh ngẫu nhiên bảo vệ vì NocoBase tự gửi `Authorization`); thông tin đăng nhập niêm phong, chỉ người sửa được issue
      thấy. Rảnh 30 phút → dừng; mở lại → chạy tiếp; PR đóng/bỏ nhãn → xoá; < 1,2 GB RAM trống → không dựng; production > 3 s
      → dừng; setup lỗi → dừng compose, trả chỗ; quá 3 giờ không báo → lỗi. Kiểm chứng: lint, typecheck, build, `dist check`
      xanh; test 116 file / 609+ test (server+db 35/108, client a–k 26/158, client l–z + project 55/343; một lần
      `project-memory-routes` hết giờ khi máy tải, chạy riêng qua). **Ca thật PR #4** (`test/preview-smoke`): build 1 phút →
      Studio dựng trong vài giây; lần 1 lỗi ở bước `ui` sau 70 phút ("fetch failed": blueprint quá 5 phút trên 1 CPU) → thêm
      1,5 CPU + chạy lại; lần 2 **ready sau 98 phút**; cổng: ẩn danh 401, đúng mật khẩu 200, sai 401; đăng nhập root NocoBase
      200; tự dừng lúc 06:44:03 (30 phút 39 giây sau ready); mở lại → chạy, dữ liệu còn; đóng PR → `destroyed`, 0 container, 0
      volume, `preview.dsc.edu.vn` 404. Suốt thời gian: RAM trống VPS 1,7–2,6 GB, production 200 trong 0,21–0,70 s (một lần
      2,7–3,8 s lúc giải nén bản phát hành). Chênh lệch: `docs/chenh-lech-upstream.md` mục 20; vận hành: `docs/trien-khai-vps.md`
      mục "Preview và staging". Còn mở: staging chưa dựng lần nào (cần merge PR #1 + #3 rồi push vào main); bản sửa "setup không
      chạy lại khi mở" (`de0fa41`) mới có test, chưa thấy trên preview thật; lần dựng đầu ~1,5 giờ trên VPS hiện tại.
      S5.7 (preview cho chính repo Studio) bỏ qua theo quyết định 03/11/2026; S5 khép lại.
- [ ] S6 Hoàn thiện — kế hoạch chi tiết `2026-11-03-nocobase-studio-s6-hoan-thien.md` (duyệt theo khuyến nghị 03/11/2026;
      thuật ngữ: issue = "Công việc", thuật ngữ kỹ thuật giữ tiếng Anh, nhận diện Dương Sinh).
      **S6.1 (mã) xong 03/11/2026, chưa lên production:** commit `b8fae79` (vi-VN cho toàn bộ lớp Studio theo
      `docs/thuat-ngu.md`; overrides cho bản vi-VN dịch máy của 7 plugin client + 3 plugin server qua khối `overrides` của
      app, đặt ở `locales/overrides/` để `nocobase locales check` không tính là ngôn ngữ; mặc định `vi-VN`; logo SVG
      navy #2B3990 + ô bàn cờ, favicon, màu chính, Roboto), `bff7c87` (xuống dòng của câu lệnh mẫu), `d35cd30` ("Sự cố"/"Số
      mới" → "Công việc"/"Tạo công việc"), `df1c024` ("Kiến thức" → "Tri thức"). Kiểm chứng: lint, typecheck, build xanh; test
      server+database 35/108, client a–k 26/159, client l–z + project 56/347 (test server ghim `APP_DEFAULT_LOCALE=en-US`);
      `nocobase locales check` đủ en-US/vi-VN/zh-CN hai phía; ảnh dev: đăng nhập, Công việc của tôi, chi tiết công việc,
      Phát hành, Tri thức, Agent. Còn mở: bản dịch máy còn sót trong plugin (ngoài luật thuật ngữ), tên agent hệ thống
      "Project manager" lưu trong DB, biểu tượng NocoBase trong màn tải/hình nền.
      **S6.1 lên production 03/11/2026** (chủ dự án duyệt): bản `df1c024` (sao lưu DB trước, 162 bảng dữ liệu),
      `/srv/duongsinh-studio/config.yml` thêm `i18n.defaultLocale: vi-VN` (bản cũ giữ ở `config.yml.before-df1c024`), chỉ deploy
      lại compose `studio`; lead agent đổi tên thành "Trưởng nhóm agent". Kiểm: healthz ok, WebSocket 101, trang tiếng Việt +
      logo Dương Sinh, `/main/my-issues` 200. Ghi chú: `nocobase.dsc.edu.vn` lúc này đã là một app NocoBase 3 khác (`/` trả 404
      JSON, `/main/api/healthz` 200) — thay đổi từ trước, không do bước này.
- [ ] Tính năng "Tự lái" (Autopilot) — kế hoạch chi tiết `2026-11-04-studio-autopilot.md` (duyệt 04/11/2026; Q1–Q3, Q5–Q6 theo khuyến nghị; Q4: không giới hạn merge/ngày, giới hạn song song = số chỗ runner).
      **AP1 (Phiếu review có cấu trúc) xong 04/11/2026:** commit `e7b38fd` (bảng `dsReviews` với index `pullRequestId`, `issueId`; service kiểm tra 5 tiêu chuẩn bảo mật, cấm self-review, cấm lệch head SHA; cổng submit chỉ nhận run token ở chế độ read-only mang action `studio.reviews/submit`; route `POST /api/reviews` và `GET /api/git/pullRequests/:pullRequestId/reviews`; nhận diện run read-only qua mention `Mode: read-only` từ comment và truyền cờ `mode: read-only` vào `agRunInputs`; i18n vi-VN/en-US/zh-CN và cập nhật nguyên tắc điều phối). Kiểm chứng: lint, typecheck, build xanh; test `tests/database/ds-reviews-migration.test.ts` (1/1) và `tests/server/reviews.test.ts` (1/1) đều qua.
      **AP2 (Cài đặt tự lái + Bộ đánh giá merge) xong 04/11/2026:** commit `4513b41` (bảng `dsAutopilotSettings` & `dsAutopilotEvents`; seed user hệ thống `studio-autopilot`; GitHub `pullFiles` API & GitService; bộ đánh giá merge `createAutopilotEvaluator` tuân thủ 7 điều kiện mục 3.3, tự merge PR với actor `studio-autopilot`, ghi event `merged`, chống merge trùng lặp, tự đăng bình luận tiếng Việt trên issue và PR; provider autopilot nghe sự kiện PR webhook và sweep định kỳ 2 phút; các REST routes: `GET/PUT /api/projects/:id/autopilot`, `POST /api/projects/:id/autopilot/pause|resume`, `GET /api/autopilot/events`, `POST /api/autopilot/stop-all`, `GET /api/issues/:id/autopilot`; i18n vi-VN/en-US/zh-CN). Kiểm chứng: lint, typecheck, build xanh; test `tests/database/ds-autopilot-migration.test.ts` (1/1), `tests/server/autopilot-evaluator.test.ts` (1/1) và `tests/server/autopilot-routes.test.ts` (1/1) đều qua 100%.
      **AP3 (Bộ lập lịch việc kế tiếp) xong 04/11/2026:** commit `84f27f7` (bảng `dsAutopilotIssueFlags`, migration `2026110804`; bộ lập lịch `createAutopilotScheduler` giải quyết cờ tự mở `allowAutoStart` và thừa hưởng từ epic `inheritFromParent`; kiểm tra quan hệ chặn `blockedBy` trong `pmIssueDependencies`; tính toán capacity theo `maxActiveIssues` hoặc tổng `slots` của runner online; sắp xếp việc ứng viên theo `priorityRank` rồi `createdAt`; tự động chuyển `in_progress`, gán executor `ds-project-manager`, bình luận tiếng Việt trên issue, ghi audit event `opened`, enqueue run cho agent; REST API `GET/PUT /api/issues/:issueId/autopilot-flag` với person-only gate; tích hợp sweep 2 phút và kích hoạt mở việc ngay khi PR vừa merge xong). Kiểm chứng: lint 0 warning, typecheck xanh, build xanh, test migration (1/1), test scheduler (1/1), test routes (1/1) đều qua 100%.
      **AP4 (Phát hiện đứng việc & Xử lý hạn mức) xong 04/11/2026:** commit `7055862` (dịch vụ `createAutopilotStallDetector` phát hiện issue `in_progress` không có run active vượt quá `stallMinutes`; đứng lần 1 đánh thức Trưởng nhóm Agent `ds-project-manager` kèm thông tin runner còn workspace chưa push `unpushedOn` theo bài học DS-4 và comment cảnh báo; đứng lần 2 liên tiếp tự động chuyển `blocked`, gán `needsYou`, gửi thông báo Hộp thư "Cần tôi quyết định" cho owners và ghi audit event `blocked`; xử lý lỗi `toolQuota` với cơ chế backoff 30 phút tới 2 giờ và throttle giảm song song xuống 1 để bảo vệ hạn mức token; cập nhật nguyên tắc `project-manager-principles.ts`; tích hợp vào chu kỳ quét 2 phút `autopilot-sweep`). Kiểm chứng: lint 0 warning, typecheck xanh, build xanh, test stall detector (1/1) qua 100%.

  **AP5 (Giao diện Tự lái, công tắc dừng & báo cáo tối) xong 04/11/2026:** commit `f1972c6` (giao diện cấu hình Tự lái theo từng dự án `client/pages/projects/project-autopilot.tsx` với switch bật/tắt, dialog tạm dừng/tiếp tục, form cấu hình phương thức merge, số việc song song, ngưỡng phát hiện đứng việc, chính sách và danh sách đường dẫn nhạy cảm; bảng nhật ký sự kiện `dsAutopilotEvents`; Badge trạng thái Tự lái trên Header dự án; nút Dừng khẩn cấp toàn hệ thống `client/pages/settings/projects-general.tsx` yêu cầu xác nhận gõ "STOP"; điều khiển cờ `allowAutoStart` và thừa hưởng từ epic cha trong aside công việc `issue-aside.tsx`; hiển thị huy hiệu đánh giá tự merge trên từng pull request `issue-pull-requests.tsx`; dịch vụ `createAutopilotDigest` tổng hợp hoạt động trong ngày gửi thông báo Hộp thư 21:00 hàng ngày và endpoint `POST /api/autopilot/digest`; hỗ trợ đa ngôn ngữ vi-VN, en-US, zh-CN). Kiểm chứng: lint 0 warning, typecheck xanh, build xanh, test digest (1/1) và routes (1/1) qua 100%.
  **AP6 (Triển khai production & Thử nghiệm thực tế) xong 04/11/2026:** commits `cd6421a`, `729a59a`. Đã sao lưu DB production trên VPS (`/srv/duongsinh-studio/backups/studio-before-f1972c6-20261104-1458.dump`, 4.15 MB). Đóng gói release `cd6421a`, cập nhật `STUDIO_RELEASE=cd6421a` qua Dokploy API và redeploy compose `studio` thành công. Cổng kiểm tra: `healthz` Studio 200 OK (`ok: true`), NocoBase production 200 OK, WebSocket 101/401 OK. Thử nghiệm thực tế trên Sandbox: Autopilot tự động đánh giá và tự merge PR #3 cho issue DS-2 thành công bằng actor `studio-autopilot` (`dsAutopilotEvents` kind `merged`, comment tự động trên issue); thử nghiệm PR có CI đỏ bị từ chối merge chính xác (`ciFailed`); thử nghiệm PR có đường dẫn nhạy cảm đòi hỏi đúng phiếu security review; thử nghiệm chuỗi issue nối nhau có cờ tự mở hoạt động trơn tru. Đã đặt cờ `allowAutoStart=true`, `inheritFromParent=true` cho epic DS-3 và toàn bộ các issue con của Dương Sinh App; đã kích hoạt Tự lái cho project Dương Sinh App (`enabled: true`, `mergeMethod: squash`, `stallMinutes: 30`, `sensitivePaths: ["database/**", "server/access/**"]`). Hệ thống đã sẵn sàng để phiên điều phối Claude Code chuyển sang chế độ chỉ giám sát.
- [ ] 06/11/2026 — **Đợt cập nhật theo NocoBase 3 mới (U1–U8).** Rà soát lại demo bằng REA: demo vẫn 1.0.0-beta.71, cùng
      bundle/OpenAPI/manifest như 01/11 (không đổi); thay đổi nằm ở gói npm (template beta.88, app-server 5 breaking mailer,
      agents 2.0.0-beta.5 có admission cho run + `toolQuota.until`, projects beta.25, releases beta.18, agent-sessions beta.18,
      agent-runner beta.23) và 59 commit upstream `04922adec1…7c25f885`. Kế hoạch chi tiết (gộp S6.2–S6.7 còn dở) và prompt nằm
      **trong repo studio**: `docs/plans/2026-11-06-nocobase-studio-ra-soat-cap-nhat.md`, `docs/plans/2026-11-06-prompt-trien-khai-studio-cap-nhat.md`
      (bản gốc WSL `~/code/duongsinh-studio`; mirror `D:\code\duongsinh-studio` đang dừng ở `9a83caf`, cần `git pull`).
- [x] U1 (06/11/2026): Studio lên template 1.0.0-beta.88, production `1246de1`, runner beta.23, sửa lỗi webhook GitHub bị chặn 401; chi tiết ở mục 7 của `docs/plans/2026-11-06-nocobase-studio-ra-soat-cap-nhat.md` (repo studio).
- [x] U2 (06/11/2026): cơ chế mới của plugin (actor run, nhường hạn mức, phiên đọc), tự lái chạy thật, production `03fe7c3`; ca thật DS-21.
- [x] U3 (06/11/2026): tiến độ công việc, hàng đợi agent, run lỗi, production `68b8a30`; ca thật DS-22.
- [x] U4 (07/11/2026): Hộp thư hợp nhất, badge, Theo dõi, nhóm việc, production `e260150`.
- [x] U5 (07/11/2026): Dashboard và 6 route `reports/*`, production `58ce502`.
- [x] U6 (07/11/2026): thiết lập dự án, skill, khoá tổ chức, git theo hợp đồng, tri thức do agent đề xuất, route `deploys`, `builds`; chưa bật App Host; 158/186 route Studio của demo đã có.
- [x] U7 (07/11/2026): web push, ngân sách lượt và token, tuỳ chọn thông báo, production `c93ebeb`; email đã có mã nhưng còn tắt vì chưa có tài khoản Gmail.
- [x] U8 (07/11/2026): cron sao lưu hằng ngày đã thử khôi phục, dọn bản phát hành, tài liệu; đẩy Google Drive và xoay khoá Dokploy do chủ dự án hoãn.
