# Kế hoạch: Studio tự lái ("autopilot") — tự merge khi đủ điều kiện, tự mở việc kế tiếp — 04/11/2026

> Trạng thái: **đã duyệt 04/11/2026.** Q1, Q2, Q3, Q5, Q6 theo khuyến nghị; **Q4: không giới hạn số merge/ngày** (chỉ giữ giới
> hạn số việc chạy song song = số chỗ runner). Kế hoạch chi tiết ở mục 9; prompt triển khai cho phiên khác:
> `2026-11-04-prompt-trien-khai-studio-autopilot.md`. Chưa sửa mã.
> Yêu cầu của chủ dự án (04/11/2026): "Tôi muốn Studio tự động triển khai giúp tôi, giảm thiểu sự điều hành của con người."
> Bối cảnh: chuỗi `duongsinh-app` (DS-4 → DS-17) hiện chạy được là nhờ **một phiên Claude Code làm điều phối viên** (theo
> dõi, merge, mở việc, gỡ vướng). Tắt phiên đó thì chuỗi dừng ở "Chờ nghiệm thu". Kế hoạch này đưa các việc đó vào chính
> Studio (`duongsinh-studio`, lớp Studio).
> Liên quan: kế hoạch tổng `2026-11-01-nocobase-studio-ke-hoach-phat-trien.md`; S3 (merge trong Studio, `mergeBlocker`);
> S5 (GitHub App + webhook); `2026-11-03-chuyen-production-nocobase-v2-sang-v3.md`.

## 1. Việc điều phối viên đang làm tay → Studio cần tự làm

| Việc tay hôm nay                                                 | Studio tự làm (đề xuất)                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Đọc báo cáo, thấy "review approve, không Must fix" trong comment | **Phiếu review có cấu trúc** (verdict, số Must fix, reviewer, head sha) do agent nộp bằng lệnh `ds-studio review submit`                                                 |
| Kiểm CI xanh, PR `clean`, có báo cáo bàn giao, tự đọc PR → merge | **Bộ đánh giá merge** chạy theo sự kiện + định kỳ, merge bằng GitHub App dưới danh "Studio autopilot", ghi lý do                                                         |
| Chuyển việc kế tiếp (hết chặn) sang "Đang làm"                   | **Bộ lập lịch việc**: khi việc xong, mở các việc đã hết `blocked-by`, theo thứ tự, giới hạn theo số chỗ runner                                                           |
| Nhắc agent khi lượt chạy dừng giữa chừng (DS-4)                  | **Phát hiện đứng việc**: issue "Đang làm" không có lượt chạy, không có PR, quá N phút → đánh thức trưởng nhóm agent với lý do cụ thể; lặp 2 lần → "Đang vướng" + hộp thư |
| Review PR do Opus viết (không có reviewer mạnh hơn)              | **Quy tắc reviewer**: Opus viết → reviewer là phiên Opus khác ở chế độ read-only với checklist review (khác lượt, khác workspace)                                        |
| Tạo thêm việc khi runner rảnh                                    | (Giai đoạn 2) trưởng nhóm agent **đề xuất** việc mới từ epic dưới dạng kế hoạch; autopilot chỉ mở việc đã có trong backlog                                               |

## 2. Nguyên tắc an toàn (không đổi)

1. **Chỉ merge, không deploy.** Autopilot không bao giờ deploy production hay chạy thao tác ghi lên dữ liệu thật; phát hành
   (S5) vẫn do người bấm hoặc đánh dấu.
2. **Bật theo từng project**, mặc định **tắt**. Bật trước cho `Dương Sinh App` (bản mẫu v3, chưa có người dùng thật).
3. **Có công tắc dừng** cho từng project và toàn hệ thống; mọi lần merge tự động ghi activity + comment trên issue và PR
   (lý do, phiếu review, head sha, check), xem lại được trong Hộp thư.
4. **Mỗi lần merge phải khớp đúng head sha** đã được review và đã qua CI (không merge commit mới chưa review).
5. **Thay đổi nhạy cảm** (mục 4) phải qua thêm một lớp review chuyên biệt; theo lựa chọn của chủ dự án có thể giữ người duyệt.
6. Có **giới hạn tốc độ** (số merge/ngày, số việc chạy song song) để không vượt hạn mức gói Claude Max và RAM VPS.

## 3. Thiết kế

### 3.1 Phiếu review có cấu trúc

- Bảng `dsReviews`: `pullRequestId`, `headSha`, `reviewerAgentId`, `authorAgentId`, `verdict` (`approve` | `changes`),
  `mustFix`, `shouldFix`, `checklist` (JSON: thuật toán khớp nguồn, đủ test, không dữ liệu cá nhân, không bí mật, quyền…),
  `summary`, `createdAt`.
- Lệnh agent `ds-studio review submit <PR> --verdict … --must-fix N --head <sha> --summary-file …` (business action mới
  `studio.reviews/submit`, chỉ cấp cho lượt review read-only); route kiểm reviewer ≠ tác giả, `headSha` = head hiện tại.
- Chỉ dẫn mặc định cho agent review + nguyên tắc trưởng nhóm agent: review phải nộp phiếu; comment chỉ để người đọc.

### 3.2 Chính sách autopilot (cài đặt theo project)

- Bảng `dsAutopilotSettings` (project): `enabled`, `mergeMethod` (squash), `maxMergesPerDay` (mặc định **null = không giới hạn**, theo Q4),
  `maxActiveIssues` (mặc định = số chỗ runner khả dụng), `stallMinutes` (mặc định 30), `sensitivePaths` (glob),
  `sensitivePolicy` (`extraReview` | `human`), `quietHours` (tuỳ chọn), `pausedReason`.
- Giao diện: Dự án → Cài đặt → **Tự lái**; bảng điều khiển "Hôm nay đã merge / đang chờ / bị chặn và vì sao".

### 3.3 Bộ đánh giá merge

- Chạy khi: webhook PR/check (S5.2), issue đổi trạng thái, phiếu review mới; và quét mỗi 2 phút (job scheduler của Studio).
- Điều kiện **tất cả** phải đúng:
  1. Project bật autopilot, không bị tạm dừng, chưa vượt `maxMergesPerDay`.
  2. Issue ở `in_review`, không có `needsYou`, có `acceptance` (báo cáo bàn giao) không rỗng.
  3. PR liên kết issue, `open`, không draft, `mergeability = clean`, `mergeBlocker = null`.
  4. CI: mọi `requiredChecks` của repo `success` trên **head sha hiện tại** (đọc qua Checks API của GitHub App).
  5. Có phiếu review `approve`, `mustFix = 0`, cùng head sha, reviewer ≠ tác giả, reviewer không yếu hơn tác giả.
  6. Nếu PR chạm `sensitivePaths`: thêm phiếu review chuyên biệt (`checklist.security = pass`) hoặc chờ người (theo lựa chọn).
  7. Không có comment mới của người trên issue/PR sau phiếu review (người vừa nói gì thì chờ người).
- Merge: `mergePullRequest` sẵn có (S3) với `actor = studio-autopilot`; `ds.pr.merged` đưa issue sang `done`; comment
  "Autopilot đã merge vì: …" (tiếng Việt, kèm link phiếu review và check).
- Hỏng (conflict, check đỏ sau rebase…): không ép; đánh thức trưởng nhóm agent với lý do để giao sửa.

### 3.4 Bộ lập lịch việc kế tiếp

- Khi issue `done` (hoặc định kỳ): trong project bật autopilot, lấy issue `backlog` có cờ **`autopilot` = cho phép tự mở**
  (đặt khi tạo, hoặc thừa hưởng từ epic cha), mọi issue chặn nó đã `done`; sắp theo thứ tự ưu tiên rồi thứ tự tạo.
- Mở tối đa `maxActiveIssues − số issue đang làm` việc: chuyển `in_progress`, executor = trưởng nhóm agent.
- Không bao giờ tự mở issue không có cờ cho phép (việc người tạo tay giữ nguyên quyền quyết của người).

### 3.5 Phát hiện đứng việc

- Issue `in_progress`/`blocked` của project bật autopilot mà **không có lượt chạy queued/running** và **không có hoạt động**
  quá `stallMinutes` → đưa input "stalled" cho trưởng nhóm agent (kèm: lượt cuối của ai, kết thúc lúc nào, tóm tắt, có PR hay
  chưa, runner nào còn workspace chưa push).
- Workspace chưa push (runner báo `unpushedCount`) → yêu cầu agent push trước khi đổi runner (đúng bài học DS-4).
- Hai lần đứng liên tiếp → `blocked` + `needsYou` + mục trong Hộp thư "Cần tôi quyết định".

### 3.6 Quy tắc chọn reviewer

- Ưu tiên: reviewer khác nhà cung cấp (nếu bật) → model mạnh hơn hoặc bằng tác giả, **khác lượt và workspace**.
- Tác giả là model mạnh nhất (Opus) → reviewer là một lượt Opus khác ở chế độ read-only với checklist bắt buộc (cho phép
  khi chủ dự án chọn; ghi rõ trong phiếu `sameModel = true`).

### 3.7 Báo cáo cho chủ dự án

- Hộp thư mỗi tối: danh sách đã tự merge (PR, issue, reviewer, check), việc đang vướng và vì sao, hạn mức đã dùng.
- Email/web push (khi S6.4 làm xong) chỉ cho mục "Cần tôi quyết định".

## 4. Thay đổi nhạy cảm (đề xuất mặc định)

`sensitivePaths` mặc định cho `duongsinh-app`:

- `database/**/migrations/**`, `database/**/seeds/**` (cấu trúc dữ liệu, vai trò);
- `server/**/acl*`, `server/**/authz*`, `server/**/*permission*`, `server/routes/**` có route công khai (`Public`);
- `.github/workflows/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (CI, phụ thuộc);
- `deploy/**`, `config.yml` mẫu.

Chính sách `extraReview`: thêm một lượt review chuyên biệt (Opus, read-only) với checklist bảo mật: cách ly dữ liệu phụ huynh
có test, không mở quyền cho `authenticated`/`member`, migration có `down`, phụ thuộc mới có giấy phép và lý do, không bí mật.

## 5. Các bước triển khai

| Bước | Nội dung                                                                                                                | Thời lượng |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| AP1  | Phiếu review có cấu trúc: bảng, route, lệnh CLI, business action, chỉ dẫn agent + nguyên tắc trưởng nhóm                | 1 ngày     |
| AP2  | Cài đặt autopilot theo project + bộ đánh giá merge (sự kiện + quét định kỳ) + merge dưới danh autopilot + comment lý do | 1,5 ngày   |
| AP3  | Bộ lập lịch việc kế tiếp (cờ `autopilot` trên issue/epic, thứ tự, giới hạn song song theo chỗ runner)                   | 1 ngày     |
| AP4  | Phát hiện đứng việc + yêu cầu push workspace + chuyển `blocked` sau 2 lần                                               | 1 ngày     |
| AP5  | Giao diện Tự lái, công tắc dừng, báo cáo tối trong Hộp thư                                                              | 1 ngày     |
| AP6  | Thử trên Sandbox (chuỗi 3 issue giả), rồi bật cho `Dương Sinh App`; điều phối viên Claude Code rút về chỉ giám sát      | 0,5 ngày   |

Tổng ≈ 6 ngày làm việc. Mỗi bước: lint, typecheck, test (chia nhóm, foreground), build xanh; sao lưu DB Studio trước khi cập
nhật production; ghi lệch upstream vào `docs/chenh-lech-upstream.md`.

## 6. Kiểm chứng

- **Test tự động:** mỗi điều kiện ở 3.3 có ca đúng và ca sai (thiếu phiếu, phiếu khác head sha, CI đỏ, conflict, có
  `needsYou`, người vừa comment, vượt hạn mức, project tắt, đường dẫn nhạy cảm thiếu review chuyên biệt); lập lịch không mở
  việc chưa hết chặn hoặc không có cờ; phát hiện đứng việc đánh thức đúng một lần.
- **Thử thật trên Sandbox:** 3 issue nối nhau tự chạy từ đầu tới cuối không cần người; một PR cố ý làm đỏ CI không bị merge;
  một PR chạm migration phải qua review chuyên biệt.
- **Bật cho Dương Sinh App:** chuỗi DS-5 → DS-9 chạy hết mà điều phối viên không can thiệp; báo cáo tối liệt kê đúng.

## 7. Rủi ro

| Rủi ro                                           | Giảm thiểu                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Merge mã sai vì review cùng model bỏ sót         | Phiếu review có checklist bắt buộc; đường dẫn nhạy cảm cần review chuyên biệt; mọi merge có CI đủ test; revert 1 lệnh |
| Chạy quá nhanh, cạn hạn mức gói Claude / RAM VPS | `maxActiveIssues`, `maxMergesPerDay`, giờ yên lặng; theo dõi trong báo cáo tối                                        |
| Autopilot merge khi người đang muốn góp ý        | Điều kiện "không có comment mới của người sau phiếu review"; công tắc dừng một chạm                                   |
| Lỗi logic autopilot gây loạt merge sai           | Mặc định tắt; bật từng project; thử trên Sandbox trước; nhật ký đầy đủ để revert                                      |
| Agent nộp phiếu review giả                       | Route kiểm reviewer ≠ tác giả, đúng lượt review read-only, đúng head sha; phiếu gắn với run token của lượt review     |

## 8. Quyết định cần chủ dự án chốt

| #   | Câu hỏi                                             | Khuyến nghị                                                                                               |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Q1  | Project bật đầu tiên                                | `Dương Sinh App` (chưa có người dùng thật); `duongsinh-nocobase` (v2) và Studio tự sửa mình **không** bật |
| Q2  | Thay đổi nhạy cảm (migration, quyền, CI, phụ thuộc) | `extraReview` (thêm một lượt review bảo mật tự động), không cần người                                     |
| Q3  | Reviewer cùng model khi tác giả là Opus             | Cho phép, ghi rõ trong phiếu (vì Codex tắt)                                                               |
| Q4  | Giới hạn                                            | **Đã chốt:** không giới hạn số merge/ngày; việc song song = số chỗ runner (hiện 3); không giờ yên lặng    |
| Q5  | Báo cáo                                             | Hộp thư mỗi tối 21:00; chỉ "Cần tôi quyết định" mới đẩy thông báo                                         |
| Q6  | Trong lúc làm autopilot                             | Điều phối viên Claude Code tiếp tục chạy chuỗi DS hiện tại như bây giờ; chuyển giao sau AP6               |

## 9. Kế hoạch chi tiết (đã duyệt 04/11/2026)

Repo: `covuaduongsinh/duongsinh-studio` (WSL `~/code/duongsinh-studio`, nhánh `main`). Mọi đường dẫn dưới đây tính từ gốc repo.
Đọc trước khi làm: `AGENTS.md`, `.agents/rules/duongsinh-studio.md`, `docs/chenh-lech-upstream.md` (mục 11–21),
`docs/trien-khai-vps.md`, `docs/thuat-ngu.md`; mã hiện có: `server/git/service.ts` (`mergePullRequest`, `refreshPullRequest`,
`listPullRequests`, `syncDue`), `server/git/pull-state.ts` (`mergeBlockerOf`), `server/providers/git.ts` (poll 30 s, webhook),
`server/routes/webhooks.ts`, `server/routes/git.ts`, `server/providers/agent-actions.ts` (gate), `server/agents/{actions,
agent-instructions,project-manager-principles}.ts`, `server/providers/{agent-executor,issue-subject,project-manager}.ts`,
`server/releases/service.ts` (mẫu dùng thông báo hộp thư), `client/pages/projects/detail/*`, `client/pages/inbox.tsx`.

### AP1 — Phiếu review có cấu trúc (~1 ngày)

- **Migration** `database/main/migrations/2026110801_ds_reviews.ts` (tự chứa, có `down`): bảng `dsReviews`
  `{ id (uuid), pullRequestId (fk dsPullRequests.id, index), issueId, headSha, reviewerAgentId, reviewerRunId,
authorAgentId, verdict ('approve'|'changes'), mustFix int, shouldFix int, kind ('code'|'security'), sameModel bool,
checklist json, summary text, createdAt }`.
- **Dịch vụ** `server/reviews/service.ts`: `submit({ runId, pullRequestId, headSha, verdict, mustFix, shouldFix, kind,
checklist, summary })` kiểm: run đang chạy và là lượt **read-only** của agent khác tác giả (tác giả = agent của lượt đã
  push head, đọc từ `agRuns`/branches đã ghi; nếu không xác định được → từ chối); `headSha` = head hiện tại của PR (refresh
  trước); `kind='security'` bắt buộc `checklist.security` có đủ khoá. `latestFor(pullRequestId, headSha, kind)`.
- **Route** `server/routes/reviews.ts`: `POST /api/reviews` (run token, action `studio.reviews/submit`), `GET
/api/git/pullRequests/{id}/reviews` (người xem được issue). `describeRoute` để lên CLI: `ds-studio review submit`,
  `ds-studio review list`.
- **Business action** `studio.reviews/submit` trong `server/agents/actions.ts` (mặc định bật cho agent, gate chỉ cho phép khi
  `mode=read-only`).
- **Chỉ dẫn**: `agent-instructions.ts` (lượt review phải `ds-studio review submit` sau khi đăng comment); nguyên tắc trưởng
  nhóm (`project-manager-principles.ts`): coi phiếu là nguồn sự thật; Opus viết → giao một lượt Opus khác read-only
  (`sameModel=true`, Q3); PR chạm đường dẫn nhạy cảm → thêm lượt `kind=security` với checklist bảo mật (mục 4).
- **Test**: `tests/server/reviews.test.ts` (đúng lượt, sai head, tác giả tự review, thiếu checklist security, người thường
  bị từ chối), migration up/down/up.

### AP2 — Cài đặt tự lái + bộ đánh giá merge (~1,5 ngày)

- **Migration** `2026110802_ds_autopilot.ts`: `dsAutopilotSettings { projectId pk, enabled bool default false,
mergeMethod default 'squash', maxMergesPerDay int null (null = không giới hạn, Q4), maxActiveIssues int null (null = tổng
chỗ của runner online có thể nhận việc của project), stallMinutes int default 30, sensitivePaths json, sensitivePolicy
('extraReview'|'human') default 'extraReview', pausedReason text null, updatedAt, updatedById }`; `dsAutopilotEvents
{ id, projectId, issueId, pullRequestId, kind ('merged'|'skipped'|'opened'|'stalled'|'blocked'|'paused'), reason, data
json, createdAt }` (nhật ký, giữ 90 ngày).
- **Dịch vụ** `server/autopilot/evaluator.ts`: `evaluate(issueId)` trả `{ eligible, reasons[] }` theo đúng 7 điều kiện của
  mục 3.3 (dùng `refreshPullRequest`, `mergeBlockerOf`, `requiredChecks` của repo, `reviews.latestFor`, đường dẫn đổi của PR
  qua GitHub `pulls/{n}/files` có cache theo head sha, comment người sau phiếu review). `mergeIfEligible(issueId)`: gọi
  `mergePullRequest` với actor hệ thống `studio-autopilot` (một user hệ thống tạo bằng seed, không đăng nhập được), ghi
  `dsAutopilotEvents`, comment tiếng Việt trên issue + PR ("Autopilot đã merge vì …" kèm link phiếu, check, head sha).
- **Kích hoạt** `server/providers/autopilot.ts`: nghe sự kiện PR refresh/webhook (hook vào `git/service`), issue đổi trạng
  thái (projects status events), phiếu review mới; job scheduler quét mỗi 2 phút (cùng cơ chế job của `providers/git.ts`);
  khoá theo issue để không merge hai lần.
- **Route** `server/routes/autopilot.ts`: `GET/PUT /api/projects/{id}/autopilot` (quản trị project), `POST
/api/projects/{id}/autopilot/pause|resume` (người), `GET /api/autopilot/events?projectId=` (người xem project),
  `POST /api/autopilot/stop-all` (owner). Không cho run token.
- **Seed** `2026110803_ds_autopilot_user.ts`: user hệ thống `studio-autopilot`; vai trò đủ để merge qua `mergePullRequest`.
- **Test** `tests/server/autopilot-evaluator.test.ts`: một ca đúng + mỗi điều kiện sai một ca (thiếu phiếu, phiếu khác head,
  `changes`, mustFix>0, CI đỏ/pending, conflict/draft, `needsYou`, thiếu acceptance, comment người mới, project tắt/tạm dừng,
  đường dẫn nhạy cảm thiếu phiếu security, `sensitivePolicy=human`); merge chỉ một lần khi hai sự kiện đến cùng lúc.

### AP3 — Lập lịch việc kế tiếp (~1 ngày)

- **Cờ cho phép tự mở**: dùng trường mở rộng của issue nếu plugin projects hỗ trợ, nếu không thì bảng
  `dsAutopilotIssueFlags { issueId pk, allowAutoStart bool, inheritFromParent bool }` (migration `2026110804`). Epic có cờ thì
  issue con thừa hưởng. CLI: `ds-studio autopilot flag <issue> --allow` (người).
- `server/autopilot/scheduler.ts`: `openNext(projectId)` — lấy issue `backlog` có cờ, mọi `blocked-by` đã `done`, sắp theo
  priority rồi `createdAt`; mở tối đa `capacity − đang làm` (capacity = `maxActiveIssues` hoặc tổng `slots` runner online
  nhận được tool của agent); chuyển `in_progress` với executor trưởng nhóm agent; ghi event `opened`. Gọi khi issue `done`,
  khi bật autopilot, và trong lượt quét 2 phút.
- **Test** `tests/server/autopilot-scheduler.test.ts`: không mở việc còn bị chặn/không cờ/khác project; tôn trọng capacity;
  thứ tự đúng; không mở trùng.

### AP4 — Phát hiện đứng việc (~1 ngày)

- `server/autopilot/stall.ts`: issue `in_progress` của project bật tự lái, **không** có run `queued|dispatched|running` cho
  subject, hoạt động cuối (comment/run/PR) cũ hơn `stallMinutes` → `runs.enqueue` cho trưởng nhóm agent với input
  `{ trigger: 'autopilot.stalled', lastRun, lastSummary, hasPr, unpushedOn: [runner…] }` (đọc `workspaceUsage.unpushedCount`
  của runner); ghi event `stalled`. Đứng lần 2 liên tiếp (chưa có tiến triển giữa hai lần) → `blocked` + `needsYou` +
  thông báo hộp thư "Cần tôi quyết định".
- Nguyên tắc trưởng nhóm agent: khi nhận `autopilot.stalled` → yêu cầu agent push workspace còn dở trước (bài học DS-4), rồi
  giao lại bước còn thiếu.
- **Lượt lỗi do hạn mức** (`failureReason = toolQuota` hoặc tương tự): ghi nhận 03/11/2026 — 3 lượt cùng lỗi lúc 18:55 khi
  3 runner chạy song song trên một gói Claude Max và **không ai chạy lại suốt 9 giờ**. Autopilot phải: ghi event, chờ tới giờ
  hạn mức hồi (đọc từ thông báo lỗi nếu có, mặc định thử lại sau 30 phút, lùi dần tới 2 giờ), rồi `runs.retry`; trong lúc
  chờ, giảm số việc song song của project xuống 1 để không đốt hạn mức khi vừa hồi.
- **Test** `tests/server/autopilot-stall.test.ts` (gồm ca toolQuota: không retry ngay, retry sau thời gian chờ, giảm song song).

### AP5 — Giao diện, công tắc dừng, báo cáo tối (~1 ngày)

- Trang **Dự án → Cài đặt → Tự lái** (`client/pages/projects/detail/autopilot.tsx`): bật/tắt, tạm dừng kèm lý do, đường dẫn
  nhạy cảm, chính sách, `stallMinutes`, `maxActiveIssues`; bảng nhật ký event (đã merge / bỏ qua vì … / đã mở / đứng).
- Nút **Dừng tự lái toàn hệ thống** (owner) ở Cài đặt; huy hiệu "Tự lái" trên trang dự án và trên issue được tự mở.
- Issue: hiển thị "Vì sao chưa tự merge" (kết quả `evaluate`), lấy từ `GET /api/issues/{id}/autopilot`.
- **Báo cáo tối 21:00** (`server/autopilot/digest.ts`, job scheduler): gửi hộp thư cho owner + quản trị project: đã merge
  (PR, issue, reviewer, check), đang vướng + lý do, đứng việc; dùng cơ chế notification như `releases/service.ts`.
- i18n `vi-VN`/`en-US`/`zh-CN` theo `docs/thuat-ngu.md`; test client cho trang và nút dừng.

### AP6 — Thử thật và bật (~0,5 ngày)

1. Triển khai Studio lên production theo `docs/trien-khai-vps.md` (sao lưu DB trước).
2. **Sandbox**: tạo 3 issue nối nhau (blocked-by) có cờ tự mở trong project Sandbox, bật tự lái → chạy hết không cần người;
   thêm 1 PR cố ý làm đỏ CI (không được merge) và 1 PR chạm `database/` (phải có phiếu security). Ghi kết quả.
3. **Dương Sinh App**: đặt cờ tự mở cho epic DS-3 (thừa hưởng cho các issue con) và các issue DS còn lại; bật tự lái;
   theo dõi 1 vòng (ít nhất 1 issue merge + 1 issue tự mở) rồi bàn giao: điều phối viên Claude Code chỉ còn giám sát.
4. Cập nhật mục 10 "Tiến độ" của kế hoạch tổng và `docs/chenh-lech-upstream.md`.

### Cổng dừng (hỏi chủ dự án)

- Trước khi bật tự lái cho project nào ngoài Sandbox và Dương Sinh App.
- Nếu cần cấp thêm quyền GitHub App (vd. quyền mới cho merge) hoặc đổi cấu hình VPS.
