# Kế hoạch T: chắt lọc tinh hoa từ 10 repo tương tự — 14/11/2026

Đối chiếu trên `origin/main` = `1c8cb1d` (PR tới #120). Bản gốc của chủ dự án viết theo `7ba4e13`; commit duy nhất sau đó (#120) chỉ đụng tới nhật ký truy cập Traefik của
daemon NB3, không đụng chỗ nào bản gốc nói tới. Bản gốc và phụ lục 10 repo:
[`research/2026-11-14/KE-HOACH-T-tinh-hoa.md`](research/2026-11-14/KE-HOACH-T-tinh-hoa.md). Mã là sự thật: chỗ nào mã khác bản
gốc, kế hoạch này theo mã (mục 1).

## 0. Kết luận

Bản gốc **đúng ở hướng và ở phần lớn nhận định về hiện trạng** (17/20 dòng ở mục 1 là "Đúng", 2 "Lệch", 1 "Chưa rõ"); có **5 chỗ cần đổi cách làm** làm đổi cách làm (không đổi mục tiêu), và
**không có số đo nền nào lấy được** từ máy này (mục 3). Năm chỗ lệch quan trọng nhất:

1. **T1**: `wake()` là hàm đóng kín trong `server/providers/agent-executor.ts`, nhận `ProjectsTx` do plugin projects đưa vào các
   hook `onStatusChange`/`onComment`/`onUnblocked`; webhook GitHub không có `ProjectsTx`. Còn đường `autopilot.stalled`
   (`server/autopilot/stall.ts:464`) **không** qua `wake()` mà gọi thẳng `agents.runs.enqueue` nên không chịu giới hạn của `wake()`.
   T1 phải mở một lối vào có tên cho `wake()` (bước T1.0), không chỉ thêm giá trị vào `Trigger`.
2. **T1 `prLineComment`**: Studio không đăng ký sự kiện `pull_request_review_comment`/`pull_request_review` (`APP_EVENTS` ở
   `server/git/github-app.ts:24`) và `handleWebhook` trả `${event}.ignored`. Thêm sự kiện vào mã thì **App GitHub đã tạo không tự
   nhận**: chủ dự án phải tick thêm hai sự kiện ở trang App. Quyền `pull_requests: write` đã đủ, không xin thêm quyền.
3. **T3a**: GitHub chỉ trả `GET .../branches/{b}/protection` cho quyền _Administration: read_, mà App không có và Q2 mặc định là
   không xin. Hướng thay phải thử trên repo thật trước: `GET .../branches/{b}` (trường `protected`, `protection`) và
   `GET .../rules/branches/{b}` (ruleset). Chưa kiểm được ở đây (không có repo thử, không gọi mạng): T3a mở đầu bằng một lượt
   thử có kết quả ghi lại; nếu hai route đó không đủ thì dừng và hỏi lại Q2.
4. **T5**: bản xem thử NB3 là **một App cố định, mỗi lúc một PR có nhãn `preview`, tự dừng sau 30 phút không có request**
   (`docs/xem-thu-app-nb3.md`). Không thể "mở bản xem thử của mọi PR". Hướng đề nghị: job `ds-ui-smoke` tự khởi động bản `dist`
   vừa build ngay trong job Actions (SQLite tạm, dữ liệu giả), không dùng chỗ xem thử; vừa không đụng dữ liệu thật, vừa không
   phụ thuộc DNS hay daemon.
5. **T2**: nhận định gốc đúng nhưng hẹp hơn thực tế: `result` được nhận **kể cả khi có `exitCode`** (`verifications.ts:273`,
   `inputItem.result` thắng `exitCode`), và `human` cũng nhận `result` do người nộp. Chỉ `test`/`command` cần ép từ `exitCode`.

## 1. Kết quả kiểm chứng

Cột "Trạng thái": **Đúng** (mã khớp bản gốc), **Lệch** (khác, kế hoạch theo mã), **Có sẵn** (bản gốc nói chưa có nhưng đã có).

| #   | Nhận định của bản gốc                                                                                | Mã (file)                                                                                                                                                                                                | Trạng thái | Hệ quả                                                                     |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| 1   | `Trigger` chỉ có `statusChange`, `assigned`, `comment`, `mention`, `unblocked` + `autopilot.stalled` | `agent-executor.ts:76-77` đúng năm giá trị; `autopilot.stalled` là `payload.trigger` của `stall.ts:474`, không phải giá trị `Trigger`                                                                    | Đúng       | Giữ                                                                        |
| 2   | CI đỏ do PM đọc log; không có phản ứng thẳng                                                         | `project-manager-principles.ts:28` ("Check CI fail → đọc log … giao sửa"); không có chỗ nào trong `server/` gọi `wake`/`enqueue` khi `ciState` đổi sang `failed`                                         | Đúng       | T1                                                                         |
| 3   | Đi qua `wake()` để ngân sách/giới hạn vẫn áp dụng                                                    | `wake()` đóng kín, cần `ProjectsTx`; `stall.ts` bỏ qua nó                                                                                                                                                | Lệch       | T1.0 mở lối vào; đưa cả `stall` về cùng đường nếu không vỡ test            |
| 4   | Tiêu chí `test`/`command` nhận `result` do agent khai                                                | `verifications.ts:273-280`; `exitCode` tuỳ chọn (`:72`); output cắt 20 000 ký tự cuối                                                                                                                    | Đúng       | T2                                                                         |
| 5   | `mayMove` cần verification `passed` đúng `headSha`                                                   | `agent-executor.ts:588-625`; còn bắt có tiêu chí và PR mở                                                                                                                                                | Đúng       | T2 thêm `contradicted`                                                     |
| 6   | Loại `ci` Studio tự đọc                                                                              | `verifications.ts:283-300` đọc `dsPullRequests.ciState` đúng `headSha`                                                                                                                                   | Đúng       | Chỉ chấm lúc nộp; CI đỏ **sau** khi nộp thì verification vẫn `passed` → T2 |
| 7   | Webhook không nhận `pull_request_review_comment`                                                     | `github-app.ts:24-31` (6 sự kiện), `git/service.ts:1141-1175` rơi vào `.ignored`                                                                                                                         | Đúng       | Lệch ở hệ quả: App cũ cần chủ dự án tick thêm (mục 0.2)                    |
| 8   | Chưa có branch protection / auto-merge của GitHub                                                    | Không có trong `server/` (chỉ có chuỗi `branch protection` ở locale en-US); `merge` luôn `PUT /pulls/{n}/merge` với `squash` cứng (`github.ts:479`) dù có cột `mergeMethod`                              | Đúng       | T3b cần GraphQL `enablePullRequestAutoMerge`; ghi lệch `mergeMethod`       |
| 9   | Bộ đánh giá tự lái có 7 điều kiện và `stageMergeAllowed`                                             | `autopilot/evaluator.ts`, `gates/pre-review.ts:73`, `providers/autopilot.ts:226`                                                                                                                         | Đúng       | T3b thêm điều kiện ở **cả** hai                                            |
| 10  | `DEFAULT_SENSITIVE_PATHS` có sẵn                                                                     | `evaluator.ts:11-23` (11 mẫu, gồm `package.json`, `deploy/**`, `.github/workflows/**`)                                                                                                                   | Đúng       | T7, T10 dùng lại                                                           |
| 11  | `.nb-studio/memory/` đã có; skill có revision; bài học vào Tri thức                                  | `server/memory/*`, `routes/project-memory.ts`; `ensureBuiltinSkills`; `server/lessons/*`                                                                                                                 | Đúng       | T4                                                                         |
| 12  | Chưa có `ds-ui-smoke`, `dsRoutines`, `contradicted`, `prLineComment`                                 | grep toàn `server client cli deploy docs .github`: không có                                                                                                                                              | Đúng       | T5, T6, T2, T1                                                             |
| 13  | Plugin scheduler đã cài; đã có ngân sách 80%/100%; `QuotaThrottleState`; thông báo đẩy               | `server/plugins.ts:19`; `budgets/service.ts` (`WARN_AT`); `autopilot/stall.ts:16`; `server/config/notification.ts`, `providers/outbound.ts`                                                              | Đúng       | T6, T13                                                                    |
| 14  | Workflow mẫu `ds-check` đã có                                                                        | `server/setups/ci-workflow.ts` (`CI_WORKFLOW_PATH`), chạy `pnpm check` + cổng giấy phép; App GitHub không có quyền `workflows`                                                                           | Đúng       | T5 thêm job: đẩy workflow cần token của chủ dự án (như `ci/ds-check`)      |
| 15  | Bản xem thử "theo PR"                                                                                | Một App cố định cho mỗi repo, một PR một lúc, nhãn `preview`, tự dừng 30 phút                                                                                                                            | Lệch       | T5 đổi cách (mục 0.4)                                                      |
| 16  | Runner `studio-runner` uid 1002, `MemoryMax=2,5GiB`; có `docs/runner-resource-limits-proposal.md`    | Tài liệu đó nói đúng; `deploy/` chỉ có `dokploy/`, `nb3-exec/` (chưa có `deploy/runner/`)                                                                                                                | Đúng       | T8 tạo `deploy/runner/`                                                    |
| 17  | `ds-studio verify submit`, `review submit`, `pr open`, `bench run` có sẵn                            | `verifications.ts:182` (`cliRoute`), `agent-instructions.ts`, `routes/bench.ts:178`; CLI tên `ds-studio` ở `server/config/agents.ts:10`                                                                  | Đúng       | T2: `verify run` là lệnh CLI mới, câu lệnh lấy từ route                    |
| 18  | Trang chi tiết "tìm xuyên các lượt / chạy tiếp / tách nhánh" của plugin agents (T11)                 | Skill `nocobase-app-plugin-agents` và `agent-sessions` không nhắc tìm kiếm lượt hay tách nhánh; bảng `ag_runs` có `retry_of_run_id`, `parent_run_id`, `session_id`, `fresh_session`, `execution_history` | Chưa rõ    | T11 mở đầu bằng khảo sát; nhiều khả năng một phần dựng được từ cột có sẵn  |
| 19  | Mục Tiến độ kế hoạch V có V5, V6 còn `[ ]`                                                           | `2026-11-12-studio-thuan-tien-V.md` §11: mọi bước con của V5, V6 đã `[x]`, chỉ hai dòng cha còn `[ ]`                                                                                                    | Đúng       | Sửa ở T0 (đã làm)                                                          |
| 20  | "Đường Studio còn merge được sau khi bật protection" cần kiểm                                        | App có `contents: write`, `pull_requests: write`; không phải quản trị nên **không bỏ qua** bảo vệ nhánh                                                                                                  | Đúng       | T3a: cấm bật "bắt buộc review có duyệt" (App không tự duyệt được)          |

Điểm cần nhớ thêm, không có trong bản gốc: tên bảng trong CSDL là snake_case (`ds_autopilot_events`, `ag_runs`,
`ds_pull_requests`, `ds_reviews`, `ds_verifications`); migration gọi bằng tên camelCase (`dsAutopilotEvents`). Migration mới nhất
là `202611120005`; không có `202611120004` (khoảng trống đã có từ trước).

## 2. Cơ chế plugin sẽ dùng

| Việc                             | Dùng                                                                                              | Tự viết (ghi vào `chenh-lech-upstream.md`)                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Đánh thức agent (T1)             | `agents.runs.enqueue` / `wake()` của executor, kênh `projects`                                    | Lối vào `wake()` ngoài hook (T1.0); bảng `dsReactionRules`                       |
| Việc định kỳ (T6)                | `@nocobase/app-plugin-scheduler` (`registerTarget`, lịch khai trong mã); phải đọc skill trước     | Target `dsRoutine`; **không** dùng Scheduler cho những gì không cần hiện trên UI |
| Cập nhật trực tiếp (T1, T7, T13) | `@nocobase/realtime` (V3.1 đã nối `client/hooks`); đọc skill `nocobase-realtime` trước            | Chủ đề mới `ds.reactions`, `ds.issueChanges`                                     |
| Thông báo đẩy khi leo thang (T1) | `app-plugin-notification` + `notification-web-push` đã cài (`server/providers/outbound.ts`)       | Không                                                                            |
| Lượt chạy, phiên, nhật ký (T11)  | Plugin `agents`/`agent-sessions`: bảng `ag_runs`, `ag_run_events`, `ag_run_inputs`                | Chỉ phần tìm/gắn bài học nếu plugin thiếu                                        |
| Quyền (mọi bước)                 | `authz` trên route trang; quyền hành động qua bộ quyền `ds-*`; không gán gì lên `authenticated:*` | Không                                                                            |

## 3. Đo trước (T0)

**Kết luận: cả bốn số "chưa đo được"; không ước lượng.** Lý do cụ thể:

| Số                                 | Trạng thái       | Lý do                                                                                                                                                                                                                                              | Cách đo (chủ dự án hoặc phiên sau, chỉ đọc)                                                                                                                                                |
| ---------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Điểm chuẩn `ds-core` (10 việc)     | **Chưa đo được** | Cần dev server (đang tắt) + runner + hạn mức thuê bao thật. DB dev `storage/database.sqlite` cũ (sửa 11/11), thiếu `ds_verifications`, 14 lượt chạy và 7 PR của thời điểm đó. Lệnh `ds-studio bench run` chạy được trên máy dev khi chủ dự án muốn | `ds-studio bench run` (set `ds-core`) trên Studio của máy dev với runner máy dev; ghi tỉ lệ đạt, thời gian, token, số lần cần người vào nhật ký đợt T                                      |
| CI đỏ → lượt sửa bắt đầu           | **Chưa đo được** | Dữ liệu 14 ngày nằm ở CSDL production; phiên này không SSH và không ghi/đọc production. Không có bảng ghi "CI chuyển đỏ" lúc nào: chỉ có `ds_pull_requests.ci_state`, `snapshot_at` (lần làm tươi gần nhất, không phải lúc đổi)                    | Cần một sự kiện: T1 ghi `ciFailed` vào `ds_autopilot_events` kèm giờ; trước T1 chỉ ước được từ `ag_runs.created_at` đầu tiên sau `ds_reported_checks`. Báo là "chưa có số" tới khi T1 chạy |
| Số lượt PM mỗi việc                | **Chưa đo được** | Như trên (production)                                                                                                                                                                                                                              | `select subject_id, count(*) from ag_runs where agent_id = '<id project manager>' and created_at > now() - interval '14 days' group by 1`                                                  |
| Tỉ lệ PR merge không cần người bấm | **Chưa đo được** | Như trên                                                                                                                                                                                                                                           | `ds_autopilot_events` (`kind='merged'`) so với `ds_pull_requests.merged_by_id`/`merge_forced_reason` trong 14 ngày                                                                         |

Hệ quả cho thước đo: mục tiêu "≥ 30%" và "≤ 2 phút" chỉ kiểm được sau khi có một số nền. **T1 mở đầu bằng việc ghi giờ
`ciFailed` vào `ds_autopilot_events`** (không đổi hành vi), để sau 3–5 ngày có số trước khi bật phản ứng; đó là cách rẻ nhất để
có số nền thật.

## 4. Các bước

Chung cho mọi bước: một nhánh `feat/t-<bước>`, một PR, CI xanh mới merge; test viết trước, thấy đỏ rồi mới viết mã; route mới ở
**file mới** trong `server/routes/` với `auth.required()`, kiểm quyền, `apiValidator()`, `describeRoute()`, và `cliRoute` cho
lệnh CLI; test 401, 403, thành công; migration tự chứa có `down`, tên export trùng tên file, số kế tiếp tại lúc làm; chuỗi ở
`client/locales/vi-VN.ts` trước, `en-US.ts` và `zh-CN.ts` đủ cặp; trang mới có test 390 px; năng lực cấu hình được có bề mặt
trong Cài đặt hệ thống; xong thì cập nhật Tiến độ (mục 11) rồi dừng. Kiểm theo file, không `pnpm check`/`test`/`build`/`tsc` toàn
repo. Sau khi đổi khởi tạo quyền: `pnpm exec vitest run tests/server/authorization-assignment-safety.test.ts`.

### T0 — Dọn và đo trước (phiên này)

Làm: mục 3 (bốn số, lý do, cách đo); sửa Tiến độ kế hoạch V (mục 11 của kế hoạch đó); chép bản gốc vào `research/2026-11-14/`.
Chưa làm vì không có điều kiện: chạy `ds-core`, đo từ dữ liệu production.
Xong khi: có PR "docs(plans): add wave T plan and baseline" và bốn số có dòng trả lời rõ trong mục 3.

### T2 — Kiểm chứng không tự báo (~1,5 ngày; đóng H1e)

- **Test trước** (`tests/server/verifications-run.test.ts`): (1) `test`/`command` có `result` mà thiếu `exitCode` → 400; (2) có cả
  hai, `result` mâu thuẫn `exitCode` → bỏ `result`, lấy theo `exitCode`; (3) `headSha` khác đầu nhánh PR mở → không tính; (4) CI
  `failed` cùng `headSha` → verification `passed` thành `contradicted`, `mayMove` sai; (5) 401/403.
- **File**: `server/routes/verifications.ts` (sửa nhánh `:273-280`; bỏ đường `inputItem.result` cho `test`/`command`; `human` giữ),
  `server/routes/verification-commands.ts` (mới; `GET /api/issues/{id}/verificationPlan` trả câu lệnh của từng tiêu chí đã
  chốt, `cliRoute({ command: 'verify plan' })`), CLI `verify run` (chạy từng câu lệnh trong thư mục việc, bắt `exitCode`, 20 000
  ký tự cuối, `durationMs`, `git rev-parse HEAD`, rồi gọi `verify submit`); chỗ định nghĩa lệnh CLI nằm trong cơ chế `cliRoute` +
  `server/config/agents.ts`: **đọc trước** `nocobase-app-plugin-agents` (extension-points) để biết lệnh chạy cục bộ được đăng ký thế nào.
- **Migration**: `dsVerifications.result` thêm giá trị `contradicted` (cột là chuỗi 32; không cần đổi kiểu); thêm `contradictedAt`,
  `contradictedBy` (chuỗi 64, null). Gắn vào đường làm tươi CI của `server/git/service.ts` (khi `ciState` về `failed` cho `headSha`).
- **Review**: `server/reviews/service.ts` thêm mục bắt buộc "đã đối chiếu output" trong `checklist`; `ds-studio verify show` đã
  có `verify list`; thêm `verify show`.
- **Skill**: cập nhật `ds-workflow`, `ds-development` trong `server/agents/builtin-skills.ts` qua revision (H0).
- **Stop hook** (tuỳ chọn): tra tài liệu Claude Code hiện hành (`claude-code-guide`) xem runner headless có nạp hook của dự án
  không; không chắc thì bỏ và ghi lý do vào PR.
- **Xong khi**: các test trên xanh; 0 verification `test/command` mới thiếu `exitCode`; skill đã nâng revision.
- Rủi ro: agent đang dùng `verify submit` cũ sẽ bị 400 ngay → giữ `submit` nhận được `exitCode` và đổi hướng dẫn trong skill cùng PR.

### T1 — Phản ứng tự động (~3 ngày; gồm `prLineComment`)

- **T1.0 Nền** (PR riêng, không đổi hành vi): ghi `ciFailed` vào `ds_autopilot_events` (thêm giá trị `kind`) + tách `wake()` thành
  `createWaker(deps)` trả `{ wake }` để provider khác gọi được trong một giao dịch do chính nó mở; **spike trước**: xác định cách
  lấy `ProjectsTx` ngoài hook của plugin projects (đọc skill `nocobase-app-plugin-projects`); nếu plugin không cho, dùng
  `agents.runs.enqueue` trực tiếp **và** gọi chung hàm kiểm ngân sách/song song/trùng của `wake()` tách ra thành hàm thuần.
  Đưa `stall.ts` về cùng đường nếu test cũ (`autopilot-stall.test.ts`) vẫn xanh.
- **T1.1 Bảng và quy tắc**: migration `dsReactionRules` (`projectId` null = mặc định toàn cục, `event`, `enabled`, `maxAttempts`,
  `escalateAfterMinutes`, `action`) và `dsReactionAttempts` (`issueId`, `event`, `headSha`, `attempt`, `runId`, `createdAt`;
  duy nhất `(issueId, event, headSha, attempt)`); seed mặc định: ciFailed 2, conflicts 1, reviewChanges 2, runFailed 2,
  greenAndApproved. `server/reactions/service.ts` (mới): `react(event, ctx)` — chống lặp theo `(issueId, event, headSha)`; mặc
  định 2 lượt mỗi lần đẩy, trần 5 mỗi việc (Q1); vượt thì `blocked` + `needsYou` + thông báo đẩy.
- **T1.2 Nguồn sự kiện**: (a) `ciFailed`: sau `refreshPull` khi `ciState` chuyển sang `failed`; lấy tên job và ~200 dòng cuối log
  qua `server/git/github.ts` (đã có `workflow_runs`, `check_runs`); bỏ qua khi nhánh gốc hỏng đúng check đó (dùng
  `referenceFailures` đã có ở `routes/git.ts:2183`). (b) `conflicts`: `mergeability` chuyển sang `conflicts`. (c)
  `reviewChanges`: sau `submit` phiếu có `verdict ≠ approve`. (d) `runFailed`: kết thúc lỗi **trừ** `toolQuota`, `runnerDiskFull`.
  (e) `greenAndApproved`: gọi `evaluate` ngay thay vì chờ nhịp quét (`autopilot/scheduler.ts`).
- **T1.3 `prLineComment`**: thêm `pull_request_review_comment` và `pull_request_review` vào `APP_EVENTS`; `handleWebhook` gom
  bình luận theo `pull_request_review_id` (chờ phiếu `submitted`), bỏ bot (`sender.type='Bot'`) và agent (`ds-agent` trong
  `author_login` của PR), chỉ nhận người có quyền trên dự án (đối chiếu liên kết GitHub ↔ thành viên); đánh thức tác giả kèm
  `path`, `line`, `body`. **Phần của chủ dự án**: tick hai sự kiện ở trang App GitHub (App cũ không tự cập nhật).
- **T1.4 PM**: sửa `project-manager-principles.ts` dòng 28 và dòng 25: PM chỉ vào cuộc khi quy tắc đã leo thang; nâng revision skill.
- **T1.5 Giao diện**: tab "Phản ứng" trong cài đặt Tự lái (`client/pages/settings/…`, đăng ký ở `client/pages/settings/routes.ts`
  theo `settings-navigation.md`); một dòng trên trang việc cho mỗi lần tự phản ứng (nguồn `ds_autopilot_events` + realtime).
- **Test**: đủ 6 sự kiện; chống lặp cùng `headSha`; trần 5; nhánh gốc cũng hỏng → bỏ qua; quá trần → `blocked`+`needsYou`+đẩy;
  ngân sách hết → không đánh thức; 401/403/200 cho route cấu hình.
- **Xong khi**: test xanh; trên dự án thử, từ CI đỏ đến lượt sửa bắt đầu ≤ 2 phút (đo bằng bản ghi T1.0).

### T10 — Mức việc (~1,5 ngày)

- Migration thêm `dsIssueTiers`: `issueId`, `tier` (`small|standard|sensitive`), `raisedFrom`, `reason`, và `defaultTier` vào
  `dsAutopilotSettings` (Q7: `standard`). `server/tiers/service.ts`: bảng mức → `{ approach, reviewPasses, finalApproval, criteria }`.
- Tự nâng khi PR chạm `DEFAULT_SENSITIVE_PATHS` (đọc cùng cấu hình `sensitivePaths` của dự án); không có hàm hạ.
- Quyết định bằng mã chứ không để PM đoán: `agent-executor.ts` (`work()` chọn có approach hay không), `autopilot/evaluator.ts`
  (số lượt review, người duyệt cuối). **Chọn lúc tạo việc**: trường ở form tạo việc và intake.
- Test: ba mức × (approach, số review); tự nâng; không tự hạ; mặc định theo dự án.

### T3a/T3b — Hàng rào GitHub (~2 ngày)

- **T3a**: bước 0 là **thử** `GET /repos/{o}/{r}/branches/{b}` và `GET /repos/{o}/{r}/rules/branches/{b}` bằng token của App trên một
  repo thật, ghi kết quả vào PR (xem mục 0.3); nếu cần `Administration: read` thì **dừng và hỏi lại Q2**. Phần mã: `server/git/protection.ts`
  (mới) đọc và đánh giá (đỏ nếu chưa bắt buộc `ds-check` hoặc còn cho đẩy thẳng; **đỏ nếu bật "bắt buộc review duyệt"**, vì App không
  tự duyệt được); thêm vào "Kiểm tra dự án" (`routes/project-setups.ts`); nút "Kiểm lại"; in 4 bước bấm.
- **T3b**: `autoMergeOnGithub` trên `dsAutopilotSettings` (mặc định tắt, chỉ bật khi T3a xanh); GraphQL `enablePullRequestAutoMerge`
  (repo phải bật "Allow auto-merge" — việc của chủ dự án); thêm điều kiện ở **cả** `evaluator.ts` và `stageMergeAllowed`. Ghi lệch
  `merge_method: 'squash'` cứng ở `github.ts:479` so với cột `mergeMethod`.
- Test: có/không protection; Studio vẫn merge được khi protection bật (kiểm bằng mô phỏng `merge` 405/422 trả lỗi rõ, không im lặng).

### T4 — Bộ quy tắc đi theo repo (~2 ngày)

- `server/harness-export/service.ts` + `routes/harness-export.ts` + CLI `harness export`; nút trong dự án; mở PR vào repo app, ghi
  `.nb-studio/harness/{skills/,lessons.md,playbooks/,criteria-template.md}` + `.agents/rules/ds-harness.md` + **một** dòng Index
  trong `AGENTS.md`; không ghi `.agents/skills/` (Q4). Đầu trang `generated-by`/`revision`/`hash`; "Kiểm tra dự án" báo vàng khi lệch.
  Nhập ngược bài học ở trạng thái chờ duyệt khi PR merge (cùng đường với bộ nhớ). Quét bí mật bằng `server/security/secret-patterns.ts`
  trước khi mở PR (nếu có kết quả thì không mở PR, báo số mẫu khớp, không in nội dung).
- Test: xuất sạch; xuất có bí mật bị chặn; hash lệch báo vàng; `tests/project/agents-md.test.ts` của app thử vẫn xanh.

### T5 — Kiểm giao diện (~1,5 ngày; sau T2)

- Mẫu job `ds-ui-smoke` thêm vào `server/setups/ci-workflow.ts` (và `nb3AppWorkflow`): job riêng, **chạy trên Actions**, build rồi
  khởi động `dist` cục bộ với SQLite tạm và dữ liệu giả (khác bản gốc, mục 0.4), Playwright 390×844 và 1280×800, đi qua danh sách
  trang khai trong việc, đỏ khi `console.error`/`pageerror` hoặc trang trắng, đẩy ảnh làm artifact. Studio đọc như một check
  run (đã có `ds_reported_checks`), coi là tiêu chí `ci`, hiện ảnh trên trang việc.
- Việc của chủ dự án: đẩy workflow bằng token có quyền Workflows (như `ci/ds-check`). Không chạy trên runner VPS.

### T7 — Thẻ "Thay đổi" (~1 ngày; sau T5)

- Component riêng `client/components/issue-changes/`, gắn vào `detail/index.tsx` bằng một dòng; dữ liệu từ route mới
  `GET /api/pullRequests/{id}/changeSummary` (số file, dòng ±, nhóm theo thư mục, cờ nhạy cảm, ảnh T5, kết quả kiểm chứng) cache
  theo `headSha`. Ba nút: Duyệt (phiếu người), Yêu cầu sửa (bình luận đánh thức tác giả), Mở GitHub. Không đổi bố cục V2; test 390 px.

### T13 — Hạn mức và Cấu hình hiệu lực (~1 ngày)

- Thẻ "Hạn mức" trên Hôm nay: nguồn `getQuotaThrottle` (`stall.ts:75`) + hạn mức ngân sách (`budgets/service.ts`); trang chỉ đọc
  "Cấu hình hiệu lực" gom Tự lái, Phản ứng, Ngân sách, Mức việc, Skill, mỗi dòng ghi nguồn (mặc định hệ thống / dự án / việc).
  Cập nhật qua `use-today.ts` (`Promise.allSettled`), một nguồn lỗi chỉ làm trống phần của nó.

### T6 — Việc định kỳ (~1,75 ngày)

- Đọc skill scheduler trước. Migration `dsRoutines` (`name`, `playbookSlug`, `template`, `cron`, `enabled` mặc định **false**,
  `lastRunAt`), `dsRoutineProjects` (nhiều dự án một việc); target `dsRoutine` đăng ký bằng `registerTarget`; mỗi lần đến lịch: tạo
  việc từ playbook, tôn trọng `maxActiveIssues` và ngân sách, không tạo trùng khi việc cùng routine còn mở. Bốn mẫu tắt: kiểm
  `!nang-template`, quét giấy phép (không `--prod`), thử khôi phục sao lưu, rà bài học chờ duyệt. Trang quản trị trong Cài đặt hệ thống.

### T11 — Hồ sơ lượt chạy (~1,5 ngày; khảo sát trước)

- Khảo sát: plugin `agents` đã có gì (đọc `docs/` và `skills/` của plugin, cột `ag_runs.retry_of_run_id/parent_run_id/session_id/fresh_session`,
  bảng `ag_run_events`). Chỉ viết phần plugin thiếu: tìm theo từ khoá xuyên các lượt, "Chạy tiếp từ bước này" (lượt mới mang bối cảnh
  tới sự kiện đó), "Ghi thành bài học" (đính đoạn nhật ký vào `server/lessons/`). Ghi quyết định vào `chenh-lech-upstream.md`.

### T12 — Hai phương án (~1 ngày; sau T10)

- Chỉ ở bước approach (chỉ đọc), hai agent khác nhà cung cấp; PM so và chọn, ghi lý do vào bình luận; mặc định chỉ khi bấm (Q8);
  không chạy song song phần đổi mã trên runner VPS. Đếm 2 lượt vào ngân sách.

### T8 — Siết runner (~1 ngày; chỉ mã và tài liệu)

- Hoàn thiện `docs/runner-resource-limits-proposal.md` thành drop-in systemd (`MemoryHigh`, `NoNewPrivileges`, `ProtectSystem=strict`,
  `ReadWritePaths`, `PrivateTmp`, `IPAddressDeny/Allow`); `deploy/runner/audit.sh` chạy dưới user runner, đỏ khi đọc được: bí mật của
  Studio, thư mục Dokploy, Docker socket, socket `ds-nb3-exec`, thư mục sao lưu. Tài liệu ghi chủ dự án tự áp dụng; **không SSH**.

### T9 — Chính sách thuê bao và đối chứng (~0,5 ngày)

- `docs/chinh-sach-thue-bao.md` và hướng dẫn đối chứng Paperclip bằng 10 việc `ds-core` (điểm chuẩn lấy ở mục 3). Không khẳng định
  điều khoản của Anthropic/OpenAI theo trí nhớ: dẫn link trang chính thức, ghi ngày đọc; phần chưa chắc ghi "chủ dự án tự kiểm".
  Mỗi agent có trường "nguồn" (thuê bao / API key / khác) để đổi không sửa mã: kiểm trước xem cấu hình agent hiện có chỗ nào cho việc này.

### Không làm trừ khi chủ dự án bảo

T3c (review trên Actions, Q3), T7b (góp ý trên bản xem thử, Q9).

## 5. Thứ tự và công sức

T0 → **T2 → T1** (T1.0 trước, đo ~3–5 ngày trước khi bật) → **T10** → **T3a+T3b** → **T4** → **T5** → **T7** → **T13** →
**T6** → **T11** → **T12** → **T8**; T9 song song. Công ước tính lại: T0 0,5 · T2 1,5 · T1 3 · T10 1,5 · T3a+b 2 · T4 2 · T5 1,5 ·
T7 1 · T13 1 · T6 1,75 · T11 1,5 · T12 1 · T8 1 · T9 0,5 = **~20 ngày agent** (bản gốc 20–22; T1 tăng 0,5 vì T1.0).

Thứ tự T2→T1 đúng như bản gốc: vá lỗ hổng tin cậy trước khi tăng tự động. Không trộn với việc còn treo của đợt V.

## 6. Rủi ro

- **Vòng lặp tự sửa đốt hạn mức**: khoá theo `(issueId, event, headSha)`, trần 5, ngân sách chặn; test riêng.
- **Phản ứng chạy trước khi có số nền**: T1.0 ghi sự kiện trước, bật phản ứng sau.
- **Bật bảo vệ nhánh làm Studio không merge được** (đặc biệt "bắt buộc review có duyệt", "chỉ quản trị bỏ qua"): T3a đỏ với hai cấu hình đó.
- **App GitHub cũ không nhận sự kiện mới**: chủ dự án tick tay; `Kiểm tra dự án` phải hiện "App chưa đăng ký sự kiện review".
- **`wake()` ngoài hook**: nếu không lấy được `ProjectsTx`, hai đường (hook, webhook) có thể lệch quy tắc ngân sách; chống bằng hàm kiểm dùng chung.
- **Ảnh chụp lộ dữ liệu thật**: T5 chạy với SQLite tạm và dữ liệu giả; không đăng nhập production.
- **Chính sách thuê bao thay đổi**: T9 có đường lui theo từng agent.
- **Runner 2,5 GiB**: mọi lệnh kiểm theo file; không chạy `pnpm check`/`test`/`build` toàn repo ở runner.

## 7. Không làm

Chuyển sang Paperclip/Multica; sandbox Docker từng lượt; APK; embedding; trình xem diff đầy đủ; viết lại trên Cordis/DeepSeek
Harness; cho agent tự nạp plugin lúc chạy; computer use trên VPS; cấp quyền Administration cho GitHub App khi chưa hỏi.

## 8. Câu hỏi cho chủ dự án (một tin nhắn, kèm mặc định)

| #   | Câu hỏi                                                                                           | Mặc định nếu không trả lời                                                 |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Q1  | Số lượt tự sửa CI trước khi gọi người?                                                            | 2 mỗi lần đẩy, trần 5 mỗi việc                                             |
| Q2  | Cho GitHub App quyền _Administration_ để đọc/bật bảo vệ nhánh?                                    | Không; đọc bằng route không cần quyền đó, nếu không đủ thì dừng và hỏi lại |
| Q3  | Review trên GitHub Actions?                                                                       | Hoãn (không làm T3c)                                                       |
| Q4  | Vị trí bộ quy tắc trong repo app?                                                                 | `.nb-studio/harness/` + `.agents/rules/ds-harness.md`                      |
| Q5  | Việc định kỳ nào bật sẵn?                                                                         | Không bật cái nào                                                          |
| Q6  | Đối chứng với ai?                                                                                 | Paperclip, máy dev, 2 tuần                                                 |
| Q7  | Mức việc mặc định?                                                                                | Chuẩn                                                                      |
| Q8  | Hai phương án cho việc Nhạy cảm?                                                                  | Chỉ khi bấm                                                                |
| Q9  | Góp ý trên bản xem thử (T7b)?                                                                     | Hoãn                                                                       |
| Q10 | (mới, từ chỗ lệch) Cho T5 chạy `dist` ngay trong Actions với SQLite tạm thay vì dùng chỗ xem thử? | Có                                                                         |
| Q11 | (mới) Tick thêm hai sự kiện review ở trang mỗi App GitHub sau T1.3?                               | Chủ dự án làm tay khi T1.3 merge, Studio hiện cảnh báo tới khi xong        |

### Quyết định của chủ dự án (14/11/2026)

Chủ dự án đồng ý Q1–Q11 theo đề xuất (mặc định ở bảng trên; Q10 = có, Q11 = chủ dự án tick tay ngay sau khi T1.3 merge) và
ủy quyền cho agent quyết định tối ưu các việc còn lại **trong các luật cũ** (không đụng production, không SSH, không xin
Administration, không đổi phiên bản `@nocobase/*`). Việc tick sự kiện trên trang App GitHub là thao tác trên tài khoản GitHub
của chủ dự án nên vẫn nằm ở danh sách việc làm tay.

## 9. Ghi vào `docs/chenh-lech-upstream.md` khi làm

`wake()` mở lối vào ngoài hook (T1.0); bảng `dsReactionRules`/`dsReactionAttempts` và sự kiện review mới (T1); cột
`contradictedAt` và lệnh CLI `verify run`/`verify plan` (T2); `dsIssueTiers` (T10); đọc bảo vệ nhánh không cần Administration
nếu thành công, hoặc ghi lý do dừng (T3a); mục xuất `.nb-studio/harness/` và dòng Index trong `AGENTS.md` của app (T4);
job `ds-ui-smoke` (T5); target `dsRoutine` của scheduler (T6); phần T11 plugin thiếu; `merge_method` cứng `squash`.

## 10. Việc cần chủ dự án làm tay (gom lại ở đây, không tự làm thay)

1. Trả lời Q1–Q11 (hoặc để mặc định).
2. Chạy `ds-studio bench run` trên máy dev để có điểm chuẩn `ds-core`; chạy các truy vấn chỉ đọc ở mục 3 trên CSDL production.
3. Sau T1.3: tick `Pull request review` và `Pull request review comment` ở trang mỗi App GitHub.
4. Sau T3a: bật bảo vệ nhánh theo 4 bước Studio in ra; bật "Allow auto-merge" nếu dùng T3b.
5. Sau T5: đẩy workflow có `ds-ui-smoke` bằng token có quyền Workflows.
6. Sau T8: áp drop-in systemd và chạy `deploy/runner/audit.sh` trên VPS.
7. Còn treo của đợt V: cài daemon, `dbService`/`dumpDir` và `accessLog` trong config daemon, rclone sang Drive, token đọc Releases cho
   `release.sh`, thử một tag thật, DNS và khoá CI cho app mới.

## 11. Tiến độ

- [x] T0 — Dọn và đo trước: kế hoạch này, Tiến độ kế hoạch V đã sửa; bốn số nền **chưa đo được** (mục 3)
- [x] T2 — Kiểm chứng không tự báo (PR `feat/t-2`; **không có lệnh `verify run`** vì CLI chỉ là route, thay bằng `verify plan` + từ chối phía server + `contradicted`; xem `chenh-lech-upstream.md` §59)
- [x] T1 — Phản ứng tự động — **T1.0 xong** (PR `feat/t-1`: sự kiện `ciFailed` có giờ trong `ds_autopilot_events`, một lần cho mỗi đầu PR; `agentWakerToken.wakeIssue()` gọi `wake()` ngoài hook qua `projects.tx.run`, trigger `reaction`; chưa đổi hành vi); **T1.1 + T1.2 xong** (PR `feat/t-1-1`: bảng `dsReactionRules`/`dsReactionAttempts`, `server/reactions/service.ts`, `ReactionsProvider`; nguồn ciFailed (bỏ check tham chiếu), conflicts, reviewChanges, runFailed (trừ toolQuota/runnerDiskFull; chỉ agent của chính việc đó), greenAndApproved = duyệt xong thì `mergeIfEligible` ngay; mặc định nằm trong code, bảng chỉ là ghi đè; **chưa lấy ~200 dòng log** — chỉ tên check + liên kết, ghi ở §9); **T1.3 + T1.4 + T1.5 xong** (PR `feat/t-1-3`: `prLineComment` từ phiếu review `submitted`, skill `ds-workflow` bản 5, route `GET/PUT /projects/:id/reactions` + `GET /issues/:id/reactions`, mục "Tự phản ứng" trong Cài đặt dự án và danh sách trên trang việc; **chủ dự án còn phải tick hai sự kiện review trên mỗi App GitHub**) (T1.0 nền → T1.1 bảng → T1.2 nguồn sự kiện → T1.3 `prLineComment` → T1.4 PM → T1.5 giao diện)
- [x] T10 — Mức việc (PR `feat/t-10`: `dsIssueTiers` + `defaultTier`, `server/tiers/service.ts`, tự nâng khi chạm đường dẫn nhạy cảm và không tự hạ, evaluator đòi review bảo mật thêm cho việc Nhạy cảm, quy tắc mức trong brief của agent, `GET/PUT /issues/:id/tier`; **không thêm trường vào form tạo việc** vì form do plugin projects giữ — chọn mức ở thanh bên của việc và mức mặc định ở Cài đặt dự án; xem `chenh-lech-upstream.md` §61)
- [x] T3a — Hàng rào GitHub (PR `feat/t-3a`: `server/git/protection.ts`, `GET /projects/:id/branchProtection`, mục "Hàng rào nhánh chính" với bốn bước và nút Kiểm lại; **chưa thử được trên repo thật**, phần đọc dùng quyền App đã có; App không đọc được thì báo "chưa đọc được", không đỏ không xanh; xem `chenh-lech-upstream.md` §62); [x] T3b — Auto-merge (cùng PR `feat/t-3a`: `autoMergeOnGithub`, GraphQL `enablePullRequestAutoMerge`, chỉ bật khi hàng rào xanh, điều kiện ở cả `evaluate` và `stageMergeAllowed`; **chủ dự án phải bật "Allow auto-merge" ở kho**; chưa thử với GitHub thật)
- [x] T4 — Bộ quy tắc đi theo repo (PR `feat/t-4`: `server/harness-export/{build,service}.ts`, `GET/POST /projects/:id/harnessExport` (CLI `harness status`/`harness export`), mục "Bộ quy tắc trong kho mã" báo lệch; **không có nhập ngược bài học khi PR merge**, xem `chenh-lech-upstream.md` §63)
- [x] T5 — Kiểm giao diện (PR `feat/t-5`: `server/setups/ui-smoke-workflow.ts`, `POST /projects/:id/uiSmoke`, nút đề xuất; **chưa chạy thử trên Actions**; phần "hiện ảnh trên trang việc" và `nb3AppWorkflow` chưa làm, xem `chenh-lech-upstream.md` §64)
- [x] T7 — Thẻ "Thay đổi" (PR `feat/t-7`: `server/changes/summary.ts`, `GET /pullRequests/:id/changeSummary`, `POST /pullRequests/:id/requestChanges`, `client/components/issue-changes/`; **không có nút Duyệt, chưa có ảnh T5**, xem `chenh-lech-upstream.md` §65)
- [ ] T13 — Hạn mức và Cấu hình hiệu lực
- [ ] T6 — Việc định kỳ
- [ ] T11 — Hồ sơ lượt chạy
- [ ] T12 — Hai phương án
- [x] T8 — Siết runner (`deploy/runner/{ds-runner-slice.conf,nocobase-runner-hardening.conf,audit.sh}` + mục 7 của `docs/runner-resource-limits-proposal.md`; chủ dự án tự áp dụng và tự chạy `audit.sh`; **không kiểm được trên VPS**; chặn mạng bằng dải riêng chứ không bằng danh sách miền vì `IPAddressAllow` chỉ nhận IP)
- [x] T9 — Chính sách thuê bao và đối chứng (`docs/chinh-sach-thue-bao.md`; **không có trường "nguồn" ở agent** — kiểm rồi, plugin `agents` không có chỗ; đường lui là đổi đăng nhập trên runner hoặc thêm agent công cụ khác; việc đối chứng 2 tuần là của chủ dự án)
- (chỉ khi chủ dự án bảo) [ ] T3c — Review trên Actions; [ ] T7b — Góp ý trên bản xem thử
