# Hoàn thiện Dương Sinh Studio theo ảnh demo L2 (đợt P)

> Trạng thái: đã duyệt 10/11/2026. Prompt triển khai: `2026-11-10-prompt-trien-khai-demo-l2.md`. Đặc tả API demo: `research/2026-11-10/dac-ta-demo-rea.md`.

## 1. Bối cảnh

Chủ dự án chụp 49 ảnh demo NocoBase Studio (`docs/pictures/demo nocostudio L2/Screenshot_11…59.png`, demo
`v1.0.0-beta.75`) và muốn Dương Sinh Studio hoàn thiện tiếp theo đó. Studio đang ở template `1.0.0-beta.89`
(agents 2.0.0-beta.6, projects 0.1.0-beta.26, releases 0.1.0-beta.19, agent-sessions 1.0.0-beta.19), production chạy ổn.
Đối chiếu ảnh với mã cho thấy phần lớn trang đã có nhưng lệch bố cục, và có việc đang làm dở chưa commit.

**Trạng thái checkout (10/11/2026):** `D:\code\duongsinh-studio` ở `main` `07c57ab`, đi trước WSL (`98218b5`, đang đứng
trên nhánh rỗng `feat/github-app-labels-secrets`). Việc dở chỉ có ở `D:\`, chưa commit:
`client/pages/sessions/` (~60%), `client/pages/issues/issue-split-view.tsx` (~50%),
`client/pages/issues/issue-workspace.tsx` (~85%), `client/pages/issues/detail/index.tsx`, `client/routes.ts`,
`client/lib/navigation-transform.ts`, ba tệp locale, `docs/pictures/`.

## 2. Quyết định chủ dự án đã chốt (10/11/2026)

| #   | Quyết định                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Đảo ba mục "không làm" của kế hoạch M (08/11): làm **chi phí USD** trên Dashboard, làm **Mark as merged + Xem thay đổi**, đổi **Cài đặt sang sidebar riêng** như demo. Khung chia đôi + phím tắt cũng làm (đang dở). |
| Q2  | Triển khai ở **WSL**. Trước đó đưa phần dở ở `D:\` lên một nhánh và push.                                                                                                                                            |
| Q3  | Trang của plugin (Agents, Runtimes, Skills, Usage, Knowledge, danh sách Projects): **chỉ đối chiếu**, sửa qua option/bản dịch, ghi chênh lệch; không viết lại.                                                       |
| Q4  | Chi tiết issue **theo demo**: tab, chip thuộc tính, Báo cáo bàn giao, đầu trang dính, gộp bản ghi hệ thống.                                                                                                          |

## 3. Bảng đối chiếu ảnh ↔ hiện trạng

| Trang (ảnh)                                                 | Hiện trạng                                                                               | Thiếu so với demo                                                                                                                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard (11–14)                                           | `client/pages/dashboard/*`, đọc `/api/reports/*`                                         | Ô thứ 4 là token chứ chưa phải USD; biểu đồ lượt chạy là cột chứ chưa phải vùng; bảng dự án chưa có thanh tiến độ                                                                                                |
| My issues (15–26)                                           | `my-issues/index.tsx` + `issue-workspace.tsx` + `issue-split-view.tsx`                   | Nhóm thu gọn được, chọn lưu trong URL, "1 / 21" trước/sau, phím J/K/S/Enter//, khóa trạng thái đoán sai (`in-progress` thay vì `in_progress`, `in_review`, `blocked`, `cancelled`)                               |
| Chi tiết issue (15–22)                                      | `issues/detail/index.tsx`, `issue-aside.tsx`, `issue-activity.tsx`, `IssueProgressPanel` | Tab; chip thuộc tính; nút Theo dõi ở đầu; thẻ "Cần bạn" thiếu Mark as merged / Xem thay đổi / liên kết giải thích của Lead Agent; khối Báo cáo bàn giao; gộp "N bản ghi hệ thống"; đầu trang dính + Về đầu trang |
| My sessions (27–28)                                         | `sessions/index.tsx` (route `/sessions`) + plugin agent-sessions                         | Khung phải (Issues / Phiên / Mức dùng); chip agent + dự án; khóa i18n thiếu; import thừa làm hỏng lint; trùng với menu "Agent của tôi" của plugin                                                                |
| Issues (29–33)                                              | `components/issue-table.tsx` (bảng phẳng)                                                | Nhóm theo trạng thái (Chờ bạn / Đang làm / Đang duyệt / Bị chặn / Tồn đọng / Xong); cột Dự án; dấu "Agent đang làm", PR/CI, tiến độ việc con, "Chờ điều kiện trước"; lọc trạng thái                              |
| Projects (34–36)                                            | Danh sách của plugin; `projects/detail.tsx` không tab                                    | Tab Tổng quan / Issues / Tri thức / Bộ nhớ / Thành viên / Phát hành / Cài đặt; thẻ "Bước tiếp theo"; nút Issue mới                                                                                               |
| Knowledge (37), Project memory (38)                         | Plugin / đã đủ                                                                           | Chỉ đối chiếu                                                                                                                                                                                                    |
| Releases (39)                                               | `releases/index.tsx`, 4 tab đã có                                                        | Danh sách dự án bên trái kèm phiên bản + số issue chờ phát hành                                                                                                                                                  |
| Hosted environments (40)                                    | `environments/index.tsx`, đủ 7 cột                                                       | Nút Thêm môi trường (chỉ làm nếu plugin releases có API ghi; nếu không thì ghi chênh lệch)                                                                                                                       |
| Agents, Runtimes, Skills, Usage + Set prices (41–44, 56–59) | Plugin agents                                                                            | Chỉ đối chiếu; thẻ Lead Agent: thêm lối tắt từ `/agents` sang `settings/project-manager` nếu plugin có chỗ cắm                                                                                                   |
| Settings (45–55)                                            | Trang thẻ `/settings` (`pages/settings/shell-routes.ts`)                                 | Sidebar riêng: Không gian làm việc (Chung, Nhãn) · Thành viên & quyền (Thành viên, Vai trò, API key) · Tích hợp (Git) + nút Quay lại; số người giữ mỗi vai trò                                                   |
| Khung (15–18)                                               | `layouts/*`, `lib/navigation-transform.ts`                                               | Biểu tượng phiên + hộp thư (kèm số chưa đọc) ở đầu trang; huy hiệu My sessions; menu avatar thêm "Tài khoản" và "Dùng Studio trong agent của bạn"                                                                |

**Không làm:** Demo Mode, chuyển tài khoản demo, trang License (chỉ có nghĩa với bản demo/thương mại); viết lại trang plugin;
KB semantic search; runtime cá nhân/ACP. Giữ thương hiệu Dương Sinh và tiếng Việt là chính.

## 3b. Đặc tả demo bằng REA (10/11/2026)

Nguồn: 30+ lượt `capture_browser_scenario` của REA trên `studio.demo.nocobase.com` (chỉ đọc, không bấm nút ghi). Thân phản hồi
chỉ giải mã phần đầu nên danh sách trường là **quan sát được nhưng chưa đủ**; mục "chưa bắt được" phải làm bù ở P0b.
Bản đầy đủ chép vào `docs/plans/research/2026-11-10/dac-ta-demo-rea.md`. Mọi đường dẫn dưới `/api/`.

| Trang          | Demo gọi                                                                                                                                                                                                                                                                                                                                                                          | Bên ta                                                                                                                                            | Hệ quả cho kế hoạch                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard      | `reports/delivery\|agents\|projects?days=7\|30\|90`, `reports/attention`; `delivery.current.costPerIssue{USD}`                                                                                                                                                                                                                                                                    | Cùng đường dẫn; `server/reports/service.ts` **đã trả `costPerIssue`** (tính từ giá của plugin agents)                                             | P5 không cần sửa server, chỉ sửa client                                                                                                                          |
| My issues      | `taskGroups?involvesUserId&mode=split&follow=all` → `groups[{group,count,data[{dependencyWait,blockers,issue{statusKey,needsYou,next,acceptance}}]}]`; chọn lưu `?issue=<id số>`                                                                                                                                                                                                  | `taskGroups` có sẵn nhưng thiếu `follow`, dòng trả `waits/followed`; khung chia đôi lại đọc `useIssuePages` của plugin                            | P1 chuyển khung chia đôi sang `taskGroups`, thêm `follow` và các trường dòng                                                                                     |
| Chi tiết issue | `projects/issues/:id` (`activities[]`, `threads[{root,replies}]`), `issuePanels/:id` (`progress{state,needsYou,explanationCommentId,next,handOver}`, `ownerHandoff`, `pullRequests.data[]{mergeability,ciState,checks[]}`), `projects/issues/:id/screenshots`, `agents/runs?subjectKind=issue&subjectId&status=…`, `agents/runAgents`, `followUps/issues/:id/markSeen`            | `issuePanels`, `followUps` trùng; lượt chạy ta dùng `issueRuns`                                                                                   | P2: Báo cáo bàn giao = markdown `issue.acceptance` + ảnh `screenshots`; liên kết giải thích dùng `explanationCommentId`; không cần endpoint mới cho các khối này |
| Issues         | `taskGroups?mode=table&follow=scope`, `projects/issues/statuses`, `POST agentBoard/issueWork {issueIds}`; `?view=board\|agent` (bảng không có tham số)                                                                                                                                                                                                                            | Có `taskGroups`, `agentBoard/issueWork`; giá trị view là `split\|list\|board\|queue`                                                              | P3 dựng bảng nhóm từ `taskGroups`; giữ giá trị view của ta, ghi chênh lệch                                                                                       |
| My sessions    | `agents/conversations?archived=false` (`links[].view{key,title,status}`, `needsYou{reason,seq,text}`, `execution.status`, `lastSeq/seenSeq`), `…/:id/messages` (parts `text` / `dynamic-tool`), `…/:id/usage` (`inputTokens,cacheReadTokens,outputTokens,runs,costUsd`), `projects/issues/summaries?refs=`, `agents/chatAgents`; lọc All/Needs me/In progress **tại trình duyệt** | Trang dở chưa gọi `usage`, `summaries`; đoán trạng thái bằng dò chữ                                                                               | P4 dùng đúng các trường này; "Ran N lệnh" = gom các part `dynamic-tool`                                                                                          |
| Dự án          | Tab là đoạn đường dẫn `/projects/:id/{overview,issues,knowledge,memory,members,releases,settings}`, Cài đặt dùng `?section=`; `projectSetups/:id` (Bước tiếp theo), `deploys/projects/:id/unreleasedIssues`, `repositoryDeployments/:repoId/ci/connection`, `knowledge/spaces?scope=project&scopeId`, `projectMemory/:pid/repos/:rid`, `git/projects/:id`                         | Các đường dẫn server phần lớn đã có; `detail.tsx` là một trang                                                                                    | P6 tách route con theo đúng sơ đồ này                                                                                                                            |
| Phát hành      | `deploys/hubCounts`, `deploys/versionPipelines`, `deploys/pendingVersionTasks`, `deploys/pipelines`, `deploys/deploymentRecords`, `deploys/versions`; `?tab=`, `?project=`                                                                                                                                                                                                        | Có `hubCounts`, `pendingVersionTasks`, `deploymentRecords`, `versions`; **chưa có** `versionPipelines`, `pipelines`; client chưa dùng `hubCounts` | P6: số đếm tab lấy `hubCounts`; danh sách trái cần `versionPipelines` (thêm route)                                                                               |
| Môi trường     | `releases/environments`, `releases/drivers`, `releases/hosts`, `releases/me` (plugin releases)                                                                                                                                                                                                                                                                                    | Chỉ đọc `deploys/environments`                                                                                                                    | P6: Thêm môi trường dựa trên API plugin, form theo `drivers[].configSchema`                                                                                      |
| Agents         | `projectManager` (GET/PATCH) cho thẻ Lead Agent, `agents`, `agents/runners`, `agents/skills`                                                                                                                                                                                                                                                                                      | `projectManager` trùng, đang ở trang cài đặt riêng                                                                                                | P8                                                                                                                                                               |
| Usage          | `agents/usage?from&to&groupBy&series=true` (dòng có `cost{USD}`, `pricedRuns`; `daily[].series`), `agents/prices` (`items[]`, `subscriptions[]`)                                                                                                                                                                                                                                  | Trang của plugin; `/api/reports/usage` của ta bỏ `daily[].series`                                                                                 | Chỉ đối chiếu                                                                                                                                                    |
| Cài đặt        | Sidebar `/config`: Không gian làm việc (General, Labels) · Thành viên & quyền (Members, Roles, API keys) · Tích hợp (Git); `projects/settings{issuePrefix}`, `access/settings{defaultRole}`, `access/roles`, `access/members`, `users?status=enabled`, `organizationKeys`, `git/connections`                                                                                      | API trùng; trang nằm ở `/settings/issue-prefix`, `new-member-role`, `issue-labels`, `users`, `roles`, `organization-keys`, `git`                  | P7 giữ đường dẫn và id trang của ta, chỉ đổi điều hướng; gộp tiền tố + vai trò mặc định vào một trang "Chung"                                                    |
| Khung          | `attention` (`counts{tasks,sessions}`), `inbox/pending{decision,info}`; ws `/main/ws` với topic `agents:conversations`, `studio:conversations:attention`, `studio:inbox`, `studio:issues:runs`, `studio:git`, `pm:changes`                                                                                                                                                        | `attention`, `inbox/pending` trùng                                                                                                                | P7 huy hiệu đọc `attention.counts`; kiểm tra các trang mới có đăng ký topic tương ứng                                                                            |

**Chưa bắt được (làm bù ở P0b):** tab "Code & previews"; bộ lọc trạng thái trang Issues; các mục trong tab Cài đặt của dự án
và ý nghĩa `edit=checks`; thân đầy đủ của `taskGroups`, `knowledge/spaces`, `agents`; tham số bộ lọc Project/Agent/Người ở Usage.

## 4. Các bước

Mỗi bước: một nhánh `feat/p<N>-<slug>` → một PR → CI xanh → gộp. Test viết trước, đặt trong `tests/`.

**P0b — Đặc tả bù và đường cơ sở so sánh** (sau P0, trước P1; không đổi mã ứng dụng)

- REA: chạy lại các lượt còn thiếu ở mục 3b với `max_network_body_bytes` lớn hơn, lưu kết quả ra tệp rồi dùng `jq`/script để
  giải mã base64 và ghi đủ trường vào `docs/plans/research/2026-11-10/dac-ta-demo-rea.md`. Chỉ đọc, không bấm nút ghi.
- Craft Anything (`D:\code\craft-anything`, chế độ **Clean room** mặc định): `craft-anything-cli doctor`; chụp demo ở ba bề rộng
  cho từng trang trong bảng mục 3 (ảnh, văn bản hiển thị, bố cục đo được, màu, phông, khoảng cách) vào
  `docs/plans/research/2026-11-10/craft/` — đây là đường cơ sở. **Không** dùng lệnh `rebuild` để sinh mã: Studio là ứng dụng
  NocoBase 3, mã do phiên triển khai viết theo AGENTS.md. Sau mỗi bước P1–P7 dùng phần so sánh (Check) của nó giữa trang
  dev của ta và đường cơ sở, ghi điểm giống nhau vào báo cáo bước.
- Nếu CLI chưa cài (`cargo install --path apps/craft-anything-cli`, cần Rust ≥ 1.97) thì hỏi chủ dự án trước khi cài.

**P0 — Đồng bộ và cứu phần dở** (làm ở `D:\`, rồi sang WSL)

- `D:\`: tạo nhánh `feat/demo-l2-wip` từ `main`, `git add` theo từng đường dẫn (không `-A`), commit phần dở + `docs/pictures/`
  - hai tệp kế hoạch; push `main` (`07c57ab`) và nhánh.
- WSL: xem `git status` của `feat/github-app-labels-secrets` (nếu có thay đổi thì hỏi chủ dự án), `git fetch`, đưa `main` lên
  `07c57ab`, checkout `feat/demo-l2-wip`.
- Sửa cho xanh: khóa i18n thiếu (`sessions.*`, `issues.groups.*` ở cả vi/en/zh), import thừa, deps `useMemo`
  (`issue-split-view.tsx:135`), khóa trạng thái đúng của plugin. Gộp thành PR đầu tiên.

**P1 — My issues: khung chia đôi hoàn chỉnh**

- Nguồn dữ liệu: đổi từ `useIssuePages` sang `/api/taskGroups?mode=split&follow=all&involvesUserId=<tôi>`; server
  (`server/routes/inbox.ts`) thêm tham số `follow` (`all|scope`) và các trường dòng `dependencyWait`, `blockers`,
  `issue.needsYou|next|acceptance` theo mục 3b; gom bảy nhóm của ta thành bốn nhóm hiển thị (Chờ bạn / Đang làm / Tồn đọng / Xong).
- `issue-split-view.tsx`: nhóm thu gọn (nhớ theo người dùng), chọn issue lưu ở `?issue=<id>`, đầu khung có ↑ ↓ và "n / tổng".
- Phím tắt: mở rộng `PmShortcuts` hiện có (đang có `C`, ⌘K) thêm J/K, S, Enter, `/`; dải gợi ý phím ở chân danh sách.
- Test: `tests/client/issue-split-view.test.tsx` dựng từ `tests/client/page-harness.test.tsx`.

**P2 — Chi tiết issue theo demo**

- `issues/detail/index.tsx` tách thành tab Hoạt động / Mô tả / Mã & xem thử / Lượt chạy (tái dùng các khối sẵn có: PR, preview,
  release, runs, acceptance); thuộc tính từ `issue-aside.tsx` thành hàng chip + "Thêm thuộc tính".
- Đầu trang: trạng thái, nút Theo dõi (dùng API followers đang có ở `issue-aside.tsx:320`), Hỏi agent, menu "…".
- Thẻ "Cần bạn" (`IssueProgressPanel`): thêm **Xem thay đổi** (mở PR), **Đánh dấu đã merge**, liên kết "Giải thích mới nhất của
  Lead Agent" (cuộn tới bình luận agent cuối).
- Khối **Báo cáo bàn giao** dựng từ trường `acceptance` (Kết quả / Bằng chứng / ảnh đính kèm).
- `issue-activity.tsx`: gộp các dòng hệ thống liên tiếp thành "N bản ghi hệ thống" mở ra được; giữ nút "Tất cả / Chỉ trao đổi".
- Đầu trang dính khi cuộn: trạng thái + tiêu đề rút gọn + Merge + Về đầu trang.
- Server: thêm hành động đánh dấu đã merge trong `server/routes/git.ts` (cạnh merge sẵn có; migration
  `202611100007_ds_git_pr_completion` đã có cột hoàn tất PR — đọc trước, chỉ thêm migration mới nếu thiếu cột), có
  `describeRoute`, `auth.required()`, kiểm quyền, test 200/401/403 trong `tests/server/`.

**P3 — Issues: bảng nhóm**

- `components/issue-table.tsx`: nhóm theo trạng thái có thu gọn và số đếm, nhóm "Chờ bạn" trên cùng; cột Dự án; dấu hiệu trên
  dòng lấy từ `/api/taskGroups/rows|children` và `issue-work` (agent đang làm, PR/CI, việc con n/m, chờ điều kiện trước);
  bộ lọc trạng thái. Không thêm endpoint nếu dữ liệu đã có; nếu thiếu thì mở rộng `server/routes/inbox.ts`.

**P4 — My sessions**

- `sessions/index.tsx`: thêm khung phải — Issues từ `projects/issues/summaries?refs=` (dùng `statusKey`, bỏ cách dò chữ trong
  `link.view.status`), thông tin phiên, mức dùng từ `agents/conversations/:id/usage` (`inputTokens`, `cacheReadTokens`,
  `outputTokens`, `costUsd`); chip agent và dự án ở đầu hội thoại; "Cần bạn" theo `needsYou{reason,text}`, chưa đọc theo
  `lastSeq/seenSeq`; lọc Tất cả / Cần tôi / Đang chạy tại trình duyệt (`execution.status`). Sửa việc tra khóa `sessions.*` qua
  hàm dịch của chat (`:604`) và đếm "Cần bạn" (`:490`). Đăng ký topic ws `agents:conversations`, `studio:conversations:attention`.
- Composer, "Ran N commands", liên kết `#issue`: dùng đúng những gì `ConversationView` của plugin agent-sessions cung cấp
  (đọc skill `nocobase-app-plugin-agent-sessions`: `registerLinkKind`, `registerProjects`); không tự viết lại.
- Chỉ để một mục menu: "Phiên của tôi" trỏ `/sessions`; ẩn mục trùng của plugin qua option, không khai báo lại route của nó.
- Huy hiệu số phiên cần mình trên sidebar (`layouts/app-layout.tsx:51-57`).

**P5 — Dashboard**

- Server không đổi: `/api/reports/delivery` đã trả `costPerIssue` (bản đồ tiền tệ, `server/reports/service.ts`) cho kỳ hiện tại,
  kỳ trước và từng `bucket`. Chỉ bổ sung test trong `tests/server/report-figures` cho trường hợp chưa đặt giá / công cụ thuê bao.
- Client: ô thứ 4 thành Chi phí mỗi issue (USD, có sparkline từ `buckets`; token giữ ở chú thích; chưa có giá thì hiện
  "Chưa đặt giá" kèm liên kết sang Usage), biểu đồ vùng xếp chồng (`runs-chart.tsx`), thanh tiến độ ở bảng dự án.
  Ghi ở `docs/chenh-lech-upstream.md` rằng mục "cố ý khác: token" đã bỏ.

**P6 — Dự án và phát hành**

- `projects/detail.tsx` → route con `/projects/:projectId/{overview,issues,knowledge,memory,members,releases,settings}`
  (`/projects/:projectId` chuyển hướng tới `overview`; Cài đặt dùng `?section=`). Tổng quan giữ nội dung hiện tại + thẻ
  "Bước tiếp theo" từ `projectSetups/:id` + nút Issue mới; Issues dùng bảng nhóm của P3 với `taskGroups?projectId`; Tri thức
  `knowledge/spaces?scope=project&scopeId`; Bộ nhớ `projectMemory/:pid/repos/:rid`; Phát hành dùng lại khối của trang Releases
  lọc theo dự án; Cài đặt là biến + skill dự án (M3.2) và kết nối git. Mỗi route con khai `authz` và có tên trang đã dịch.
- `releases/index.tsx`: số đếm tab lấy `deploys/hubCounts`; hàng chip dự án → danh sách dọc bên trái có tìm kiếm, phiên bản,
  số issue chờ phát hành — thêm `GET /api/deploys/versionPipelines` trong `server/routes/deploys.ts` theo hình dạng mục 3b.
- `environments/index.tsx`: nút Thêm môi trường qua API của plugin releases (`releases/environments`, form sinh từ
  `releases/drivers[].configSchema`), ẩn với người không có quyền theo `releases/me`. Đọc skill của plugin trước; nếu plugin
  beta.19 không cho ghi thì ghi chênh lệch và dừng ở chỉ-đọc.

**P7 — Cài đặt kiểu sidebar và khung**

- Đây là thay đổi cấu trúc khung (lệch quy ước "trang thẻ" của template): chú thích lý do trong mã, ghi vào
  `.agents/rules/shell.md` và `docs/chenh-lech-upstream.md`.
- Khi ở `/settings/*`, sidebar đổi sang bộ mục Cài đặt + "Quay lại" (`lib/navigation-transform.ts`, `layouts/*`); giữ nguyên
  đường dẫn `/settings/*` và id trang (không đổi id quyền); trang chủ thẻ chuyển hướng tới mục đầu tiên được phép.
  Vẫn chỉ một mục "Cài đặt" ở sidebar chính.
- Nhóm sidebar theo demo: Không gian làm việc (Chung, Nhãn) · Thành viên & quyền (Thành viên, Vai trò, API key) · Tích hợp
  (Git); các trang riêng của ta (ngân sách, skill mặc định, quyền mặc định, thông báo, model, Lead Agent) xếp thêm nhóm
  "Agent & vận hành". Gộp `issue-prefix` + `new-member-role` vào một trang "Chung" (giữ hai id trang cũ làm chuyển hướng).
- `settings/roles.tsx`: cột số người giữ (đếm từ `/api/access/members`).
- Đầu trang (`header-actions.tsx`): biểu tượng phiên, hộp thư kèm số (`/api/inbox/pending` → `decision + info`); huy hiệu
  My issues / My sessions đọc `/api/attention` → `counts{tasks,sessions}`.
- Menu avatar (`user-menu.tsx`): "Tài khoản" (trang M2.3), "Dùng Studio trong agent của bạn" (hướng dẫn CLI + API key cá nhân).
- Cập nhật `client/pages/settings/page-permission-titles.ts` nếu thêm trang; chạy `tests/client/page-permission-titles.test.ts`.

**P8 — Đối chiếu trang plugin**

- Chạy dev, mở từng trang Agents / Runtimes / Skills / Usage (+ Set prices) / Knowledge / Projects, so với ảnh 34, 37, 41–44,
  56–59. Sửa được bằng option hoặc `overrides` bản dịch thì sửa; còn lại ghi vào `docs/chenh-lech-upstream.md` (từ §34).

**P9 — Kết đợt**

- Chụp lại các trang đã làm vào `docs/pictures/duongsinh-studio-sau-P/`, cập nhật "Tiến độ", hỏi chủ dự án trước khi lên production.

## 5. Kiểm chứng

- Theo phạm vi tệp đã đổi, không chạy `pnpm check` toàn bộ: `pnpm exec vitest run <tệp test>`, `pnpm exec eslint <tệp>`,
  typecheck theo project bị ảnh hưởng. Luôn chạy `tests/client/locale-parity`, `tests/project/agents-md.test.ts`; đổi quyền thì
  chạy `tests/server/authorization-assignment-safety.test.ts`.
- Chạy thật: `pnpm dev`, dùng URL `Local:` in ra (cổng 13100), đi qua từng trang và so với ảnh tương ứng; thử bằng một tài khoản
  chỉ có vai trò `ds-contributor` để chắc nút bị ẩn và API từ chối.
- Máy dev 12 GB RAM: không chạy test server khi dev server đang chạy; lệnh nặng chạy foreground có timeout.

## 6. Tiến độ

- [x] Đặc tả REA lượt 1 (mục 3b) · [x] P0 đồng bộ + PR phần dở (#51, ef93538) · [x] P0b đặc tả bù + đường cơ sở Craft Anything (rea-luot-2, craft/) · [x] P1 (khung chia đôi theo taskGroups, §34) · [x] P2 (chi tiết issue theo demo, §35) · [x] P3 (Issues dạng bảng nhóm, §36) · [x] P4 (My sessions, §37) · [x] P5 (Dashboard, §38) · [x] P6 (Dự án / Phát hành / Môi trường, §39) · [ ] P7 · [ ] P8 · [ ] P9
