# B — Việc hằng ngày, Hộp thư, Quản trị: đối chiếu tài liệu NocoBase Studio ↔ Dương Sinh Studio

> Ngày rà soát: 08/11/2026. Chỉ đọc, không sửa repo. Mốc mã: `/home/claude/duongsinh-studio` nhánh `main` (commit đầu `b898aa8`).
> Nhóm tài liệu: `05-studio/` 12, 13, 14, 20, 21, 22, 23, 24, 25, 26, 27, 28, 33, 42, 43, 44, 46, 47 (đọc đủ cả 18 file).
> Cách kiểm: đọc `docs/chenh-lech-upstream.md`, `docs/thuat-ngu.md`, các kế hoạch 06/11, 07/11, 08/11, phụ lục API/CLI beta.71; rồi grep/đọc
> `client/routes.ts`, `client/pages/**`, `client/layouts/**`, `client/extensions/**`, `server/routes/**`, `server/providers/**`, `server/config/**`,
> `deploy/dokploy/config.yml`, `package.json`, README và `dist` của các plugin đã đăng ký (`server/plugins.ts`, `client/plugins.ts`, `cli/plugins.ts`).
> Quy ước trạng thái: **Có** (dùng được qua giao diện, hoặc CLI nếu tài liệu chỉ nói CLI) · **Một phần** (API/CLI có nhưng thiếu giao diện, hoặc thiếu một phần
> hành vi) · **Chưa có** · **Cố ý khác** (đã ghi lệch có chủ ý trong `docs/chenh-lech-upstream.md` hoặc kế hoạch).
> "Route có" không được tính là "tính năng có": hàng nào chỉ có API/CLI đều ghi **Một phần**.

## 1. Bảng đối chiếu

### 1.1 Mời, tham gia, đăng nhập, cài đặt cá nhân (12, 13, 14)

| Tính năng (file docs) | Docs nói gì (1 dòng) | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Mời thành viên bằng email, tối đa 50, chọn dự án (12) | Settings › Members › Invite members; người được mời vào các project đã chọn | **Một phần** | API + CLI có: `POST /api/projects/invitations` (`projectIds`), lệnh `project invitation create/list/resend/revoke` (`node_modules/@nocobase/app-plugin-projects/dist/server/domains/invitations/invitation.routes.js:16-82`); test `tests/server/invitations.test.ts:40`. Giao diện: không có — grep `invit` trong `client/pages`, `client/extensions` không ra gì; chuỗi `settings.inviteUsers` (`client/locales/system/settings-vi-VN.ts:102`) không được dùng | Plugin projects **đã xuất sẵn** `InviteDialog`, `InvitationsSection` trong `@nocobase/app-plugin-projects/client/kit` (`dist/client/kit.d.ts:34-35`) nhưng Studio chưa gắn vào trang nào |
| "Email not sent" → Copy invitation link (12, 44) | Không có email thì người mời tự sao chép link | **Một phần** | API trả `inviteUrl` khi không có kênh email (README projects dòng 132; test `invitations.test.ts:76`). Không có nút Copy vì không có giao diện mời | Email mời dùng `MAILERS_SYSTEM_*`, đang trống (`server/config/mailers.ts`, `deploy/dokploy/config.yml` không có `mailers`) |
| Trang nhận lời mời: tên + mật khẩu ≥ 8, "Create account and join" (14) | Link hiệu lực 7 ngày | **Có** | Plugin users đăng ký route công khai `/invite/:token` (`node_modules/@nocobase/app-plugin-users/dist/client/routes.js:2`), `users()` có trong `client/plugins.ts` | Chưa kiểm trên production |
| Ba vai trò dựng sẵn Member/Admin/Owner (12, 42) | Member, Admin, Owner | **Cố ý khác** | owner = `root`, `ds-admin`, `ds-contributor` (`.agents/rules/duongsinh-studio.md` mục Plugin assembly; `docs/thuat-ngu.md`: Chủ sở hữu/Quản trị/Cộng tác viên) | Contributor tương đương Member |
| Vai trò mặc định cho người mới (Settings › General) (12, 42) | Người tham gia nhận role mặc định | **Một phần** | API `GET/PUT /api/access/settings` (`server/routes/access.ts:512,531`), mặc định `null`; grep `defaultRole`, `access/settings` trong `client/` không ra | Chỉ đặt được bằng API/CLI `access` |
| Đăng nhập bằng username hoặc email (14) | | **Có** | `username()` plugin (`server/config/auth.ts:19`), trang `/login` | |
| Chỉ vào được bằng lời mời (14, 44: `disableSignUp: true`) | Cấu hình mẫu của docs tắt tự đăng ký | **Chưa có (cần kiểm gấp)** | `deploy/dokploy/config.yml:17-19` chỉ có `enabled: true`, `autoSignIn: false`, **không có `disableSignUp`**; `server/config/auth.ts:32` cũng không. Better Auth mặc định cho đăng ký (`better-auth/dist/api/routes/sign-up.mjs:144`), trang `/register` chỉ chuyển hướng khi server báo tắt (`client/pages/auth/register.tsx:15-17`) | Suy ra từ mã, **chưa kiểm production**. Người tự đăng ký không có vai trò (defaultRole `null`) nhưng vẫn vào được các trang `authz: 'skip'` (Home, Inbox, Chat, Thông báo của tôi) |
| Quên mật khẩu qua email (14, 44) | "Forgot password?" + email | **Chưa có (chưa bật)** | Trang `/forgot-password`, `/reset-password` có (`client/routes.ts:120`), nhưng `auth.passwordReset` không bật và không có mailer (`deploy/dokploy/config.yml`, `config.example.yml:115-117` để comment) | Cần Gmail App Password (việc chủ dự án ở L5 kế hoạch 08/11) |
| Owner đặt lại mật khẩu cho người khác (14, 42) | | **Một phần** | API + CLI `user reset-password` (plugin users); trang `client/pages/settings/users.tsx` chỉ có disable/enable/revokeSessions (dòng 92-161), `user-form.tsx` chỉ nhập mật khẩu khi tạo mới | Không có email nên đây là đường khôi phục duy nhất cho nhân viên |
| Account settings › Profile (tên hiển thị, username) (14) | Tự sửa hồ sơ | **Chưa có** | Menu tài khoản chỉ có Ngôn ngữ, Giao diện, Đăng xuất (`client/layouts/components/user-menu.tsx:79-80`); không có trang tài khoản | Plugin authentication không cung cấp trang này; phải tự dựng trên `authClient.updateUser` |
| Account & security: đổi mật khẩu (đăng xuất thiết bị khác) (14) | | **Chưa có** | grep `changePassword` trong `client/` không ra | |
| Preferences: ngôn ngữ, giao diện (14) | | **Có** | `LanguageSwitcher`, `ThemeSettings` trong menu tài khoản (`user-menu.tsx:79-80`) | |
| Preferences: mật độ, âm thanh, thông báo desktop, commit attribution (14) | | **Chưa có** | grep `sound`, `requestPermission`, `new Notification(`, `attribution` trong `client/` chỉ ra một chỗ cắm trống (`client/extensions/nocobase-inbox/inbox-page.tsx:79`) | |
| Khoá API cá nhân (Account settings › API keys) (14, 43) | Tạo khoá gọi Studio dưới danh nghĩa mình | **Một phần** | API `/api/apiKeys` + CLI `api-key create/list/rotate/delete` (plugin api-keys, `dist/server/routes/index.js`); không có trang (README plugin: "ships no page") | `docs/trien-khai-vps.md:100` bảo "tạo khoá ở trang tài khoản" — trang này **không tồn tại**, tài liệu vận hành sai |
| Kết nối Git cá nhân (14) | OAuth/device/token; agent push và merge bằng danh tính của người | **Một phần** | Chỉ `useToken` (`server/routes/git.ts:1509`), giao diện nhập token chỉ ở trang Thiết lập dự án (`client/hooks/use-project-setup.ts:85`, `client/pages/projects/setup.tsx:39`) | Token chỉ dùng để tạo repo/mở PR CI, **chưa** dùng cho commit/merge đứng tên (chenh-lech mục 28) |
| "Use Studio in your agent" ở menu tài khoản (13, 47) | Hướng dẫn cài `nb-studio` cho Coding Agent cục bộ | **Một phần** | Lệnh cài CLI nằm ở trang Runtimes › Connect của plugin agents (`dist/client/pages/runtimes/connect.js` dùng `cliInstallCommand`); không có mục trong menu tài khoản | |
| Trang mở đầu là My issues (13, 14) | Đăng nhập xong mở project từ My issues | **Một phần** | Home vẫn là trang giới thiệu năng lực NocoBase của template (`client/pages/home/capabilities.ts`, `index.tsx`: `home.platform`, `home.example`) | Trên điện thoại tốn thêm một lần chạm |

### 1.2 Công việc của tôi, theo dõi tiến độ, trả lời, nghiệm thu (20, 21, 22, 23)

| Tính năng (file docs) | Docs nói gì (1 dòng) | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| My issues gom nhóm: Following / Waiting for you / In progress / Waiting for others / Backlog / Done 7 ngày (20) | Mỗi việc một lần, nhóm theo việc cần ai | **Một phần** | API `GET /api/taskGroups` có nhóm `wait/doing/review/blocked/backlog/done/cancelled` (`server/routes/inbox.ts:1220-1290`), **không có** "Waiting for others", "Following", "Done 7 ngày". Trang `/my-issues` không gọi API này: dùng `IssueWorkspace` list/board/queue (`client/pages/my-issues/index.tsx:36-41`) | U4 ghi "chưa có trang riêng cho bảng nhóm" (kế hoạch 06/11 mục 7) |
| Badge sidebar đếm việc cần chú ý (20, 24) | | **Có** | `useNavigationCounts` trong `app-layout.tsx` (chenh-lech mục 26), `taskGroups/summary` + `attention` (`client/hooks/use-follow-ups.ts:88-110`) | |
| Ẩn việc Đã huỷ, lọc theo trạng thái (20) | | **Có** | Bộ lọc status của plugin projects trong `issue-workspace.tsx` | |
| Xử lý việc chờ: nghiệm thu, trả lời, run lỗi, bàn giao owner (20, 22) | | **Có** | `client/pages/issues/detail/issue-progress.tsx` (run lỗi retry/reassign/cancel dòng ~148, bàn giao accept/reject ~204, giới hạn lượt ~172); `inbox/waiting` sinh `accept/answer/takeOver/limited/failed` (`server/routes/inbox.ts:350-397`) | |
| Plan chờ xác nhận trong "Waiting for you" (20) | | **Một phần** | Kiểu `plan` được khai báo (`server/routes/inbox.ts:61`) nhưng không có chỗ nào sinh ra; plan chỉ duyệt trong dòng thời gian hội thoại (chenh-lech mục 17) | |
| Undo sau thao tác, giữ vị trí (20) | | **Chưa có** | Không thấy cơ chế undo trong `issue-progress.tsx`, `inbox-page.tsx` | Nhỏ |
| View Split (kéo thanh chia) (20) | | **Chưa có** | `VIEWS = ['list','board','queue']` (`client/pages/issues/issue-workspace.tsx:87`) | |
| View Table: cây việc con (20) | | **Chưa có** | như trên; danh sách phẳng | |
| View Board kéo thả đổi trạng thái (20) | | **Có** | `useBoardMove`, `KanbanBoard` trong `issue-workspace.tsx` | |
| View Agent queue (20, 33) | Làn theo agent: đang chạy, xếp hàng, chờ trả lời, giao mà rảnh | **Có** | `client/pages/issues/agent-queue.tsx`, route `agentBoard/*` (`server/routes/issue-work.ts`) | |
| Nhớ view đã chọn (20) | | **Có** | `readStoredIssueView`/`storeIssueView` (`issue-workspace.tsx`) | |
| Ngôi sao Follow trên header, tối đa 100 (20, 24) | Follow để giữ việc trong danh sách | **Một phần** | Follow/unfollow ở trang `/follow-ups` (`client/pages/follow-ups/index.tsx:70-85`); trên trang việc chỉ có khối Followers = subscribe thông báo (`client/pages/issues/detail/issue-aside.tsx:307-316`), không có ngôi sao ở header | |
| Phím tắt J/K, S, Enter, /, Esc ở My issues (20) | | **Một phần** | Chỉ ⌘K tìm việc (`PmShortcuts`, plugin `pm-shortcut-keys.js`); J/K chỉ có ở Hộp thư (`inbox-page.tsx:379`) | Ít giá trị trên điện thoại |
| Task details: Now / Next / Needs you / Delivery report / Properties (21) | | **Có** | `issue-progress.tsx` (`issueWork.current/next/needsYou`), báo cáo bàn giao = trường `acceptance` (`client/pages/issues/detail/index.tsx:379-384`), `issue-aside.tsx` | |
| Activity: mặc định hội thoại, "All" để xem bản ghi hệ thống (21) | | **Một phần** | Dòng thời gian trộn comment và dòng hệ thống, không có bộ lọc (`issue-activity.tsx:225-290`) | |
| Description, Code & previews, Runs, Subtasks (21) | | **Có** | `issue-pull-requests.tsx`, `issue-preview.tsx`, `issue-runs.tsx`, khối việc con của plugin | Preview: một chỗ Dokploy, cố ý khác (chenh-lech mục 20) |
| Comment / Note / Reply, `@` agent đánh thức (21) | Note ghi lại không đánh thức agent | **Có** | Reply + mention (`issue-activity.tsx:160-290`); Note = comment bắt đầu bằng `/note` (plugin `shared/comments.d.ts:63-64`), hiển thị nhãn note (`issue-activity.tsx:183`) | Không có nút/tab "Note" riêng; phải biết gõ `/note` |
| Ask agent (hội thoại riêng có ngữ cảnh) (21) | | **Có** | `AskAgentButton` + `useChatContextSource` (`client/pages/issues/detail/index.tsx:195,230`) | |
| Run history: transcript (21) | | **Có** | `issue-runs.tsx:25-100` (mở transcript từng run) | |
| Run history: View full prompt, Stop, thời lượng (21) | | **Chưa có** | `issue-runs.tsx` chỉ có trạng thái, agent, giờ tạo, transcript; plugin agents có sẵn hook `useStopRun`, `useRunBrief`, `useRetryRun` (`dist/client/runs/run-hooks.d.ts:25-29`) nhưng Studio không dùng | |
| Retry run lỗi (21, 22) | | **Có** | Thẻ run lỗi + `failedRuns/{id}/decide` (`server/routes/issue-work.ts:1169-1184`) | |
| Thẻ quyết định khi hết retry: retry / reassign / dừng (22) | | **Có** | `issue-progress.tsx` (`['retry','reassign','cancel']`) | |
| Giới hạn lượt chạy do comment 20/24 giờ, admin đổi được, nút Continue (22) | | **Một phần** | Continue có (`issue-progress.tsx` `issueWork.limit.continue`); đổi giới hạn chỉ qua `PATCH /api/projectManager` (`server/routes/project-manager.ts:51`), không có giao diện | |
| Nhận/từ chối bàn giao owner (22) | | **Có** | `issueOwnerHandoffs/{id}/accept|reject` (`server/routes/issue-work.ts:1553-1569`), thẻ trên trang việc và trong Hộp thư (K3.1) | |
| Xác nhận yêu cầu dùng personal runtime (22) | | **Chưa có** | `personalRunnerRequests: []` cố định (`server/routes/issue-work.ts:445`) | Plugin agents có `run request confirm/reject` qua CLI |
| Đọc delivery report (23) | Trước/sau, thay đổi, xác minh, việc còn lại, tiêu chí | **Có** | `acceptance` markdown; cấu trúc do nguyên tắc trưởng nhóm quy định (`server/agents/project-manager-principles.ts:34`) | |
| Merge PR, xác nhận nhánh đích / cách merge / tiêu đề commit (23) | | **Một phần** | Nút Merge (squash) có (`issue-pull-requests.tsx:384`); không có hộp xác nhận chọn method/tiêu đề, không có "xác nhận lại khi có commit mới" | Tự lái merge hầu hết PR |
| Accept việc không có PR (23) | | **Một phần** | Không có nút Accept riêng; owner đổi trạng thái sang Xong ở khối thuộc tính (`issue-aside.tsx:174-185`) | |
| Merge anyway kèm lý do, ghi nhận override (23) | | **Có** | `git.force.*`, `mergeAnyway`, hiển thị `mergeForcedReason` (`issue-pull-requests.tsx:104-146,339,394`) | |
| Send back → In progress (23) | | **Có** | `issueWork.sendBack.*` (`issue-progress.tsx`), route `issues/{id}/sendBack` | |
| Mark as merged (23) | | **Một phần** | Route + CLI `pr mark-merged` (`server/routes/git.ts:2115-2135`); grep `markMerged` trong `client/` không ra | Webhook + poll đã đủ cho GitHub |
| Agent không merge/accept thay người (23, 46) | | **Có** | Route merge chỉ cho người; `requireCloser` chặn agent đóng việc (chenh-lech mục 10, 13) | |

### 1.3 Hộp thư và nhắc nhở (24, 44)

| Tính năng (file docs) | Docs nói gì (1 dòng) | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Inbox mở từ biểu tượng trên top bar (24) | | **Cố ý khác** | Hộp thư nằm ở menu chính (`client/routes.ts:96-103`, chú thích "Dương Sinh: … where every decision waits"; chenh-lech mục 26) | |
| Views All / Needs my decision / Notifications (24) | | **Có** | `?view=todo` + bộ lọc loại (`client/extensions/nocobase-inbox/inbox-page.tsx:124-127`), nguồn quyết định Studio (`client/pages/inbox-decisions.tsx`) | |
| J/K, đánh dấu đã đọc, xoá chỉ ảnh hưởng hộp thư (24) | | **Có** | `inbox-page.tsx:295-407` | Thẻ quyết định Studio không có nút đọc/xoá (K3.1, có chủ ý) |
| Âm thanh khi Studio đang mở (24) | | **Chưa có** | Không có mã phát âm thanh; chỉ có chỗ cắm `inbox-page.tsx:79` | |
| Thông báo desktop khi tab ở nền (24) | | **Chưa có** | grep `Notification.requestPermission` không ra | |
| Push khi đóng trang, đăng ký từng thiết bị (24, 44) | HTTPS + khoá P-256 | **Có (Android/desktop)** | `notificationWebPush` (`client/plugins.ts`, `server/plugins.ts`), `pushConfig` (`server/config/index.ts:64`), `PushPreferences` trong `client/pages/settings/my-notifications.tsx:73-77`; production có khoá VAPID (kế hoạch 06/11 U7) | Production `web_push_subscriptions = 0` (kế hoạch 08/11 L5) — chưa thiết bị nào đăng ký |
| iPhone: thêm vào Home Screen rồi đăng ký (24) | iOS 16.4+, mở từ Home Screen | **Chưa có** | Không có web app manifest: `index.html` không có `<link rel="manifest">`, `public/` không có manifest, grep `pushManifest` trong `server/`, `client/` không ra; README web-push dòng 13: ứng dụng phải tự phục vụ manifest (`pushManifest(...)`) | Nếu Thầy dùng iPhone thì push **không** dùng được tới khi có manifest |
| Không nhắc cho việc đang xem; badge đếm riêng (24) | | **Một phần** | Badge riêng từng mục có; việc "không nhắc khi đang xem" không áp dụng vì không có âm thanh/desktop | |
| Subscribe/unsubscribe việc trong thuộc tính (24) | | **Có** | `IssueFollowers` + `onToggle` (`issue-aside.tsx:307-316`) | |
| Email lời mời và đặt lại mật khẩu qua `mailers` (44) | | **Chưa có (chưa bật)** | `server/config/mailers.ts` rỗng; email Studio là kênh riêng `studio-email` đang tắt (chenh-lech mục 29) | Chờ Gmail App Password |
| Tuỳ chọn thông báo của từng người (44) | | **Có** | `/settings/my-notifications` (`client/routes.ts:352`), `/api/notificationPreferences` (`server/routes/budgets.ts:330`) | Email "Cần tôi quyết định" + báo cáo tuần, push quyết định |

### 1.4 Thiết lập dự án, tri thức, ghi nhớ, tiến độ, mức dùng (25, 26, 27, 28, 33)

| Tính năng (file docs) | Docs nói gì (1 dòng) | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Thành viên dự án, visibility Everyone/Members only, lead (25) | | **Có** | `ProjectMembersEditor` (`client/pages/projects/detail.tsx:116-137`) | `everyone` thay `workspace` (chenh-lech mục 12) |
| Đổi trạng thái, ưu tiên, ngày dự án (25) | | **Có** | `PropertyCard` status/priority/lead/startDate (`detail.tsx:380-465`) | |
| General: tên, mô tả, commit attribution mặc định (25) | | **Một phần** | Tên/mô tả có; attribution cố định: author = người yêu cầu + trailer `Co-Authored-By` agent (`server/providers/git.ts:118-123`), không có tuỳ chọn | |
| Code repositories: gắn repo, repo chính (25) | | **Có** | `client/pages/projects/project-code.tsx` (attach, makePrimary, Thêm CI) | |
| Code repositories: checks, branch rules, previews theo repo (25) | | **Một phần** | API `git/resources/{id}` (chenh-lech mục 28: `branchRules` một luật, `wakeOn*` luôn false); grep `branchRules`, `checksSource` trong `client/` không ra | Chỉ qua API/CLI `git resource` |
| Agent run variables theo project/repo, ẩn sau khi lưu, ghi người xem, chỉ shared runtime (25) | | **Một phần** | Scope `project` đã đăng ký (`server/providers/project-defaults.ts:61`), CLI `variable list/set/reveal/audit` của plugin agents; trang dự án không có khối biến — plugin có sẵn `ScopeVariables` (`dist/client/kit.js:37-46`) nhưng không dùng | |
| Default skills của dự án / repo (25) | | **Một phần** | Skill mặc định cho **dự án mới** (`/settings/project-default-skills`, `client/routes.ts`); sửa skill của dự án đang có: không có giao diện (plugin có `ScopeSkills`, không dùng) | |
| Nối repo có sẵn khi tạo dự án, khởi tạo NocoBase (25) | | **Có** | `/project-setup` + `POST /projectSetups` (chenh-lech mục 28, 30) | Chỉ template `default` |
| Xoá dự án (25) | | **Có** | `ProjectDeleteMenu` (`detail.tsx` ~dòng 290) | |
| Không gian System / Project, tab Knowledge của dự án (26) | | **Một phần** | Không gian `system` + `project` (`server/knowledge/access.ts`, chenh-lech mục 16); dự án chỉ có **liên kết** sang `/knowledge` (`client/pages/projects/project-links.tsx:26`), không có tab | |
| Viết Markdown, tải tệp, trích văn bản PDF/Word/Excel/PPT/CSV, 4 cấp thư mục, phiên bản, verified, archive/restore (26) | | **Có** | Plugin knowledge (`README.md` dòng 3, 33-47; `KNOWLEDGE_MAX_DEPTH` trong `dist/server/services/writes.js:58`), trang `client/pages/knowledge/index.tsx` | Tìm kiếm ngữ nghĩa tắt (cố ý, chờ quyết embedding) |
| Agent gợi ý lưu tệp đính kèm của việc vào KB (26) | | **Chưa có** | grep `saveToKnowledge`, `attachment.*knowledge` không ra; `kb offer` chỉ đề xuất văn bản (chenh-lech mục 28) | |
| Quyền theo space/folder/article/file cho member, role, project member (26) | | **Một phần** | Quyền theo space từ permission set có; **chưa** `registerSubjectProvider` nên không cấp được quyền riêng từng thư mục/tài liệu (chenh-lech mục 16; grep `registerSubjectProvider` trong `server/` không ra) | |
| Đọc project memory: chọn project + repo, lọc loại, tìm, xem file (27) | | **Có** | `client/pages/project-memory/index.tsx`, `/api/projectMemory` | Chỉ đọc nhánh mặc định; không có tab Memory trong dự án (chỉ liên kết, `project-links.tsx:31`) |
| Agent ghi `.nb-studio/memory/` trong PR, ~50 mục, < 4 KB (27) | | **Có** | Brief "Ghi nhớ của dự án", giới hạn 50 file / cờ `oversize` (chenh-lech mục 15) | |
| Project Overview: số việc, phân bố trạng thái (28) | | **Có** | `ProjectMetrics`, `ProjectStatusDistribution` (`detail.tsx`) | |
| Overview: tiến độ release, "next steps" cho thiết lập chưa xong (28) | | **Một phần** | Release: chỉ liên kết `/releases?project=` (`project-links.tsx:38`); không có danh sách "việc thiết lập còn thiếu" | |
| Dashboard theo khoảng ngày, so kỳ trước: việc xong, cycle time, success/rework, can thiệp, chờ hàng đợi, run/việc, mục Attention (28) | | **Có** | `client/pages/dashboard/*` (khoá `dashboard.agents.successRate/reworkRate/interventionRate/queueWait/runsPerIssue`, `dashboard.attention.*`), `reports/*` | |
| Dashboard: chi phí mỗi việc (28) | | **Cố ý khác** | Token/việc thay USD vì dùng gói thuê bao (chenh-lech mục 27) | |
| Usage: nhóm theo agent/người/subject/model/tool/ngày; token, cache, chi phí ước tính; xu hướng ngày (33) | | **Có** | `usageRoute` của plugin agents (`client/routes.ts` agentRoutes; nhãn `usage.*` trong `dist/client/locales/en-US.js:347-401`) | |
| Đặt giá model / công cụ thuê bao (33) | | **Có** | Quyền `agents.prices`, nút "Set prices" (plugin) | Không thấy nhãn "non-billable subscription" trong locale plugin; không ảnh hưởng vì Dashboard dùng token |

### 1.5 Thành viên, vai trò, khoá API, trạng thái và quyền (42, 43, 46)

| Tính năng (file docs) | Docs nói gì (1 dòng) | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Danh sách thành viên, tìm theo tên/username/email, lọc active/disabled (42) | | **Có** | `client/pages/settings/users.tsx:250-335` (`q`, `status`, `roleScope`) | |
| Disable/enable tài khoản, giữ lịch sử (42) | | **Có** | `users.tsx:92-161` | |
| Owner sửa tài khoản người khác (42) | | **Có** | `user-form.tsx` (edit) | |
| Chỉ owner cấp/gỡ owner; owner cuối không gỡ được (42) | | **Có** | `server/routes/access.ts:477-484`; owner = `root` được bảo vệ | |
| Vai trò tuỳ chỉnh: tạo, chỉnh trang/setting/business action theo none/related/all (42) | | **Có** | `/settings/roles` + `role-form.tsx` trên permission set (`client/pages/settings/routes.ts`), `/api/access/roles` | |
| Sao chép (copy) vai trò có sẵn (42) | | **Chưa có** | grep `copy|duplicate|clone` trong `roles.tsx`, `role-form.tsx` không ra | Nhỏ |
| Khoá tổ chức: tạo (tên, hạn, phạm vi), hiện một lần, rotate, disable/enable, xoá (43) | | **Có** | `client/pages/settings/organization-keys.tsx` (create, rotate, enable/disable, delete, `secretOnce`), `server/routes/organization-keys.ts:297-543` | |
| Khoá tổ chức: preset CI deploy / CI upload / Read only; mục đích; thu hẹp tới project/app cụ thể (43) | | **Một phần** | Không có preset (grep `preset` không ra); API nhận `description` nhưng form không có ô; không chọn được bản ghi cụ thể (chenh-lech mục 28) | |
| Lịch sử khoá tổ chức (43) | | **Một phần** | API + CLI `access org-key events` (`organization-keys.ts:535-543`); không có giao diện | |
| Khoá API cá nhân (43) | | **Một phần** | Xem mục 1.1 | |
| Gỡ quyền tạo khoá cá nhân khỏi role (43) | | **Chưa có** | grep `setOwnKeyPolicy` trong `server/` không ra (plugin api-keys hỗ trợ) | |
| Trạng thái cố định Backlog → In progress ⇄ In review → Done, Blocked, Canceled (46) | | **Có** | Plugin projects `FIXED_STATUSES`; nhãn tiếng Việt `docs/thuat-ngu.md` | |
| Start giao việc backlog cho Lead (46) | | **Có** | `projectManager/issues/{id}/start` (`server/routes/issue-work.ts:1036`), nút `issueWork.handToManager` | |
| Lead đổi trạng thái, execution agent thì không (46) | | **Có** | `mayMove` chỉ cho executor; chenh-lech mục 8, 10 | |
| Quyền mặc định Member/Admin (46) | | **Có** | Seed `ds-admin`, `ds-contributor` + `projects-access.ts` | |
| Quyền của agent: theo người đại diện ∩ thao tác cho agent; không merge/accept/quản lý thành viên; KB chỉ đọc (46) | | **Có** | `runKeyScope` (chenh-lech mục 9, 24), agent chỉ đọc/đề xuất KB (mục 16) | |

### 1.6 CLI (47)

| Tính năng (file docs) | Docs nói gì (1 dòng) | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| `login --server …/main`, duyệt trên trình duyệt, `--no-browser` (47) | | **Có** | `deviceAuthorization` + `/device` (`server/config/auth.ts:24-29`, `client/routes.ts:136`); cờ `no-browser` trong `@nocobase/app-cli-client/dist/login.js` | `docs/trien-khai-vps.md:99` vẫn ghi "chưa có đăng nhập trình duyệt" — tài liệu cũ |
| `whoami`, `whoami --missing`, `docs`, `--help`, `--json` (47) | | **Có** | `app-cli-client/dist/whoami.js` (có `missing`), `docs.js` | |
| `skills install` (47) | Cài skill hướng dẫn agent cục bộ dùng CLI | **Chưa có** | `package.json` `nocobase.cli` không có `skills` (chỉ `bin`, `displayName`, `envPrefix`); README app-cli-client: chỉ gói có `skills/<slug>/SKILL.md` mới có lệnh này | |
| `profile list/use`, `logout` (47) | | **Có** | `app-cli-client/dist/profile.js`, `logout.js` | |
| Biến môi trường cho script/CI không cần trình duyệt (47) | `NB_STUDIO_SERVER`, `NB_STUDIO_API_KEY` | **Cố ý khác** | `envPrefix: DS_STUDIO` → `DS_STUDIO_SERVER`, `DS_STUDIO_API_KEY` (chenh-lech mục 4) | |
| `update --check`, `update` (đồng bộ skill) (47) | | **Một phần** | Lệnh có (`update.js`, cờ `--check`); bản phân phối qua `/api/agents/dist/installScript`. Kế hoạch 06/11 U1 ghi `version` từng kẹt ở beta.86 nên không có bản mới để tải — nay `package.json` là `1.0.0-beta.88` | Không có skill để đồng bộ |
| Nhóm `issue, comment, attachment, project, label` (47) | | **Có** | Lệnh của plugin projects + Studio (`issue …`, `project setup …`, `project default-skills …`) | |
| Nhóm `project-manager, agent, runtime, skill, variable, run` (47) | | **Có** | Lệnh của plugin agents (README agents dòng 247); `board …`, `issue manager-start` | `project-manager` GET/PATCH không có `cliRoute` riêng trong `server/routes/project-manager.ts` (grep `command` không ra) |
| Nhóm `kb, memory` (47) | | **Có** | `kb search/read/list/download/offer/tree`, `memory list/get/read` | |
| Nhóm `git, pr, commit` (47) | | **Có** | `git …`, `pr open/list/get/merge/refresh/checks/check-merge/mark-merged/update`, `commit checks`, `check report` | |
| Nhóm `quality` (47) | Kế hoạch chất lượng đã bật | **Chưa có** | grep `quality` trong `server/`, `client/` không ra; không có trong phụ lục beta.71 → tính năng mới của upstream; 18 file docs này không mô tả chi tiết | Xem nhóm tài liệu checks (34/35) của agent khác |
| Nhóm `app, deploy, env, release, build` (47) | | **Có (tên khác)** | `app ensure`, `build …`, `release …`, `version …`, `environment list`, `preview …` | `env` → `environment`; Host chưa bật (chenh-lech mục 28) |
| Nhóm `session, conversation` (47) | | **Có** | Lệnh của plugin agents/agent-sessions | |
| Nhóm `user, access, api-key` (47) | | **Có** | `user …` (plugin users), `access …` + `access org-key …` (Studio), `api-key …` (plugin api-keys) | |

## 2. Phát hiện ngoài bảng (đáng chú ý)

1. **Có thể đang mở tự đăng ký trên production.** `deploy/dokploy/config.yml` không đặt `auth.emailAndPassword.disableSignUp: true`; Better Auth mặc định cho đăng ký và trang `/register` chỉ ẩn khi server báo tắt. Chưa kiểm production (việc chỉ-đọc: mở `https://studio.dsc.edu.vn/main/register` xem có form không). Người tự đăng ký không có vai trò nào, nhưng vẫn vào được các trang `authz: 'skip'`. Nên kiểm và sửa trước mọi việc khác; cần thử lời mời vẫn tạo tài khoản được sau khi tắt (plugin users tạo tài khoản qua dịch vụ quản trị, không qua `sign-up/email`, nhưng phải có test).
2. **`docs/trien-khai-vps.md:99-100` sai hai chỗ**: (a) đăng nhập trình duyệt cho CLI nay đã có (`deviceAuthorization`, `/device`); (b) "tạo khoá ở trang tài khoản" — không có trang tài khoản. Hiện chỉ tạo khoá cá nhân được bằng `POST /api/auth/api-key/create` hoặc `ds-studio api-key create` sau khi đã đăng nhập.
3. **Plugin đã có sẵn thành phần giao diện mà Studio chưa dùng**: `InviteDialog`, `InvitationsSection` (projects kit), `ScopeVariables`, `ScopeSkills` (agents kit), `useStopRun`, `useRunBrief`, `useRetryRun` (agents runs). Đây là các việc rẻ nhất trong danh sách.
4. Push đã có khoá VAPID nhưng **0 thiết bị đăng ký**; trên iPhone không đăng ký được vì thiếu manifest.

## 3. Đáng làm cho Dương Sinh

Bối cảnh: một chủ dự án (Thầy Tường) giám sát agent chủ yếu từ điện thoại; 1–3 cộng tác viên trong tương lai; khoảng 6 app NocoBase 3 nhỏ.
Xếp theo giá trị trên công sức. Công sức là ngày làm của agent, gồm test theo `AGENTS.md` (route 401/403/thành công, test trang).

| # | Việc | Giá trị | Công sức | Phụ thuộc | Rủi ro |
| --- | --- | --- | --- | --- | --- |
| 1 | **Kiểm và tắt tự đăng ký**: `disableSignUp: true` trong `deploy/dokploy/config.yml` (dev giữ nguyên nếu test cần); test: `sign-up/email` bị từ chối, lời mời vẫn nhận được | **Cao** (an ninh) | 0,25 | Chủ dự án đồng ý cập nhật production | Thấp; nếu lời mời cũng bị chặn thì test sẽ lộ ra trước khi lên production |
| 2 | **Manifest PWA** (`pushManifest` của plugin web-push, `<link rel="manifest">`, icon 192/512, `apple-touch-icon`, `display: standalone`) rồi hướng dẫn Thầy đăng ký push trên điện thoại | **Cao** nếu Thầy dùng iPhone; vừa nếu Android (push Android đã chạy, chỉ cần đăng ký) | 0,5 | HTTPS (đã có), khoá VAPID (đã có) | Thấp; đổi khoá VAPID sau này buộc đăng ký lại |
| 3 | **Giao diện mời thành viên** bằng `InviteDialog`/`InvitationsSection` của plugin projects (Settings › Người dùng và/hoặc khối Thành viên của dự án), nút Sao chép link khi không có email | **Cao** khi có cộng tác viên đầu tiên | 0,5–1 | Nên làm sau #1 | Thấp; quyền `pm.members invite` đã có trong plugin |
| 4 | **Vai trò mặc định + owner đặt lại mật khẩu** trên giao diện (`PUT /api/access/settings`, `POST /api/users/{id}/resetPassword`) | Vừa (không có email thì đây là đường khôi phục duy nhất cho nhân viên) | 0,5 | #3 | Thấp; giữ luật "Visible and manageable role assignments" (hiện người nhận vai trò mặc định) |
| 5 | **Run history đầy đủ trên trang việc**: Stop, View full prompt, thời lượng, Retry (hook có sẵn của plugin agents) | Vừa: dừng run chạy sai và xem agent được dặn gì, ngay trên điện thoại | 0,5–1 | Không | Thấp |
| 6 | **Trang Tài khoản của tôi**: hồ sơ (tên, username), đổi mật khẩu, khoá API cá nhân (list/create/rotate/delete trên `/api/apiKeys`, hiện secret một lần) | Vừa (khoá cá nhân cho script; sửa luôn `docs/trien-khai-vps.md`) | 1–1,5 | Không | Thấp; khoá chỉ quản lý được bằng phiên đăng nhập (plugin đã chặn) |
| 7 | **Trang chủ = việc của tôi**: đổi Home của template thành tóm tắt "Cần tôi quyết định / Đang làm" (dùng `taskGroups/summary`, `inbox/waiting`), hoặc chuyển hướng sang `/inbox` | Vừa cho điện thoại (bớt một lần chạm) | 0,25–0,5 | Không | Thấp; Home dùng `authz: 'skip'`, chỉ hiện dữ liệu server đã lọc |
| 8 | **My issues gom nhóm** theo `taskGroups` (Chờ bạn / Đang làm / Chờ người khác / Chờ làm / Xong 7 ngày), một cột trên điện thoại; thêm nhóm "Chờ người khác" và "Xong 7 ngày" ở server | Vừa (Hộp thư đã che phần lớn "Chờ bạn") | 1,5–2 | Không | Vừa: đụng `issue-workspace.tsx` dùng chung với `/issues` |
| 9 | **Biến chạy agent và skill trên trang dự án** (`ScopeVariables`, `ScopeSkills` của plugin agents, scope `project` đã đăng ký) | Vừa: ~6 app, bí mật mỗi app hiện chỉ đặt bằng CLI | 0,5–1 | Không | Vừa: lộ bí mật nếu quyền sai; plugin đã ghi audit lần reveal |
| 10 | **Nút soạn Note** (chèn `/note`) và bộ lọc "Chỉ hội thoại / Tất cả" trong Activity | Thấp–vừa (người mới không biết `/note`) | 0,5 | Không | Thấp; có thể phải chú thích vì sửa extension UI Library |
| 11 | Đổi giới hạn lượt chạy do comment trên giao diện (`PATCH /api/projectManager`) | Thấp–vừa | 0,25–0,5 | Không | Thấp |
| 12 | Khoá tổ chức: ô "Mục đích", preset (CI deploy / CI upload / Chỉ đọc), xem lịch sử (`events`) | Thấp–vừa (vài khoá CI cho ~6 repo) | 0,5 | Không | Thấp |
| 13 | Gói skill `ds-studio` cho Claude Code/Codex trên máy (`nocobase.cli.skills` + `skills/<slug>/SKILL.md`) để `ds-studio skills install` chạy được | Vừa nếu Thầy dùng agent cục bộ với Studio; thấp nếu chỉ dùng runner VPS | 1 | Phát hành lại CLI (`version` + dist) | Thấp |
| 14 | Quyền theo thư mục/tài liệu trong KB (`registerSubjectProvider` cho `user`, `role`) | Thấp hôm nay, vừa khi giáo viên/cộng tác viên đọc KB có tài liệu nhạy cảm (học phí, hồ sơ học viên) | 1–1,5 | Không | Vừa: lọc quyền trong tìm kiếm và snapshot của run |
| 15 | Âm thanh / thông báo desktop trong tab (chỗ cắm `inbox-page.tsx:79`) | Thấp (điện thoại dùng push) | 0,5–1 | Không | Thấp |

Đề xuất gom thành ba PR nhỏ theo thứ tự: (A) #1 + #2 — an ninh và push điện thoại, khoảng 0,75 ngày; (B) #3 + #4 + #7 — sẵn sàng đón cộng tác viên, khoảng 1,5 ngày;
(C) #5 + #6 — giám sát run và tài khoản, khoảng 2 ngày. Phần còn lại làm khi có nhu cầu thật.

## 4. Không đáng làm (hoặc chưa), và vì sao

| Việc | Lý do |
| --- | --- |
| View Split kéo thanh chia, View Table cây việc con, phím tắt J/K/S/Enter/Esc ở My issues | Dành cho bàn phím, màn hình rộng; Thầy dùng điện thoại; ⌘K đã có |
| Undo sau thao tác, giới hạn 100 việc follow | Ít việc, một người; giá trị gần bằng 0 |
| Xác nhận yêu cầu dùng personal runtime | Chỉ có runner VPS dùng chung; không ai mượn runner của người khác |
| Chi phí theo USD mỗi việc, công cụ "non-billable subscription" | Đã chủ ý dùng token/việc vì gói thuê bao (chenh-lech mục 27) |
| Commit attribution theo dự án/từng người; Git cá nhân OAuth/device flow cho commit và merge đứng tên | Một chủ, một tài khoản GitHub `covuaduongsinh`; GitHub App đã đủ, thêm OAuth là thêm bí mật phải giữ |
| Hộp xác nhận merge (method, nhánh, tiêu đề, xác nhận lại khi có commit mới) | Tự lái merge squash là luồng chính; nút Merge anyway đã ghi lý do |
| "Mark as merged" trên giao diện | Webhook App + poll đã ghi nhận; CLI `pr mark-merged` đủ cho ca hiếm |
| Preset/thu hẹp khoá tổ chức tới từng App, gỡ quyền tạo khoá cá nhân theo role | Rất ít khoá, ít người; chờ có cộng tác viên dùng khoá mới cần |
| Lưu tệp đính kèm của việc vào KB do agent gợi ý | Hiếm dùng; người tải thẳng lên KB được |
| Nhóm CLI `quality` | Tính năng mới của upstream, tài liệu nhóm này không mô tả chi tiết; chờ đọc docs checks (34/35) rồi mới quyết |
| Tab Knowledge/Memory/Release nhúng trong trang dự án | Đã có liên kết lọc sẵn theo dự án (`project-links.tsx`); nhúng tab chỉ tiết kiệm một lần chạm |
| Tìm kiếm ngữ nghĩa, OCR trong KB | Tốn tiền embedding, chủ dự án chưa quyết (kế hoạch 06/11 mục 2) |
| Trang lời mời và quên mật khẩu qua email | Chỉ đáng khi có Gmail App Password (việc của chủ dự án ở L5); trước đó dùng link mời (#3) và owner đặt lại mật khẩu (#4) |
| Mật độ giao diện (density) | Không ảnh hưởng công việc |

## 5. Những gì chưa kiểm được

- Không chạy ứng dụng, không gọi production: mọi kết luận về production (tự đăng ký, push, email) suy ra từ cấu hình trong repo và số liệu kế hoạch 08/11.
- Chưa mở giao diện plugin (Usage, Agents, Roles) trong trình duyệt; trạng thái dựa trên mã `dist` và locale của plugin.
- Không chạy test nào (việc chỉ đọc).
