# Nhóm A — Agent, runtime, session, skill: đối chiếu tài liệu NocoBase Studio với Dương Sinh Studio

Ngày: 08/11/2026. Chỉ đọc, không sửa repo. Repo: `/home/claude/duongsinh-studio` (`main`, `package.json` version `1.0.0-beta.88`).
Gói plugin đã cài: `@nocobase/app-plugin-agents` 2.0.0-beta.5, `app-plugin-agent-sessions` 1.0.0-beta.18, `app-plugin-projects`
0.1.0-beta.25, runner `@nocobase/agent-runner` 0.1.0-beta.23, `@nocobase/acp-bridge` 1.0.0-beta.5.

Tài liệu đã đọc hết (thư mục `/mnt/user-data/uploads/nocobase studio/05-studio/`): `01-what-is-studio.md`, `02-how-a-request-gets-done.md`,
`03-agent-team.md`, `04-concepts.md`, `15-local-agent.md`, `16-runner-agent.md`, `17-connect-computer.md`, `18-raise-a-request.md`,
`19-sessions.md`, `29-agents.md`, `30-runtimes.md`, `31-personal-runtime.md`, `32-skills.md`, `48-runner.md`.

Cách đánh giá: một tính năng do plugin cung cấp được tính là **Có** khi Studio đăng ký và route trang/API của nó
(`client/plugins.ts`, `server/plugins.ts`, `client/routes.ts`). Route có mà nối chưa đủ thì là **Một phần**. "Cố ý khác" là lệch đã
ghi trong `docs/chenh-lech-upstream.md` hoặc các kế hoạch, hoặc là quyết định thể hiện rõ trong mã.

Không chạy được `scripts/compare-studio-api.mjs` (cần swagger của server đang chạy, mặc định `http://127.0.0.1:13100/main/api/swagger`).
Số liệu gần nhất trong kế hoạch: 158/186 route Studio của demo đã có, 28 route còn thiếu là nhóm cố ý không làm
(`docs/plans/2026-11-07-studio-khac-phuc-ton-dong.md` mục 7, K3.5).

---

## 1. Bảng đối chiếu

Ký hiệu trạng thái: **Có** / **Một phần** / **Chưa có** / **Cố ý khác**.

### 1.1 Mô hình tổng thể (01, 02, 04)

| Tính năng (file) | Tài liệu nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Lead Agent điều phối (01, 03) | Lead Agent tích hợp sẵn, dùng chung, giao từng bước theo thế mạnh agent, đọc kết quả, không viết code và không merge | Có | Agent hệ thống `ds-project-manager` (`server/autopilot/scheduler.ts:8`), nguyên tắc ở `server/agents/project-manager-principles.ts`; lượt điều phối không checkout repo (`dirs: coordinating ? [] : dirsOf(issue)`, `server/providers/issue-subject.ts:328`) | Nguyên tắc viết tiếng Việt |
| Execution Agent = mỗi cặp tool + model (01, 03, 04) | Mỗi tổ hợp coding tool và model là một agent; admin mô tả "Good at" | Có | Trang `agentsRoute` của plugin (`client/routes.ts:373`); README agents mục "What it does" (Agents `agAgents`) | Đang bật Claude Opus 5.5 và Sonnet 5.5; Codex `disabled` dù runner báo `ready` (`docs/plans/2026-11-07-studio-khac-phuc-ton-dong.md` mục 1.4) |
| Ba vai trò người: task owner, project lead, administrator (01) | Owner đưa yêu cầu và nghiệm thu; lead đặt chuẩn và phát hành; admin dựng Studio, nối runtime | Có | Vai trò `owner`/`ds-admin`/`ds-contributor` (`.agents/rules/duongsinh-studio.md` mục Plugin assembly, `server/access/roles.ts`) | Trên thực tế một người (Thầy Tường) giữ cả ba vai |
| Luồng request → assign → clarify → develop → check → accept → release → remember (02) | Tám bước, mọi quyết định và lượt chạy lưu theo task | Có (phần lõi) | Ca thật DS-20…DS-23 trong `docs/plans/2026-11-06-nocobase-studio-ra-soat-cap-nhat.md` mục 7 (U1–U6) | Release/preview/memory thuộc nhóm tài liệu khác; ở đây chỉ ghi nhận luồng chạy được |
| "People decide, Agents develop": chỉ người merge (01, 03) | Lead Agent không đánh dấu Done, không merge; chỉ người merge PR | Cố ý khác | Tự lái tự merge khi đủ điều kiện (`server/autopilot/evaluator.ts`; `docs/chenh-lech-upstream.md` mục 22, 24 "PR đạt đủ điều kiện sẽ tự merge không chờ chủ dự án") | Agent vẫn không tự chuyển `done` bằng run token (mục 10: 403 `requireCloser`) |
| Project, repository, nhiều repo, repo mới khởi tạo bằng NocoBase Core (04) | Project gom task, thành viên, repo, tài liệu; repo mới khởi tạo từ Core | Có (chưa ca thật production) | `projectSetups` + `newRepo` dựng từ template `create-app` (`.agents/rules/duongsinh-studio.md` mục "Projects created from Studio"; K1 trong kế hoạch 07/11 còn "ca thật `ds-setup-probe`") | |
| Task 6 trạng thái, owner, sub-task, predecessor (04) | Backlog / In progress / Blocked / In review / Done / Canceled; owner là trách nhiệm, không phải vai hệ thống | Có | Plugin projects (README dòng 54–66 "Sub-issues and dependencies"); route `/issues`, `/my-issues` (`client/routes.ts:140`) | |
| Run record có process, result, usage (04) | Mỗi lần thực thi là một run có tiến trình, kết quả, mức dùng | Có | `client/components/agent-run-history.tsx`; route `issue runs`, `issue run get` (`server/routes/issue-work.ts:558,632`); trang `usageRoute` (`client/routes.ts:385`) | |
| nb-studio CLI cho Coding Agent cục bộ, chạy trên runtime dùng chung (01) | Thành viên tạo task, thêm yêu cầu, theo dõi kết quả từ coding agent quen dùng | Có (CLI) / Một phần (khâu cài đặt) | CLI `ds-studio` (`package.json` `nocobase.cli.bin`), lệnh khai bằng `cliRoute` trong `server/routes/*.ts` (ví dụ `inbox pending`, `issue progress`, `issue manager-start`) | Xem dòng 15 ở mục 1.3 |
| Self-hosted, tự chọn agent/model (01) | Studio và app chạy trên hạ tầng của mình | Có | Production `https://studio.dsc.edu.vn` trên VPS qua Dokploy (`docs/trien-khai-vps.md`) | |

### 1.2 Đội agent: giao việc, song song, xử lý lỗi (03, 29)

| Tính năng (file) | Tài liệu nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Lead Agent có model chính + dự phòng, dự phòng nhận sau 2 phút (03, 29) | Chọn first choice và fallback; fallback rảnh nhận việc sau thời gian chờ hàng đợi, mặc định 120 giây; không runtime nào chạy được first choice thì dùng fallback ngay | Một phần | Lưu `firstChoiceAgentId`, `fallbackAgentId`, `fallbackAfterSeconds` (`server/routes/project-manager.ts:43-49`, mặc định 120 ở `server/agents/project-manager-settings.ts:30`); thứ tự model dựng ở `server/providers/project-manager.ts:31-50`. `fallbackAfterSeconds` không được dùng ở đâu khác (grep `server/`). Plugin có `ModelSelectionPolicies.register(agentId, policy)` (`dist/server/core/runs/selection.d.ts`) nhưng Studio không đăng ký; khi không có policy plugin dùng `fallbackAfterSeconds: 0` (`dist/server/core/runs/claim.js:486`) | Hệ quả: fallback nhận việc **ngay**, không chờ 120 giây như cài đặt hiển thị. `docs/chenh-lech-upstream.md` mục 9 đã ghi "mới chỉ được lưu" |
| Trang cài đặt Lead Agent (29) | Nút **Settings** đầu trang Agents: first choice, fallback, nguyên tắc giao việc, giới hạn lượt mỗi task, khôi phục mặc định | Một phần (chỉ API) | `GET/PATCH /projectManager` (`server/routes/project-manager.ts:181`); không có giao diện: grep `firstChoiceAgentId`, `principles` trong `client/` chỉ ra `issue-progress.tsx` (đọc `commentRunLimit`), không có form | Muốn đổi model/nguyên tắc phải gọi API hoặc CLI; không làm được từ điện thoại |
| Sửa "Good at" và reasoning effort, thêm agent từ model runtime báo, tắt/bật agent, "Show disabled" (29) | | Có | Trang `agentsRoute` của plugin (`client/routes.ts:373`); README agents mục Web UI "Agents (`client/pages/agents`…)" | |
| "Where it runs" (03, 29) | Mỗi agent liệt kê runtime cung cấp nó | Có | Trang Agents của plugin | |
| Handoff ghi trong comment: agent, mục tiêu, tham chiếu, tiêu chí xong, lý do (03) | | Có | Nguyên tắc: hand-over là comment mention agent, dòng "Next: …", "Mode: read-only" (`server/agents/project-manager-principles.ts`, mục Luồng) | Tài liệu đòi thêm "lý do chọn agent"; nguyên tắc chỉ đòi nói rõ khi bỏ qua agent tốt hơn |
| Review ưu tiên nhà cung cấp khác; model không tự review code của mình (03) | | Cố ý khác | Nguyên tắc cho phép một lượt Opus khác review read-only (`sameModel=true`, Q3) khi không có reviewer khác nhà cung cấp; `ds_reviews` 12/12 `same_model = false` (kế hoạch 07/11 mục 1.4) | Thực tế chỉ có Claude; Codex chưa bật |
| Lead Agent đánh giá lại khi agent trả lời, người comment, check PR đổi (03) | | Có (qua tự lái) | `wakeOn*` của git luôn `false`, "Studio đánh thức agent qua tự lái" (`docs/chenh-lech-upstream.md` mục 28) | |
| Quy trình theo skill: design / develop & verify / check & review / deliver (03) | Skill `studio-workflow`, `studio-approach`, `studio-development`, `studio-review`, `studio-comment-style` | Có | `ds-workflow`, `ds-development`, `ds-approach`, `ds-review`, `ds-comment-style` + `ds-app-rules` (`server/agents/builtin-skills.ts:24-169`) | Tên `ds-*` thay `studio-*` |
| Blocked + "Needs you"; In review + delivery report (02, 03) | | Có | Nguyên tắc mục "Sẵn sàng nghiệm thu"; Hộp thư nhóm "Cần tôi quyết định" (`server/routes/inbox.ts`, U4) | |
| Execution Agent không đổi trạng thái task (03) | | Có | `guidance.rules` "Never change the issue’s status or assign it" (`server/providers/issue-subject.ts:301-308`) | |
| Agent hành động trong quyền của người yêu cầu (03, 04) | | Có | `runKeyScope` + `projectsRequestActorToken` (`server/providers/agent-actions.ts`; `docs/chenh-lech-upstream.md` mục 9, 10, 24) | |
| Không viết lại lịch sử đã push; nhánh bảo vệ do code host quản (03) | | Một phần | Runner không chặn push ("Nothing limits where an agent pushes… protect default branches on the code host", README agent-runner); branch protection `main` chưa bật, đang HỎI (`docs/plans/2026-11-08-studio-ra-soat-sau-pr6.md` mục 6 L2) | |
| Cô lập task: thư mục riêng, nhánh `agent/<task>` (03) | | Có | `ISSUE_BRANCH_PREFIX = 'agent/'` (`server/agents/ids.ts:12`), `dirsOf` (`server/providers/issue-subject.ts:150-180`) | |
| Trong một task chỉ một bước viết code; review/CI chạy bản sao read-only song song (03) | | Có | `sessionPolicy: 'fresh'` cho lượt read-only (`server/providers/issue-subject.ts:358`), `mode: 'read-only'` (`server/providers/agent-executor.ts:218,318`) | |
| Mỗi runtime 3 job đồng thời mặc định (03) | | Cố ý khác | Runner VPS `vps-studio-runner` 1 lượt mỗi lần, `user-1002.slice` 2,5 GiB (`docs/trien-khai-vps.md` mục Runner; `.agents/rules/duongsinh-studio.md`) | Đúng với tài liệu 30: "Start with one slot" |
| Task khẩn được ưu tiên trong hàng đợi (03, 18) | Priority quyết định việc nào trong hàng đợi chạy trước | Một phần | Tự lái sắp issue theo `priorityRank` khi mở việc kế tiếp (`server/autopilot/scheduler.ts:260-279`); `runs.enqueue` không truyền `priority` (`server/providers/agent-executor.ts:198-222`), nên run trong hàng đợi vẫn theo thứ tự cũ nhất trước | Với 1 slot, thứ tự hàng đợi có ý nghĩa thật |
| Phụ thuộc: task chờ predecessor/sub-task rồi tự chạy tiếp (03, 18) | | Có (qua tự lái) | Scheduler kiểm `pmIssueDependencies` `blockedBy` (`server/autopilot/scheduler.ts:235-238`), thừa hưởng cờ từ cha (`:156-175`) | Chỉ khi project bật tự lái |
| Hàng đợi agent: việc đang chạy và năng lực còn trống (03) | | Có | `client/pages/issues/agent-queue.tsx:58` (`AgentQueueView`), route `agentBoard/*` (`server/routes/issue-work.ts:987`) | |
| Check fail / PR conflict → giao sửa; báo owner sau 3 commit fail liên tiếp (03) | | Một phần | Giao sửa có trong nguyên tắc ("Check CI fail → đọc log…"); không có quy tắc đếm 3 commit fail (grep `consecutive` chỉ ra `server/autopilot/stall.ts` cho việc đứng) | |
| Cùng bước fail 2 lần → đổi agent → Blocked (03) | | Có | Nguyên tắc "Một bước fail 2 lần với cùng agent → đổi agent; vẫn fail → `blocked`"; thẻ quyết định run lỗi `failedRuns/:runId/decide` (`server/routes/issue-work.ts:515`) | |
| Hết hạn mức tool → đổi agent ngay, ưu tiên nhà cung cấp khác (03) | | Một phần | Nguyên tắc nói đổi ngay; tự lái chờ theo `wait.until` hoặc backoff 30 phút → 2 giờ, project mở tối đa 1 việc (`server/autopilot/stall.ts:81-82`, `docs/chenh-lech-upstream.md` mục 24) | Không có nhà cung cấp thứ hai đang bật |
| Runtime offline → trả việc về hàng đợi (03) | | Có | Sweeper của plugin (README agents "The sweep") | |
| Việc không ai nhận trong 24 giờ → fail run, báo owner (03) | | Chưa có | Subject `issue` không khai `queuedExpiryMs` (grep `server/`: 0 kết quả); bộ phát hiện đứng việc coi run `queued` là đang chạy và bỏ qua (`server/autopilot/stall.ts:243-255`) | Run kẹt hàng đợi (runner chết, chưa đăng nhập tool) không tự hiện lên Hộp thư |
| Giới hạn 20 lượt do comment agent / 24 giờ, dừng và hỏi owner (03) | | Có | `COMMENT_RUN_WINDOW_MS` (`server/providers/agent-executor.ts:44`), `dsCommentRunGrants`, nút "Tiếp tục" (`client/pages/issues/detail/issue-progress.tsx:168`), Hộp thư `limited` (K3.1) | |
| Người thêm yêu cầu, dừng run, giành lại task bất cứ lúc nào (03) | | Có | `sendBack`, `issueOwnerHandoffs`, `failedRuns` (`server/routes/issue-work.ts:203,513-522`) | Chi tiết thuộc tài liệu 21 (nhóm khác) |

### 1.3 Session, Runner Agent, máy cá nhân, tạo yêu cầu (15–19)

| Tính năng (file) | Tài liệu nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| "Use Studio in your agent" ở menu avatar (15) | Sao chép hướng dẫn cài cho coding agent; agent cài CLI, mở URL đăng nhập, cài skill CLI | Chưa có | `client/layouts/components/user-menu.tsx:69-122` chỉ có ngôn ngữ, giao diện, đăng xuất; grep `downloadTokens`/`installScript` trong `client/`: 0 | API tải CLI có sẵn của plugin (`POST /api/agents/dist/downloadTokens`, `installScript`); `docs/trien-khai-vps.md` mục "CLI `ds-studio`" nói token "lấy khi bấm cài CLI trong ứng dụng" nhưng không thấy nút đó |
| Đăng nhập CLI bằng trình duyệt (15) | Lệnh login chờ duyệt trên trình duyệt | Có trong mã | `deviceAuthorization` (`server/config/auth.ts:24-28`), trang `/device` (`client/routes.ts:136`), migration `202610060001_create_device_code.ts` | `docs/trien-khai-vps.md` vẫn ghi "Đăng nhập bằng trình duyệt chưa có trên bản này": cần kiểm lại trên production |
| Skill CLI cài kèm (15) | Agent cài skill hướng dẫn dùng CLI | Chưa có | `package.json` `nocobase.cli` không có `skills`; repo không có thư mục `skills/` gốc; `app-cli-client` README: chỉ gói khai `nocobase.cli.skills` mới có `skills install` | |
| `whoami`, `docs` (15) | Kiểm tra danh tính và danh sách lệnh | Có | `node_modules/@nocobase/app-cli-client/dist/whoami.js`, `docs.js` | |
| Hai chế độ trong **My sessions**: Runner Agent và My Agent (19) | Một trang, chọn chế độ, "New session" | Một phần | Runner Agent = panel chat (⌘J) và `/chat/:conversationId` (`client/routes.ts:238-247`); My Agent = trang `/agent-sessions` của plugin (`client/plugins.ts:47`). Hai nơi tách rời | |
| Runner Agent: chọn agent, gửi chữ/ảnh/tệp, tin nhắn khi đang chạy được xếp hàng (16) | | Có | `client/extensions/nocobase-agent-chat/agent-choice.tsx`, `message-attachments.tsx`, `composer.tsx`; README agents "Conversations while the agent works" (`queue`, `withdraw`) | |
| Runner Agent: chọn project trước tin đầu, agent chuẩn bị mã nguồn của project (16, 19) | Project cố định sau tin đầu; agent có checkout để đọc mã | Chưa có | `conversations.workspace.provide` chưa làm: "agent hội thoại không có mã nguồn, chỉ đọc qua CLI" (`docs/chenh-lech-upstream.md` mục 17); grep `workspace.` trong `server/conversations`, `server/providers/conversations.ts`: 0 | Có ghim ngữ cảnh issue/project ("Ask agent", `contextKinds.register`, `server/providers/conversations.ts:143-147`) nhưng không có code |
| Hội thoại có thể xem và **sửa** project, push/PR khi được yêu cầu (16) | | Cố ý khác | Luật hội thoại "read-only by default… propose one operation plan" (`server/conversations/studio-conversations.ts:57-75`) | |
| Biến thảo luận thành task, bấm **Start** cho Lead Agent (16, 19) | Agent tạo task trong hội thoại; người xem và bấm Start | Cố ý khác (qua plan) | Plan nguồn `conversation`, thẻ plan Execute/Void, tin `ds.plan.decided` (`server/conversations/studio-conversations.ts:47-50`, `server/providers/conversations.ts:116`); nút Start = `projectManager/issues/:issueId/start` (`server/routes/issue-work.ts:1036`) | Agent hội thoại chỉ đề xuất được việc chính nó có quyền làm; muốn tạo issue phải bật "Create issues" cho agent (mục 17) |
| `#task-identifier` để nối việc có sẵn vào hội thoại (16, 19) | | Một phần | Có trong My Agent (`registerLinkKind('issue')` có `search`, `server/providers/conversations.ts:156`); panel chat Runner Agent không có (grep `mention`, `#` trong `composer.tsx`: 0) | |
| Task đã nối hiện trong hội thoại, trạng thái task quay về hội thoại (16, 19) | Bắt đầu, bị chặn, chờ nghiệm thu, xong đều báo vào cuộc hội thoại | Chưa có (Runner Agent) / Có (My Agent) | `conversations.links.registerKind('issue')` chưa làm (`docs/chenh-lech-upstream.md` mục 17); `delegations/*` thuộc 28 route cố ý không làm (kế hoạch 06/11 mục 7 U6); chỉ có tin khi plan được quyết. My Agent có link kind + `progress` | Đây là phần giúp giám sát từ điện thoại nhất |
| Danh sách session: số task nối, thanh tiến độ, lọc **Needs me** / **In progress** (19) | | Chưa có (Runner Agent) | Bộ lọc của `history-list.tsx:80-125` chỉ có tìm kiếm, agent, nguồn, lưu trữ | |
| Lưu trữ / khôi phục hội thoại; xoá sau 30 ngày lưu trữ (19) | | Có | `history-list.tsx:85,410-416`; mặc định `agents.conversations.archivedRetentionDays` = 30 (README agents), `server/config/agents.ts` không ghi đè | |
| Đổi runtime khi runtime offline ("Switch runtime") (16) | Runtime mới nhận lịch sử; sửa chưa push ở lại máy cũ | Một phần (chỉ API) | Plugin có `POST /api/agents/conversations/{id}/switchRunner` (README agents mục Conversations); grep `switchRunner` trong `client/` và `dist/client` của plugin: 0 | Một runner nên ít cần |
| **Ask agent** trên trang task/project mang ngữ cảnh trang (19) | | Có | `useChatContextSource`, nguồn `askAgent` (`server/conversations/studio-conversations.ts:53`) | |
| Session chỉ chủ nhìn thấy; task chia sẻ theo quyền project (04, 16, 19) | | Có | Plugin agents (conversations owner-only) và agent-sessions (README dòng 7) | |
| Nối máy tính (My Agent / My computers) (17) | Đưa hướng dẫn cho coding agent trên máy, đăng nhập trình duyệt, cài dịch vụ nền, chọn thư mục được phép, gỡ máy | Một phần | Trang plugin `/agent-sessions` có My computers, thư mục được phép; lệnh `ds-studio acp start` / `acp service install` (`docs/moi-truong-dev.md` mục "Sessions trên máy của mình"). Không truyền `connectPrompt` nên plugin hiện checklist lệnh mặc định, không có prompt sao chép cho coding agent. "Chưa cài trên máy nào" | |
| New issue dạng hội thoại: mô tả, đính kèm, agent tạo task, **Start** hoặc **Not now** (18) | | Một phần | Hộp thoại New issue của plugin (`issueChildRoutes`, README projects `/issues/new?tab=ai|manual`). Studio không bind `projectsIntakeOrganizerToken` (grep `server/`: 0), nên tab AI chỉ có "rule split": mỗi gạch đầu dòng thành một issue (DS-25…DS-56, `.agents/rules/duongsinh-studio.md`) | `intakeDrafts` thuộc 28 route cố ý không làm |
| "Fill in manually": tiêu đề, mô tả, project, owner, bắt đầu ngay/để sau (18) | | Có | Tab `manual` của plugin; "Start now" / "Later" (README projects dòng 54) | |
| Phím tắt **C** tạo task (18) | | Có | `PmShortcuts` → `useNewIssueShortcut` (`client/pages/my-issues/index.tsx:34`; `node_modules/@nocobase/app-plugin-projects/dist/client/components/pm-shortcuts.js`) | |
| Sub-task từ trang task hoặc nhờ agent soạn; stage sau chờ stage trước; predecessor (18) | | Một phần | Sub-task, stage, predecessor: plugin (README projects dòng 59-66). "AI breakdown" cần intake organizer, chưa bind | Agent hội thoại có thể đề xuất sub-issue qua plan |

### 1.4 Runtime, runtime cá nhân, runner (30, 31, 48)

| Tính năng (file) | Tài liệu nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Trang Runtimes: trạng thái, slot, tool đã đăng nhập, cá nhân/chia sẻ, phiên bản runner (30) | | Có | `runtimesRoute` (`client/routes.ts:377`); README agents mục Web UI "Runtimes" | |
| Add runtime: phạm vi, tool, concurrency, lệnh cài với khoá một lần, chọn hệ điều hành (30, 31) | | Có | Hộp thoại `connect` của plugin (`dist/client/pages/runtimes/connect.js` dùng `lib/install.js`) | |
| Sửa tên, tool bật, concurrency tối đa; chỉ chủ sửa runtime cá nhân; admin chuyển thành shared (30, 31) | | Có | README agents "Only its owner changes a runner…" | |
| Runtime cá nhân chỉ làm việc của chủ (31) | | Có | `ownerOnly` (`docs/chenh-lech-upstream.md` mục 10); runner `may-dev-duongsinh-prod` trên máy dev, đang dừng (`docs/trien-khai-vps.md`) | |
| Người khác yêu cầu việc dùng runtime cá nhân của bạn → hỏi xác nhận (31) | | Chưa có | `personalRunnerRequests: [] as never[]` kèm chú thích "Studio has no personal-runner consent flow" (`server/routes/issue-work.ts:444-445`) | Một người dùng: không cần |
| Biến chỉ cho runtime dùng chung, không gửi tới runtime cá nhân (30, 31) | | Một phần (chỉ API) | Plugin có `teamRunnersOnly` (README agents "Variables"); `VariablesSection` chỉ export ở `client/kit`, không trang plugin nào dùng, Studio cũng không (grep `client/`: 0) | |
| Thư mục làm việc và lịch sử run để chẩn đoán đĩa, việc chưa push (30) | | Có | Chi tiết runtime của plugin (`workspaceUsage`, README agents đầu file) | |
| Thu hồi khoá rồi xoá runtime; lịch sử run giữ lại (30, 31) | | Có | README agents "revoke… and delete it once revoked" | |
| Lệnh `nocobase-runner`: register/start/stop/status/logs/service/update/env/config models/agent-tools/unregister/uninstall (48) | | Có | Dùng runner upstream 0.1.0-beta.23; README của gói liệt kê đủ lệnh (dòng 13-25) | Runner VPS tự cập nhật qua heartbeat (`docs/chenh-lech-upstream.md` mục 23) |
| `gc --ended` dọn thư mục của việc Studio coi là xong; dọn tự động khi việc kết thúc (48) | "`--ended` for work Studio considers complete" | Chưa có (cho subject `issue`) | Subject `issue` không khai `workspaces.settled` (grep `workspaces` trong `server/`: chỉ `stall.ts`); README agents: "a kind without it never counts as over"; `docs/workspace-cleanup.md` của plugin | Thư mục của issue đã xong chỉ bị xoá khi đĩa thấp hoặc `gc --force` tay; artifact TTL 24 giờ vẫn xoá `node_modules` |
| `min-free-disk`, `artifact-ttl`, `artifact-patterns` (48) | | Có | README agent-runner dòng 19-21, 93-95 | Mặc định giữ 5 GB trống |

### 1.5 Skill (32)

| Tính năng (file) | Tài liệu nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Định dạng `SKILL.md` + tệp phụ (32) | | Có | `skillsRoute` (`client/routes.ts:381`); README agents mục Skills (định dạng Agent Skills) | |
| 5 skill dựng sẵn; 4 gắn project mới, comment style gắn global (32) | | Có | `server/agents/builtin-skills.ts` (`reach: 'global' | 'project'`), `ensureBuiltinSkills` (`server/providers/project-defaults.ts:104-129`) | Thêm `ds-app-rules` |
| Sửa skill dựng sẵn; nâng cấp giữ thay đổi (32) | | Có | `ensureBuiltinSkills` bỏ qua slug đã có (`project-defaults.ts:120`) | Mặt trái: bản mới của skill dựng sẵn không bao giờ tự vào (`.agents/rules/duongsinh-studio.md`) |
| Tạo skill, nhập ZIP, lưu phiên bản, xem/xuất ZIP phiên bản cũ (32) | | Có | `dist/client/locales/skills.en-US.js` (`exportVersion: 'Export version {{version}} as a zip'`), `dist/client/api/client.js` ("A zip in the Agent Skills layout as a new skill…") | |
| Phạm vi global (32) | | Có | Công tắc "Global attachment" trên trang skill của plugin | |
| Phạm vi project: Project settings › Default skills (32) | | Một phần | Scope `project` đã đăng ký (`project-defaults.ts:61-75`), skill project vào run (`issue-subject.ts:330`), trang "Skill của dự án mới" (`client/pages/settings/project-default-skills.tsx`, chỉ áp cho project tạo sau). Không có mục Default skills trên trang từng project (grep `DefaultSkillsSection`, `skill` trong `client/pages/projects/`: 0) | Gắn `ds-app-rules` cho `nocofen` phải làm trên production ngoài giao diện (K2.2) |
| Phạm vi repository (32) | | Chưa có | `dirsOf` không gắn workdir id cho repo (`issue-subject.ts:150-180`), không có scope repo | Mỗi project của DS gần như một repo: ít cần |
| Phạm vi cụ thể hơn thắng khi trùng tên (32) | | Có (do plugin gộp) | README agents mục Skills | Chưa kiểm bằng ca thật |
| Quyền: tạo skill cần quyền quản lý agent; người tạo/admin sửa; project lead gắn skill vào project (32) | | Một phần | Quyền trang `skills` của plugin; trang mặc định của Studio đứng sau `agents.agents` read (`client/routes.ts`, `settingsProjectDefaultSkills`). Project lead không có chỗ gắn skill cho project của mình | |

---

## 2. Đáng làm cho Dương Sinh

Bối cảnh tính giá trị: một chủ (Thầy Tường) giám sát agent từ điện thoại; một runner dùng chung trên VPS (2,5 GiB RAM, 1 slot); gói
thuê bao Claude; khoảng 6 app NocoBase 3 nhỏ.

| Hạng | Việc | Giá trị | Công (ngày) | Phụ thuộc | Rủi ro |
| --- | --- | --- | --- | --- | --- |
| 1 | **Khai `workspaces.settled` cho subject `issue`** (issue `done`/`canceled` là xong; thêm `resolveKeys` nếu có thư mục cũ không gắn run) để runner tự xoá thư mục của việc đã xong và `gc --ended` có tác dụng | cao | 0,5 | Không | Plugin xoá cả commit chưa push của việc đã xong. Với DS, việc xong nghĩa là PR đã merge, nên chấp nhận được; cần test với issue `canceled` còn nhánh dở |
| 2 | **`queuedExpiryMs` cho subject `issue`** (ví dụ 24 giờ) để run kẹt hàng đợi thành run lỗi, rồi đi qua thẻ "run lỗi" sẵn có vào Hộp thư; thêm hiện lý do chờ (`wait`) lên thẻ | cao | 0,5–1 | Không | Chờ hạn mức Claude dài có thể bị tính là lỗi: đặt hạn lớn hơn backoff tối đa (2 giờ) của tự lái |
| 3 | **Trạng thái task quay về hội thoại Runner Agent**: `conversations.links.registerKind('issue')` (đọc quyền ở `prepare` hoặc cache, như mục 17 đã gợi ý) và tin "việc đã bắt đầu / cần bạn / chờ nghiệm thu / xong" vào hội thoại sinh ra việc | cao | 2–3 | Không | Lỗi transaction trên SQLite ở dev (mục 17); production là PostgreSQL. Thêm tin vào hội thoại có thể đánh thức agent, tốn lượt: chỉ gửi thông báo, không đánh thức |
| 4 | **Giao diện cài đặt Lead Agent** (first choice, fallback, nguyên tắc, giới hạn lượt, khôi phục mặc định) trên trang Agents hoặc System settings, và **nối `fallbackAfterSeconds`** bằng `ModelSelectionPolicies.register('ds-project-manager', …)` | vừa | 1–1,5 | Không | Thấp. Hiện fallback nhận việc ngay (0 giây) trong khi cài đặt ghi 120 |
| 5 | **Đưa ưu tiên issue vào run** (`priority` khi `runs.enqueue`, ánh xạ `priorityRank` 0–4) | vừa | 0,5 | Không | Thấp; với 1 slot, việc khẩn thật sự được chạy trước |
| 6 | **"Dùng Studio trong agent của bạn"**: mục menu tài khoản tạo download token, hiện một prompt sao chép (cài CLI, `ds-studio login`, `whoami`), và gói skill CLI qua `nocobase.cli.skills` | vừa | 1–1,5 | Device login trên production phải chạy (kiểm lại `docs/trien-khai-vps.md`) | Thấp. Giúp dùng Claude Code trên máy dev điều khiển Studio thay vì gõ lệnh tay |
| 7 | **Intake bằng AI** (bind `projectsIntakeOrganizerToken`, organiser là run trên runner) để yêu cầu dài thành vài issue hợp lý thay vì mỗi dòng một issue | vừa | 2–3 | Runner rảnh | Mỗi lần soạn nháp chiếm slot duy nhất và hạn mức Claude, cạnh tranh với việc dev. Có thể thay bằng: soạn trong panel chat rồi dùng plan (đã có) |
| 8 | **Mục Default skills trên trang project** (`DefaultSkillsSection` của `client/kit`, scope `project`) và **biến của project** (`VariablesSection`) | thấp–vừa | 0,5–1 | Không | Thấp. Bỏ được bước chỉnh skill cho project có sẵn bằng tay trên production |
| 9 | Quy tắc "3 commit fail liên tiếp → báo owner" trong nguyên tắc Lead Agent hoặc tự lái | thấp | 0,5 | Không | Có thể gây thêm thông báo; bộ phát hiện đứng việc đã bắt một phần |

Thứ tự gợi ý: 1 → 2 → 5 (cùng chỗ, một PR nhỏ ở `server/providers/issue-subject.ts` và `agent-executor.ts`), rồi 4, rồi 3. Mỗi bước
kiểm bằng test server có phạm vi hẹp, không chạy `pnpm check` trên VPS.

## 3. Không đáng làm (bây giờ)

| Việc | Lý do |
| --- | --- |
| Luồng xác nhận runtime cá nhân (`personalRunnerRequests`, `runAsMe`) | Chỉ có một người dùng; không ai khác yêu cầu việc trên máy của Thầy |
| Ba slot mỗi runtime, thêm runtime | RAM 2,5 GiB; `pnpm check` từng làm VPS quá tải và mất run (`leaseExpired`) |
| Checkout mã nguồn cho hội thoại (`conversations.workspace.provide`) | Mỗi hội thoại thêm một checkout và `node_modules` trên VPS nhỏ, chiếm slot duy nhất; đọc mã qua CLI/issue là đủ để bàn yêu cầu |
| Hội thoại được sửa code, push, mở PR | Đi ngược quyết định "mặc định chỉ đọc, đề xuất plan"; việc thật nên thành issue để có review và tự lái |
| My Agent / cầu ACP trên máy cá nhân | Thầy giám sát từ điện thoại; máy cá nhân ngủ là session dừng; runner VPS đã làm việc |
| Gộp hai nơi thành một trang "My sessions" | Chỉ là sắp xếp giao diện; panel chat đã có nút nổi trên điện thoại |
| Nút "Switch runtime" cho hội thoại | Chỉ có một runner dùng chung |
| Skill theo repository | Mỗi project gần như một repo; scope project đủ |
| Review chéo khác nhà cung cấp (bật Codex) | Không phải việc lập trình mà là chi phí: cần thêm thuê bao. Nếu muốn, chỉ cần bật agent Codex trên trang Agents vì runner đã báo `codex` `ready` |
| Chỉ người được merge | Tự lái tự merge là lựa chọn có chủ ý để một người không thành nút thắt; giữ các chốt an toàn hiện có (đường dẫn nhạy cảm, phiếu review) |

## 4. Ghi chú cho lần rà soát sau

- `docs/trien-khai-vps.md` mục "CLI `ds-studio` nối vào production" có thể đã cũ: mã có `deviceAuthorization` và trang `/device`.
- `docs/chenh-lech-upstream.md` mục 9 nên ghi thêm: plugin mặc định `fallbackAfterSeconds: 0` khi không có policy, nên con số 120 của
  Studio không có tác dụng.
- Chưa chạy lại `compare-studio-api.mjs` trong lần này (cần server đang chạy).
