# Kế hoạch đợt T — Chắt lọc tinh hoa cho Dương Sinh Studio

Ngày 14/11/2026 · Người soạn: Claude, theo yêu cầu của Thầy Tường
Đối chiếu trên `main` = `7ba4e13` (PR tới #119) và báo cáo "10 repo tương tự Studio" (số liệu 11–13/11/2026).

## 0. Kết luận

Studio **không cần thay**. Trong 10 repo đã khảo sát, không sản phẩm nào có đủ bộ mà Studio đang có: cổng kiểm chứng
bắt buộc, review chéo khác model, tự merge, xem thử theo PR, phát hành Dokploy và vòng học từ lỗi. Nhưng có **8 ý hay
Studio chưa có**, và ba ý đầu đánh thẳng vào hai điều Thầy đang phàn nàn: chậm và khó tin kết quả.

1. **Phản ứng tự động theo sự kiện** (Agent Orchestrator). Hiện CI đỏ, PR xung đột hay review đòi sửa đều phải chờ
   Project manager chạy một lượt LLM hoặc chờ báo "đứng" sau 30 phút. Đổi thành quy tắc cứng, phản ứng trong ~1–2 phút.
2. **Kiểm chứng không tự báo** (LangChain, Spotify). Tiêu chí loại `test`/`command` vẫn do agent tự khai kết quả
   (`server/routes/verifications.ts`, nhánh `inputItem.result`). Đây là lỗ hổng H1e còn mở.
3. **Hàng rào ở GitHub** (claude-code-action, Codex, branch protection). Hiện mọi điều kiện merge chỉ nằm trong Studio;
   repo app không có branch protection. Studio sập hay lỗi thì không còn gì chặn.
4. **Bộ quy tắc đi theo repo** (Gas Town/Beads, Multica Skills). Skill, bài học, playbook đang nằm trong CSDL Studio,
   nên phiên Orca/Claude Code ngoài Studio không được hưởng.
5. **Kiểm giao diện bằng trình duyệt** (Open-Inspect).
6. **Việc định kỳ** (Paperclip routines, Multica autopilot).
7. **Thẻ "thay đổi gì" đọc được trên điện thoại** (Vibe Kanban).
8. **Siết runner** (OpenHands) ở mức vừa sức VPS, không dùng Docker cho từng lượt.

Kèm một việc không phải mã: **đối chứng với Paperclip** bằng bộ đo `ds-core` và **ghi rõ chính sách thuê bao**.

Tổng công ước ~14–16 ngày agent. Nếu chỉ làm phần lõi (T0–T3) thì ~6–7 ngày.

## 1. Đã có gì, còn thiếu gì

Cột "Studio hiện có" là thứ đã kiểm trong mã ở `7ba4e13`, không phải theo trí nhớ.

| Tinh hoa | Lấy từ | Studio hiện có | Còn thiếu | Bước |
| --- | --- | --- | --- | --- |
| Phản ứng theo sự kiện, có số lần thử và hạn leo thang | Agent Orchestrator | `Trigger` chỉ gồm `statusChange`, `assigned`, `comment`, `mention`, `unblocked` + `autopilot.stalled`; CI đỏ do PM đọc log (nguyên tắc PM) | Sự kiện `ciFailed`, `conflicts`, `reviewChanges`, `runFailed` đánh thức thẳng tác giả, kèm đuôi log; đếm lượt; quá hạn thì `needsYou` | T1 |
| Kiểm chứng trước khi được báo xong | LangChain, Spotify | `mayMove` cần verification `passed` đúng `headSha`; loại `ci` Studio tự đọc | `test`/`command` nhận `result` do agent khai; không bắt `exitCode`/`output`; không đối chiếu với CI | T2 |
| Hàng rào merge ở GitHub | claude-code-action, Codex, GitHub | Bộ đánh giá tự lái 7 điều kiện; "Merge anyway" có lý do | Branch protection/required checks trên repo app; kiểm tra "đã bật chưa" khi thiết lập dự án; tuỳ chọn auto-merge của GitHub | T3 |
| Review chạy trên máy của GitHub | claude-code-action, Codex | Review song song CI (V3.4) nhưng vẫn chiếm 1 suất runner 2,5 GiB | Workflow review trên Actions nộp phiếu về Studio (thử ở 1 repo) | T3c |
| Tri thức đi theo repo | Beads, Multica Skills | Ghi nhớ đã ở `.nb-studio/memory/`; skill có revision (H0); bài học vào Tri thức | Xuất skill/bài học/playbook/mẫu tiêu chí thành file trong repo app; nhập ngược | T4 |
| Kiểm UI bằng trình duyệt | Open-Inspect | Xem thử theo PR; "ảnh bàn giao" do agent tự chụp | Job CI chụp ảnh điện thoại + máy tính trên bản xem thử, là một tiêu chí `ci` | T5 |
| Việc định kỳ | Paperclip, Multica | Plugin scheduler đã cài; nhắc khoá CI | Bảng việc định kỳ sinh việc từ playbook | T6 |
| Xem thay đổi không cần mở GitHub | Vibe Kanban | Dòng thời gian (V2.2), link PR | Thẻ tóm tắt theo file, cờ đường dẫn nhạy cảm, ảnh trước/sau, 3 nút | T7 |
| Cách ly lượt chạy | OpenHands | Runner là user riêng `studio-runner` (uid 1002), `MemoryMax=2,5GiB`; đề xuất H3b chưa duyệt | Siết systemd, giới hạn mạng ra, test "runner không đọc được bí mật" | T8 |
| Ngân sách 80%/100% | Paperclip | **Đã có** (`server/budgets/service.ts`, `WARN_AT = 0.8`) | Không làm thêm | — |
| Squad leader / chia việc | Multica | **Đã có** (PM agent, Dự thảo AI) | Không làm thêm | — |
| Bí mật theo phạm vi | Paperclip | **Đã có** (V4.2) | Không làm thêm | — |
| App điện thoại | Multica | PWA + web push | Không làm APK | — |

## 2. Các bước

Quy ước chung như các đợt trước: mỗi bước một nhánh, một PR, CI xanh mới merge; test viết trước; route có
`auth.required()` + kiểm quyền + `apiValidator()` + `describeRoute()`; chuỗi ở `vi-VN.ts` trước rồi `en-US.ts`,
`zh-CN.ts`; migration tự chứa có `down`; mọi năng lực cấu hình được có bề mặt quản trị trong Cài đặt hệ thống; không
ghi production khi chủ dự án chưa bảo.

### T0 — Dọn và đo trước (~0,5 ngày)

- Sửa mục Tiến độ của kế hoạch V: V5, V6 đang để `[ ]` dù các bước con đã merge (#102–#116). Ghi rõ phần nào còn chờ
  chủ dự án.
- Chép báo cáo 10 repo và file này vào `docs/plans/research/2026-11-14/`.
- Chạy bộ đo `ds-core` (10 việc) **một lần lấy điểm chuẩn** trước khi sửa gì: tỉ lệ đạt, thời gian, token, số lần cần
  người. Không có số này thì không biết đợt T có ích hay không. Nếu runner VPS bận, chạy trên runner máy dev.
- Đo thêm ba con số nền của T1: thời gian từ CI đỏ đến lượt sửa bắt đầu; số lượt PM trên mỗi việc; tỉ lệ PR merge
  không cần người bấm (lấy từ `dsAutopilotEvents` và bảng runs của 14 ngày gần nhất).

Xong khi: bốn con số có trong nhật ký đợt T.

### T1 — Phản ứng tự động theo sự kiện (~2,5 ngày, giá trị cao nhất)

Ý tưởng lấy từ Agent Orchestrator: bảng quy tắc "sự kiện → hành động → số lần thử → hạn leo thang", chạy bằng mã,
không tốn lượt LLM của PM.

- Bảng `dsReactionRules` theo dự án (có mặc định toàn cục), và ghi vết vào `dsAutopilotEvents` (thêm `kind`).
- Sự kiện và mặc định:

| Sự kiện | Nguồn | Hành động | Thử tối đa | Quá hạn thì |
| --- | --- | --- | --- | --- |
| `ciFailed` | webhook `workflow_run`/`check_suite` → `pull.ciState = failed` | Đánh thức tác giả, kèm tên job hỏng + ~200 dòng cuối log; bỏ qua nếu nhánh gốc cũng hỏng đúng check đó (`referenceFailures`) | 2 | `blocked` + `needsYou` + thông báo đẩy |
| `conflicts` | `mergeability = conflicts` | Đánh thức tác giả: rebase lên nhánh gốc, chạy lại kiểm chứng | 1 | như trên |
| `reviewChanges` | phiếu review `verdict ≠ approve` | Đánh thức tác giả với danh sách must-fix; sửa xong tự gọi lại đúng reviewer cũ | 2 vòng | như trên |
| `runFailed` | lượt chạy kết thúc lỗi không phải `toolQuota`/`runnerDiskFull` | Chạy lại 1 lần; lần hai đổi agent theo nguyên tắc PM | 2 | như trên |
| `greenAndApproved` | đủ điều kiện bộ đánh giá | Tự lái bật: merge ngay (không chờ nhịp quét). Tự lái tắt: thông báo đẩy "sẵn sàng nghiệm thu" | — | — |

- Thêm giá trị vào `Trigger` (`ciFailed`, `conflicts`, `reviewChanges`, `runFailed`) và đi qua đúng đường `wake()` sẵn
  có, để ngân sách, giới hạn song song và hàng chờ vẫn áp dụng.
- Chống vòng lặp: đếm theo `(issueId, sự kiện, headSha)`; cùng `headSha` không phản ứng hai lần; tổng lượt tự sửa mỗi
  việc có trần (mặc định 5) rồi mới gọi người.
- Sửa nguyên tắc PM: PM không còn tự xử CI đỏ/xung đột; chỉ vào cuộc khi quy tắc đã leo thang.
- Giao diện: tab "Phản ứng" trong cài đặt Tự lái của dự án (bật/tắt từng dòng, số lần thử, phút leo thang); trên trang
  việc hiện một dòng "Studio đã tự gửi lỗi CI cho tác giả (lần 1/2)".

Xong khi: test có đủ 5 sự kiện, có test chống lặp; trên dự án thử, thời gian từ CI đỏ đến lượt sửa bắt đầu ≤ 2 phút.

### T2 — Kiểm chứng không tự báo (~1,5 ngày; đóng H1e)

- `ds-studio verify run <issue>`: CLI lấy **câu lệnh từ Studio** (theo tiêu chí đã chốt), tự chạy, tự ghi `exitCode`,
  đuôi `output`, `durationMs`, `headSha`, rồi nộp. Agent không gõ kết quả.
- Server: với `test`/`command`, từ chối bản nộp có `result` mà không có `exitCode`; `result` luôn suy ra từ
  `exitCode`. Bản nộp có `headSha` khác đầu nhánh thì không tính.
- Đối chiếu với CI: khi CI của cùng `headSha` đỏ, mọi verification `passed` của `headSha` đó chuyển `contradicted`
  và `mayMove` trả về sai. CI là trọng tài cuối.
- Phiếu review thêm mục bắt buộc "đã đối chiếu output kiểm chứng" (reviewer đọc được output qua
  `ds-studio verify show`).
- Cập nhật skill `ds-workflow`/`ds-development` (qua revision H0) để agent dùng lệnh mới.
- Tuỳ chọn, chỉ làm sau khi tra tài liệu Claude Code hiện hành: hook lúc kết thúc lượt (Stop hook) gọi
  `ds-studio verify run`. Nếu runner chạy headless không nạp hook của dự án thì bỏ, ghi lý do.

Xong khi: test 400 cho bản nộp thiếu `exitCode`; test `contradicted`; 0 verification `test/command` mới thiếu `exitCode`.

### T3 — Hàng rào ở GitHub (~2 ngày; T3c thêm ~1,5 ngày)

- **T3a. Required checks.** Khi thiết lập dự án và trong "Kiểm tra dự án": Studio đọc branch protection/ruleset của
  nhánh chính, báo đỏ nếu chưa bắt buộc check `ds-check` và chưa cấm đẩy thẳng. Mặc định Studio **không** tự bật (cần
  quyền Administration của GitHub App); thay vào đó in đúng 4 bước bấm cho chủ dự án và nút "Kiểm lại".
- **T3b. Auto-merge của GitHub (tuỳ chọn theo dự án).** Khi bộ đánh giá đạt mà CI còn đang chạy, Studio bật auto-merge
  trên PR thay vì chờ nhịp quét; GitHub merge ngay khi check xanh. Mặc định tắt; chỉ bật được khi T3a xanh.
- **T3c. Review trên Actions (thử ở một repo).** Mẫu workflow `ds-review.yml` dùng `anthropics/claude-code-action`
  (token từ `claude setup-token`, lưu ở secret của repo) hoặc Codex CLI; chạy khi PR mở/cập nhật, nộp phiếu về Studio
  bằng khoá hẹp chỉ có quyền `reviews/submit` của đúng App. Mục đích: giải phóng suất runner 2,5 GiB. Chỉ làm sau khi
  chủ dự án trả lời Q3; đọc lại điều khoản thuê bao trước khi bật.

Xong khi: dự án thử báo "Hàng rào GitHub: đạt"; test cho hai trạng thái có/không protection.

### T4 — Bộ quy tắc đi theo repo (~2 ngày)

- `ds-studio harness export --project <id>` và nút "Xuất bộ quy tắc vào repo": mở PR vào repo app, ghi vào
  `.nb-studio/harness/` (cạnh `.nb-studio/memory/` đã có): `skills/<tên>.md` (kèm số revision), `lessons.md` (các bài
  học đã duyệt của dự án), `playbooks/<tên>.md`, `criteria-template.md`.
- Thêm **một** file `.agents/rules/ds-harness.md` và một dòng trong bảng Index của `AGENTS.md` trỏ tới đó, để Orca,
  Claude Code hay bất kỳ công cụ nào đọc `AGENTS.md` đều theo cùng luật. Không ghi vào `.agents/skills/` (thư mục sinh
  tự động).
- Chiều ngược: bài học agent thêm vào `lessons.md` trong PR được nhập vào Studio ở trạng thái "chờ duyệt" khi PR merge,
  giống cách ghi nhớ đang làm.
- Chống lệch: file xuất có đầu trang `generated-by`, `revision`, `hash`; "Kiểm tra dự án" báo vàng khi bản trong repo
  cũ hơn Studio.
- Quét bí mật trên nội dung xuất bằng `server/security/secret-patterns.ts` trước khi mở PR.

Xong khi: xuất vào NocoFEN ra một PR sạch; `tests/project/agents-md.test.ts` của app vẫn xanh.

### T5 — Kiểm giao diện bằng trình duyệt (~1,5 ngày; sau T2)

- Mẫu job CI `ds-ui-smoke` (thêm vào mẫu workflow của app): Playwright mở bản xem thử của PR, đăng nhập bằng tài
  khoản thử, đi qua danh sách trang do việc khai báo, chụp ảnh ở 390×844 và 1280×800, đẩy artifact, đỏ khi có lỗi
  console hoặc trang trắng.
- Studio coi đó là tiêu chí loại `ci`; trang việc và báo cáo bàn giao hiện ảnh. Chạy trên Actions, không chạy trên
  runner VPS.
- Dữ liệu thử chỉ là dữ liệu giả; không trỏ vào production.

Xong khi: một PR giao diện của NocoFEN có ảnh hai cỡ màn hình ngay trên trang việc.

### T6 — Việc định kỳ (~1,5 ngày)

- Bảng `dsRoutines` (dự án, playbook hoặc mẫu việc, lịch, bật/tắt, lần chạy gần nhất) chạy bằng
  `@nocobase/app-plugin-scheduler` đã cài; đọc skill của plugin trước.
- Mỗi lần đến lịch: tạo một việc từ playbook, tôn trọng ngân sách và `maxActiveIssues`; việc cũ cùng loại chưa xong
  thì không tạo thêm.
- Mẫu có sẵn, **mặc định tắt**: kiểm phiên bản template mới (`!nang-template`) hằng tuần; quét giấy phép
  (`pnpm licenses list`, không `--prod`) hằng tuần; thử khôi phục bản sao lưu hằng tháng; rà bài học chờ duyệt hằng tuần.

Xong khi: bật một routine trên dự án thử, thấy việc sinh ra đúng lịch và có trong lịch sử thực thi.

### T7 — Thẻ "Thay đổi" trên trang việc (~1 ngày; sau T5)

- Một thẻ: số file, số dòng thêm/bớt, nhóm theo thư mục, cờ đỏ cho đường dẫn nhạy cảm (đã có danh sách ở bộ đánh
  giá), ảnh từ T5, kết quả kiểm chứng. Ba nút: Duyệt, Yêu cầu sửa (bình luận đánh thức tác giả), Mở trên GitHub.
- Không dựng trình xem diff đầy đủ.

### T8 — Siết runner (~1 ngày mã + việc của chủ dự án)

- Cập nhật `docs/runner-resource-limits-proposal.md` thành một drop-in systemd hoàn chỉnh: `MemoryHigh`,
  `NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths` chỉ thư mục làm việc và kho pnpm, `PrivateTmp`,
  `IPAddressDeny`/`IPAddressAllow` cho mạng nội bộ VPS (chặn runner gọi vào Dokploy, Postgres, Docker socket).
- Script `deploy/runner/audit.sh` chạy dưới user runner, đỏ khi đọc được: cấu hình/khoá của Studio, thư mục Dokploy,
  Docker socket, socket của daemon `ds-nb3-exec`, thư mục sao lưu.
- Chủ dự án áp dụng trên VPS. Không dùng Docker cho từng lượt (không đủ RAM).

### T9 — Đối chứng và chính sách (~0,5 ngày tài liệu; 2 tuần theo dõi)

- `docs/chinh-sach-thue-bao.md`: Studio dùng Claude Code/Codex thế nào (CLI chính hãng, trên máy và VPS của chủ dự
  án, cho việc của chính chủ dự án), giới hạn song song, và **đường lui**: mỗi agent có trường "nguồn" (thuê bao /
  API key / công cụ khác) để đổi mà không sửa mã. Theo báo cáo nghiên cứu, Anthropic đã siết việc dùng đăng nhập
  thuê bao trong sản phẩm bên thứ ba từ đầu 2026 và chạy tự động nhiều phiên là vùng xám; chủ dự án cần tự đọc trang
  Legal & Compliance của Claude Code và ghi ngày đọc vào tài liệu.
- Đối chứng: cài Paperclip (MIT) trên máy dev, chạy đúng 10 việc `ds-core`, so với điểm chuẩn T0. Chỉ cân nhắc chuyển
  khi Paperclip hơn rõ ở cả tỉ lệ đạt lẫn số lần cần người; nếu không, đóng câu hỏi "thay Studio" đến quý sau.

## 3. Thứ tự và công sức

| Thứ tự | Bước | Công (ngày agent) | Vì sao ở vị trí này |
| --- | --- | --- | --- |
| 1 | T0 | 0,5 | Có số nền mới biết có tiến bộ |
| 2 | T2 | 1,5 | Vá lỗ hổng tin cậy trước khi tăng tự động |
| 3 | T1 | 2,5 | Nhanh hơn rõ nhất; dựa vào kiểm chứng đã chắc |
| 4 | T3a, T3b | 2 | Hàng rào ngoài Studio |
| 5 | T4 | 2 | Orca và Studio dùng chung luật |
| 6 | T5 → T7 | 2,5 | Giao diện có bằng chứng, đọc được trên điện thoại |
| 7 | T6 | 1,5 | Tiện, không gấp |
| 8 | T8 | 1 | Cần chủ dự án thao tác VPS |
| song song | T9 | 0,5 + theo dõi | Không chặn bước nào |
| sau cùng | T3c | 1,5 | Chờ trả lời Q3 |

Không trộn với việc còn treo của đợt V (cài daemon, deploy V lên production, rclone): đó là việc của chủ dự án.

## 4. Thước đo thành công

| Con số | Trước (đo ở T0) | Mục tiêu sau T |
| --- | --- | --- |
| CI đỏ → lượt sửa bắt đầu | chưa đo (ước tới 30 phút khi chờ báo "đứng") | ≤ 2 phút |
| Lượt PM trên mỗi việc | chưa đo | giảm ≥ 30% |
| PR merge không cần người bấm | chưa đo | tăng, không kèm merge sai |
| Verification `test/command` thiếu `exitCode` | có | 0 |
| Điểm `ds-core` (tỉ lệ đạt, số lần cần người) | chưa có điểm chuẩn | không giảm; kỳ vọng tăng |

## 5. Không làm

- Không chuyển sang Paperclip/Multica lúc này; chỉ đối chứng.
- Không dựng sandbox Docker cho từng lượt trên VPS 2,5 GiB.
- Không làm APK/app gốc; PWA đủ dùng.
- Không làm tìm kiếm bằng embedding; không harness nào trong khảo sát dùng.
- Không làm sơ đồ tổ chức nhiều công ty, bầy 20–30 agent, hay hạ tầng phụ thuộc cloud riêng.
- Không dựng trình xem diff đầy đủ.
- Không tự cấp quyền Administration cho GitHub App khi chưa hỏi.

## 6. Câu hỏi cần Thầy chốt (có mặc định để không bị đứng)

| # | Câu hỏi | Mặc định nếu chưa trả lời |
| --- | --- | --- |
| Q1 | Số lượt tự sửa CI tối đa trước khi gọi người? | 2 lượt cho mỗi lần đẩy, trần 5 lượt mỗi việc |
| Q2 | Cho GitHub App quyền Administration để Studio tự bật branch protection? | Không; Studio in hướng dẫn và kiểm lại |
| Q3 | Thử review trên GitHub Actions ở một repo (token Claude/Codex nằm trong secret của repo)? | Hoãn tới khi T1–T4 xong |
| Q4 | Vị trí bộ quy tắc trong repo app? | `.nb-studio/harness/` + `.agents/rules/ds-harness.md` |
| Q5 | Việc định kỳ nào bật sẵn? | Tắt hết, Thầy bật tay |
| Q6 | Đối chứng với Paperclip hay Multica? | Paperclip (MIT), trên máy dev, 2 tuần |

## 7. Rủi ro

- **Vòng lặp tự sửa** đốt hạn mức thuê bao: đã có trần lượt, khoá theo `headSha`, và ngân sách sẵn có vẫn chặn.
- **Branch protection chặn chính Studio merge**: T3a phải kiểm cả việc GitHub App của Studio còn merge được.
- **File xuất lệch với Studio**: có `hash` và cảnh báo vàng; nguồn sự thật vẫn là Studio.
- **Ảnh chụp lộ dữ liệu thật**: T5 chỉ chạy trên bản xem thử với dữ liệu giả.
- **Chính sách thuê bao thay đổi**: T9 có đường lui theo từng agent.

## 8. Bổ sung 14/11 — tinh hoa từ DeepSeek Harness và Orca

Nguồn: trang GitHub của hai repo và các bài giới thiệu, đọc ngày 14/11/2026. Chưa đọc được `docs/architecture.md` của
DeepSeek Harness (yêu cầu truy cập chưa được duyệt), nên phần DSH dựa trên README và bài viết bên ngoài.

Hai repo này **khác tầng** với Studio. DeepSeek Harness (`dsh`) là bộ chạy của **một** agent (vòng lặp, công cụ, phiên,
sandbox), ngang hàng với Claude Code hay Codex. Orca là bàn làm việc trên máy để một người lái nhiều agent song song.
Studio là tầng trên cả hai: quản việc, kiểm chứng, merge, phát hành. Vì vậy không thay nhau, chỉ học ý.

### 8.1 Đã có gì, còn thiếu gì

| Tinh hoa | Lấy từ | Studio hiện có | Còn thiếu | Bước |
| --- | --- | --- | --- | --- |
| Bình luận theo dòng trên diff gửi thẳng cho agent | Orca | Bình luận trên việc đánh thức agent | Studio không nhận sự kiện bình luận review của GitHub (không có `pull_request_review_comment` trong mã) | T1 mở rộng |
| Chế độ chạy đặt sẵn (Standard, Code, Minimal, Creator) | DSH | PM tự phán đoán có cần approach, có cần review thêm | Không có "mức việc" chọn lúc tạo; việc nhỏ vẫn đi đủ quy trình | T10 |
| Nhật ký phiên chỉ ghi thêm: xem lại, tìm, tách nhánh, chạy tiếp | DSH (Trajectory) | Xem từng lượt chạy trên trang việc | Tìm xuyên các lượt, "chạy tiếp từ bước này", gắn một đoạn nhật ký vào bài học (cần kiểm lại mức hiện có) | T11 |
| Một đề bài, nhiều agent làm song song, chọn bản tốt nhất | Orca | Mỗi lúc một bước đổi mã; runner 1 suất | Bản rẻ: hai agent khác model cùng viết approach, PM chọn | T12 |
| Theo dõi hạn mức và giờ reset của từng công cụ | Orca | Có giảm tải khi hết hạn mức (`QuotaThrottleState`) | Thẻ hiển thị cho người: còn bao nhiêu, mấy giờ reset | T13 |
| Cấu hình chồng lớp và lệnh xem cấu hình hiệu lực (`--dump-config`) | DSH | Cài đặt rải ở Tự lái, Ngân sách, Skill, Phản ứng | Một trang "Cấu hình hiệu lực của dự án", ghi rõ mỗi giá trị lấy từ đâu | T13 |
| Bấm vào phần tử trên trang để gửi cho agent (Design Mode) | Orca | Xem thử theo PR | Nút góp ý ngay trên bản xem thử | T7b (tuỳ chọn) |
| Lịch tự động chạy trên nhiều repo | Orca | — | Việc định kỳ của T6 áp được cho nhiều dự án một lần | T6 mở rộng |
| Mọi thứ là plugin, gỡ ra không để lại rác | DSH (Cordis) | **Đã có** theo cách NocoBase (5 plugin + lớp Dương Sinh) | Không làm thêm | — |
| App điện thoại báo khi agent cần người | Orca | **Đã có** (PWA + thông báo đẩy) | Không làm thêm | — |
| Điều phối viên chia việc cho thợ | Orca | **Đã có** (Project manager) | Không làm thêm | — |

### 8.2 Các bước thêm

**T1 mở rộng — bình luận theo dòng (+0,5 ngày).** Thêm sự kiện `prLineComment`: khi chủ dự án bình luận vào một dòng
trên PR ở GitHub (kể cả từ app GitHub trên điện thoại), Studio gom các bình luận của cùng một lượt review, đánh thức
tác giả kèm đường dẫn file, số dòng và nội dung. Chỉ nhận bình luận của người có quyền trên dự án; bỏ qua bình luận
của bot và của chính agent.

**T10 — Mức việc (~1,5 ngày).** Khi tạo việc chọn một trong ba mức; mức quyết định quy trình bằng mã, không để PM đoán:

| Mức | Approach | Review | Kiểm chứng | Dùng khi |
| --- | --- | --- | --- | --- |
| Nhỏ | bỏ | 1 lượt, model nhanh | tiêu chí tối thiểu + CI | sửa chữ, sửa màu, lỗi một file |
| Chuẩn | khi PM thấy cần | 1 lượt khác model | đủ tiêu chí | mặc định |
| Nhạy cảm | bắt buộc | thêm lượt `security`, người duyệt cuối | đủ tiêu chí + ảnh giao diện | migration, quyền, CI, phụ thuộc |

Studio tự nâng mức khi PR chạm đường dẫn nhạy cảm, không bao giờ tự hạ. Mức mặc định theo dự án đặt trong cài đặt.

**T11 — Hồ sơ lượt chạy (~1,5 ngày; kiểm hiện trạng trước).** Tìm theo từ khoá xuyên các lượt của một việc và một dự
án; nút "Chạy tiếp từ bước này" (mở lượt mới mang theo bối cảnh tới bước đó); nút "Ghi thành bài học" đính kèm đoạn
nhật ký vào bài học của H2. Nếu plugin agents đã cung cấp phần nào thì dùng của plugin, không tự viết.

**T12 — Hai phương án cho việc khó (~1 ngày; sau T10).** Chỉ ở bước approach (chỉ đọc, rẻ): với việc mức Nhạy cảm
hoặc khi chủ dự án bật, hai agent khác nhà cung cấp cùng viết approach; PM so và chọn một, ghi lý do. Không chạy song
song phần đổi mã trên runner VPS.

**T13 — Thẻ Hạn mức và trang Cấu hình hiệu lực (~1 ngày).** Trang Hôm nay thêm thẻ "Hạn mức": mỗi công cụ còn bao
nhiêu, giờ reset, đang bị giảm tải hay không. Trong dự án thêm trang chỉ đọc "Cấu hình hiệu lực": Tự lái, Phản ứng,
Ngân sách, Mức việc, Skill, mỗi dòng ghi nguồn (mặc định hệ thống / dự án / việc).

**T7b — Góp ý trên bản xem thử (tuỳ chọn, ~1,5 ngày).** Một đoạn script chỉ nạp ở môi trường xem thử: bấm nút, chạm
vào phần tử, gõ góp ý; Studio nhận URL, selector, ảnh chụp và tạo bình luận trên việc. Không nạp ở production.

**T6 mở rộng (+0,25 ngày).** Một việc định kỳ chọn được nhiều dự án.

### 8.3 Thứ tự sau khi bổ sung

T0 → T2 → T1 (kèm `prLineComment`) → **T10** → T3a, T3b → T4 → T5 → T7 → **T13** → T6 → **T11** → **T12** → T8; T9 song
song; T3c và T7b sau cùng, chỉ khi chủ dự án bảo. T10 đứng sớm vì việc nhỏ chiếm phần lớn số việc và là chỗ tiết kiệm
thời gian rõ nhất sau T1.

Công thêm ~6 ngày agent (không tính T7b); tổng đợt T ~20–22 ngày, phần lõi T0–T3 + T10 ~8–9 ngày.

### 8.4 Thêm vào "Không làm"

- Không viết lại Studio trên Cordis hay DSH; không dùng DSH làm runner chính khi nó còn ở bản xem trước và báo trước sẽ
  có thay đổi phá tương thích. Có thể ghi DSH vào T9 như một nguồn model dự phòng để thử sau.
- Không cho agent tự viết và nạp plugin vào Studio lúc đang chạy (chế độ Creator của DSH).
- Không cho agent điều khiển máy tính (computer use) trên VPS.
- Không bỏ Orca: Orca vẫn là chỗ làm việc tay trên máy; T4 giúp Orca và Studio chung một bộ luật.

### 8.5 Câu hỏi thêm

| # | Câu hỏi | Mặc định |
| --- | --- | --- |
| Q7 | Mức việc mặc định của dự án mới? | Chuẩn |
| Q8 | Bật "hai phương án" cho mọi việc Nhạy cảm hay chỉ khi bấm? | Chỉ khi bấm |
| Q9 | Làm T7b (góp ý trên bản xem thử)? | Hoãn |

## Phụ lục — các repo đã khảo sát (số liệu 11–14/11/2026)

| Repo | Sao / fork | Giấy phép | Điểm đáng học |
| --- | --- | --- | --- |
| `paperclipai/paperclip` | ~113,3k / ~18,8k | MIT | Ngân sách, bí mật theo phạm vi, việc định kỳ, duyệt |
| `multica-ai/multica` | ~55,8k / ~7,4k | source-available | Squad leader, Skills, daemon, app điện thoại |
| `OpenHands/OpenHands` | ~92,6k / ~12,4k | MIT (lõi) | Sandbox Docker, ACP |
| `OrchestratorInc/agent-orchestrator` | 14.272 / 1.944 | Apache-2.0 | Mô hình "reactions" |
| `BloopAI/vibe-kanban` | 28.651 / 3.058 | Apache-2.0 | Giao diện xem diff (công ty đã đóng cửa 4/2026) |
| `anthropics/claude-code-action` | ~9,9k / ~2,3k | MIT | Agent trong GitHub Actions |
| `openai/codex` | ~135k / ~21,4k | Apache-2.0 | Reviewer khác model |
| `gastownhall/gastown` | ~18,8k / ~1,7k | MIT | Beads: bộ nhớ công việc nằm trong git |
| `ColeMurray/background-agents` | ~3,5k / ~507 | — | Sandbox có trình duyệt để kiểm UI |
| `terragon-labs/terragon-oss` | 261 / 42 | — | Bản chụp, không còn bảo trì |
| `deepseek-ai/deepseek-harness` | ~273k / ~33,2k (theo trang GitHub; các nguồn khác ghi số thấp hơn nhiều ở thời điểm sớm hơn) | MIT | Chế độ đặt sẵn, nhật ký phiên chỉ ghi thêm, cấu hình chồng lớp; bản xem trước |
| `stablyai/orca` | ~123,8k / ~7,8k | MIT | Bình luận theo dòng gửi agent, worktree song song, hạn mức, lịch tự động, Design Mode |
